"""
Tutor TTS endpoint using Google Gemini TTS.
Produces consistent voice every time (no browser speechSynthesis randomness).

Architecture:
  Frontend → POST /tts/tutor → this router → Gemini API → audio/wav → frontend

Voices mapped:
  - english_male   → Orus
  - english_female → Aoede
  - arabic_male    → Charon
  - arabic_female  → Kore

Model: gemini-3.1-flash-tts-preview (low-latency, natural)
Fallback: gemini-2.5-flash-preview-tts
"""
import os
import io
import tempfile
import struct
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/tts", tags=["tts"])

# Voice mapping: UI label → Gemini prebuilt voice name
VOICE_MAP = {
    "english_male": "Orus",
    "english_female": "Aoede",
    "arabic_male": "Charon",
    "arabic_female": "Kore",
    "default_male": "Orus",
    "default_female": "Aoede",
}

# Default voice for tutor
DEFAULT_VOICE = "Orus"

# Models to try in order
TTS_MODELS = [
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
]


class TTSRequest(BaseModel):
    text: str
    voice: str = "english_male"  # UI label
    language: str = "en"


def get_api_key() -> str:
    """Get Gemini API key from environment."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", "")
    if not key:
        # Try loading from secrets file
        secrets_path = os.path.expanduser("~/.config/openclaw/secrets.env")
        if os.path.exists(secrets_path):
            with open(secrets_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("GEMINI_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
                    elif line.startswith("GOOGLE_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
    return key


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Convert raw PCM (s16le) to WAV bytes in memory."""
    num_samples = len(pcm_data) // (bits_per_sample // 8)
    wav_buffer = io.BytesIO()

    # WAV header
    data_size = len(pcm_data)
    header_size = 44

    # RIFF header
    wav_buffer.write(b'RIFF')
    wav_buffer.write(struct.pack('<I', header_size + data_size - 8))  # file size - 8
    wav_buffer.write(b'WAVE')

    # fmt chunk
    wav_buffer.write(b'fmt ')
    wav_buffer.write(struct.pack('<I', 16))  # chunk size
    wav_buffer.write(struct.pack('<H', 1))   # PCM format
    wav_buffer.write(struct.pack('<H', channels))
    wav_buffer.write(struct.pack('<I', sample_rate))
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    wav_buffer.write(struct.pack('<I', byte_rate))
    block_align = channels * (bits_per_sample // 8)
    wav_buffer.write(struct.pack('<H', block_align))
    wav_buffer.write(struct.pack('<H', bits_per_sample))

    # data chunk
    wav_buffer.write(b'data')
    wav_buffer.write(struct.pack('<I', data_size))
    wav_buffer.write(pcm_data)

    return wav_buffer.getvalue()


async def call_gemini_tts(text: str, voice_name: str) -> bytes:
    """
    Call Gemini TTS API and return WAV audio bytes.
    Tries models in order, falls back if primary fails.
    """
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="TTS API key not configured")

    # Build request body
    body = {
        "model": TTS_MODELS[0],  # placeholder, overridden per attempt
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name
                    }
                }
            }
        }
    }

    last_error = None
    for model in TTS_MODELS:
        body["model"] = model
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    api_url,
                    json=body,
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                )

                if resp.status_code == 200:
                    data = resp.json()
                    audio_b64 = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("inlineData", {}).get("data", "")
                    if not audio_b64:
                        raise HTTPException(status_code=502, detail="No audio in TTS response")

                    import base64
                    pcm_bytes = base64.b64decode(audio_b64)
                    wav_bytes = pcm_to_wav(pcm_bytes)
                    return wav_bytes

                elif resp.status_code in (429, 500, 502, 503):
                    last_error = f"TTS model {model} returned {resp.status_code}"
                    continue  # try next model
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"TTS API error ({resp.status_code}): {resp.text[:200]}"
                    )
        except httpx.TimeoutException:
            last_error = f"TTS model {model} timed out"
            continue

    raise HTTPException(status_code=503, detail={
        "error": "tts_provider_unavailable",
        "message": "Tutor voice provider is temporarily unavailable or rate-limited",
        "provider": "gemini",
        "last_error": last_error,
    })


@router.get("/health")
async def tts_health():
    """Health check for tutor TTS configuration.

    Probes the Gemini models endpoint with a tiny GET so quota/billing/auth
    issues surface here instead of only on /tutor.
    """
    api_key = get_api_key()
    has_api_key = bool(api_key)
    base = {
        "ok": False,
        "provider": "gemini",
        "model": TTS_MODELS[0],
        "fallback_model": TTS_MODELS[1] if len(TTS_MODELS) > 1 else None,
        "has_api_key": has_api_key,
        "configured": has_api_key,
        "error": None,
    }

    if not has_api_key:
        base["error"] = "missing GEMINI_API_KEY"
        return base

    probe_url = f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODELS[0]}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(probe_url, headers={"x-goog-api-key": api_key})
        if resp.status_code == 200:
            base["ok"] = True
        elif resp.status_code in (401, 403):
            base["error"] = f"auth/permission denied ({resp.status_code})"
        elif resp.status_code == 404:
            base["error"] = f"model {TTS_MODELS[0]} not found for this account"
        elif resp.status_code == 429:
            base["error"] = "quota exceeded"
        else:
            base["error"] = f"probe HTTP {resp.status_code}"
    except httpx.TimeoutException:
        base["error"] = "probe timed out"
    except Exception as e:
        base["error"] = f"probe failed: {type(e).__name__}"

    return base


@router.post("/tutor")
async def tutor_tts(request: TTSRequest):
    """
    Generate tutor voice audio from text using Gemini TTS.
    Returns audio/wav with consistent voice.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    # Map UI voice label to Gemini voice name
    voice_name = VOICE_MAP.get(request.voice, DEFAULT_VOICE)

    # For Arabic language, ensure Arabic voice if using default
    if request.language == "ar" and request.voice.startswith("default"):
        voice_name = "Charon"

    wav_bytes = await call_gemini_tts(request.text, voice_name)

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=tutor.wav",
            "Cache-Control": "no-cache",
        },
    )


@router.get("/voices")
async def list_voices():
    """List available tutor voice options."""
    return {
        "voices": [
            {"id": "english_male", "label": "English Male", "gemini_voice": "Orus"},
            {"id": "english_female", "label": "English Female", "gemini_voice": "Aoede"},
            {"id": "arabic_male", "label": "Arabic Male", "gemini_voice": "Charon"},
            {"id": "arabic_female", "label": "Arabic Female", "gemini_voice": "Kore"},
        ],
        "default": "english_male",
    }
