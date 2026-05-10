"""
Tutor TTS endpoint with language-aware provider routing.

Architecture:
  Frontend → POST /tts/tutor → this router → provider chain → audio → frontend

Provider routing:
  - Arabic-dominant text (tajweed, Quran ayahs, single letters):
        ElevenLabs Adeeb → Edge TTS (native MSA) → Gemini → OpenAI
  - English-dominant text (tutor prompts, feedback):
        ElevenLabs → Gemini → OpenAI

Voice contract: ONE voice per request, chosen by the UI selection. The voice
never changes mid-utterance.

Voices:
  - english_male   → ElevenLabs Adam  | Gemini Algenib  | OpenAI onyx
  - english_female → ElevenLabs Aria  | Gemini Achernar | OpenAI nova
  - arabic_male    → ElevenLabs Adeeb (RjFuvnufLX42TYe37ekK) → Edge ar-SA-HamedNeural → Gemini Charon → OpenAI onyx
  - arabic_female  → ElevenLabs Aria  (XB0fDUnXU5powFXDhCwa) → Edge ar-SA-ZariyahNeural → Gemini Kore → OpenAI nova

Edge TTS uses Microsoft's free read-aloud endpoint — same Azure Neural voices,
no API key. Unofficial; treat as best-effort.

Models: gemini-2.5-flash-preview-tts → gemini-2.5-pro-preview-tts
"""
import asyncio
import hashlib
import json
import logging
import os
import io
import re
import struct
import subprocess
import tempfile
import time
from collections import OrderedDict
from pathlib import Path
from typing import List, Tuple

import edge_tts
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

logger = logging.getLogger("noorhafiz.tts")

router = APIRouter(prefix="/tts", tags=["tts"])



# Voice mapping: UI label → Gemini prebuilt voice name
VOICE_MAP = {
    "english_male": "Algenib",
    "english_female": "Achernar",
    "arabic_male": "Charon",
    "arabic_female": "Kore",
    "default_male": "Algenib",
    "default_female": "Achernar",
}

# Edge TTS voices for native Arabic. Saudi neural voices are the closest match
# for Quranic / MSA content. Gender is preserved across English ↔ Arabic
# routing (a child who picked "Female" should still hear a female voice when
# the tutor recites an ayah).
EDGE_VOICE_MAP = {
    "english_male": "ar-SA-HamedNeural",
    "english_female": "ar-SA-ZariyahNeural",
    "arabic_male": "ar-SA-HamedNeural",
    "arabic_female": "ar-SA-ZariyahNeural",
    "default_male": "ar-SA-HamedNeural",
    "default_female": "ar-SA-ZariyahNeural",
}

EDGE_PROFESSOR_VOICE_MAP = {
    "english_male": "en-US-BrianNeural",
    "english_female": "en-US-JennyNeural",
    "arabic_male": "en-US-BrianNeural",
    "arabic_female": "en-US-JennyNeural",
    "default_male": "en-US-BrianNeural",
    "default_female": "en-US-JennyNeural",
}

TTS_AUDIO_CACHE_DIR = Path(__file__).resolve().parents[2] / ".tts_audio_cache"
TTS_AUDIO_CACHE_VERSION = "elevenlabs-provider-v6"

# Default voice for tutor
DEFAULT_VOICE = "Algenib"

# Arabic Unicode blocks: Arabic, Supplement, Extended-A, Pres Forms-A/B.
_ARABIC_CHAR_RE = re.compile(
    r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]"
)
_FINAL_SHORT_HARAKAH_RE = re.compile(r"[\u064e\u064f\u0650\u064b\u064c\u064d]$")


def _dominant_language(text: str) -> str:
    """Return 'ar' if Arabic chars outnumber Latin letters, else 'en'.

    Used only to choose the delivery-style cue; never to swap voices.
    """
    if not text:
        return "en"
    arabic = sum(1 for ch in text if _ARABIC_CHAR_RE.match(ch))
    latin = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    return "ar" if arabic > latin else "en"


def _safe_header_value(value: str | None, limit: int = 200) -> str:
    """Return a compact HTTP-header-safe diagnostic string."""
    text = re.sub(r"[\r\n]+", " ", str(value or ""))
    return text.encode("latin-1", "ignore").decode("latin-1")[:limit]

# Models to try in order. Both are real Gemini 2.5 TTS preview models.
# `gemini-3.1-flash-tts-preview` was a typo and 404'd every call, wasting a
# round-trip on the primary before the real model picked up the request.
TTS_MODELS = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
]


# Gemini 2.5 TTS accepts a *short* style prefix ending with a colon
# ("Say slowly: ...") but rejects multi-sentence chat-style instructions
# with a 400 "model tried to generate text" error. The Arabic teacher cue
# we used to inject was being parsed as a chat prompt, breaking single-word
# drills. Now we keep the cue minimal — or skip it entirely for short
# input — so Gemini treats the request as pure TTS.
def _wrap_delivery(text: str, language: str, slow: bool = False) -> str:
    if language != "ar":
        return text  # English: prebuilt voice speaks naturally, no cue
    word_count = len(text.split())
    if word_count <= 3:
        # Short drill words / single letters — no cue at all so Gemini
        # synthesizes the tashkeel exactly as written. Adding any prefix
        # risks the 400-rejection seen on قَالَ / يَقُولُ.
        return text
    if slow:
        return f"Say slowly with each harakah pronounced: {text}"
    return f"Say clearly with full diacritics: {text}"




class TTSRequest(BaseModel):
    text: str
    voice: str = "english_male"  # UI label
    language: str = "en"
    slow: bool = False  # use slow articulation cue for Arabic drill words
    reading_mode: str = "default"  # "full_harakat" voices final short vowels
    delivery_style: str = "default"  # "professor" for lesson narration/coaching


def _read_secret(*names: str) -> str:
    """Look up an env var, then fall back to ~/.config/openclaw/secrets.env."""
    for name in names:
        v = os.environ.get(name, "")
        if v:
            return v
    secrets_path = os.path.expanduser("~/.config/openclaw/secrets.env")
    if not os.path.exists(secrets_path):
        return ""
    try:
        with open(secrets_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() in names:
                    return v.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def get_api_key() -> str:
    """Gemini API key (env first, secrets file second)."""
    return _read_secret("GEMINI_API_KEY", "GOOGLE_API_KEY")


def get_openai_key() -> str:
    """OpenAI API key — used only when Gemini is unavailable."""
    return _read_secret("OPENAI_API_KEY", "OPENAI_TUTOR_API_KEY")

def get_elevenlabs_key() -> str:
    """ElevenLabs API key for native multilingual Arabic TTS."""
    return _read_secret("ELEVENLABS_API_KEY")


ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
ELEVENLABS_SUBSCRIPTION_URL = "https://api.elevenlabs.io/v1/user/subscription"
ELEVENLABS_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
ELEVENLABS_MIN_REMAINING_CREDITS = int(os.environ.get("ELEVENLABS_MIN_REMAINING_CREDITS", "200"))
ELEVENLABS_FAILURE_COOLDOWN_SECONDS = int(os.environ.get("ELEVENLABS_FAILURE_COOLDOWN_SECONDS", "300"))
ELEVENLABS_MAX_CONCURRENCY = int(os.environ.get("ELEVENLABS_MAX_CONCURRENCY", "1"))
ELEVENLABS_429_RETRIES = int(os.environ.get("ELEVENLABS_429_RETRIES", "3"))

# Defaults use stable ElevenLabs pre-made multilingual voices.
# Override per-gender via env vars if you prefer a custom cloned voice.
ELEVENLABS_VOICE_MAP = {
    "english_male": os.environ.get("ELEVENLABS_ENGLISH_MALE_VOICE", "pNInz6obpgDQGcFmaJgB"),
    "english_female": os.environ.get("ELEVENLABS_ENGLISH_FEMALE_VOICE", "XB0fDUnXU5powFXDhCwa"),
    "arabic_male": os.environ.get("ELEVENLABS_ARABIC_MALE_VOICE", "RjFuvnufLX42TYe37ekK"),
    "arabic_female": os.environ.get("ELEVENLABS_ARABIC_FEMALE_VOICE", "XB0fDUnXU5powFXDhCwa"),
    "default_male": os.environ.get("ELEVENLABS_DEFAULT_MALE_VOICE", "pNInz6obpgDQGcFmaJgB"),
    "default_female": os.environ.get("ELEVENLABS_DEFAULT_FEMALE_VOICE", "XB0fDUnXU5powFXDhCwa"),
}



# OpenAI TTS — fallback when Gemini is down or quota-exhausted.
OPENAI_TTS_MODEL = "gpt-4o-mini-tts"
OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"
# OpenAI doesn't have native Arabic voices; nova/onyx are the most neutral and
# pronounce Arabic words with the least American twang. Used only when Gemini
# can't answer — accepted tradeoff vs. tutor going silent.
OPENAI_VOICE_MAP = {
    "english_male": "onyx",
    "english_female": "nova",
    "arabic_male": "onyx",
    "arabic_female": "nova",
    "default_male": "onyx",
    "default_female": "nova",
}


class GeminiUnavailable(Exception):
    """Signals Gemini failed in a way we should retry against OpenAI."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

class ElevenLabsUnavailable(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


_elevenlabs_blocked_until = 0.0
_elevenlabs_block_reason = ""
_elevenlabs_semaphore = asyncio.Semaphore(max(1, ELEVENLABS_MAX_CONCURRENCY))


def _block_elevenlabs_temporarily(reason: str) -> None:
    global _elevenlabs_blocked_until, _elevenlabs_block_reason
    _elevenlabs_blocked_until = time.monotonic() + ELEVENLABS_FAILURE_COOLDOWN_SECONDS
    _elevenlabs_block_reason = reason


# In-process LRU cache. Short prompts ("Your turn.", "Once more.") repeat
# constantly and don't need a fresh round-trip every time.
# Cache value: (audio_bytes, content_type, provider, voice_name, language)
_TTS_CACHE_MAX = 64
_TTS_CACHE_MAX_TEXT_LEN = 200  # don't cache long, unique sentences
_tts_cache: "OrderedDict[str, Tuple[bytes, str, str, str, str]]" = OrderedDict()


def _cache_key(text: str, user_voice_id: str, slow: bool = False, reading_mode: str = "default", delivery_style: str = "default") -> str:
    suffix = "|slow" if slow else ""
    mode_suffix = f"|mode={reading_mode}" if reading_mode != "default" else ""
    style_suffix = f"|style={delivery_style}" if delivery_style != "default" else ""
    return hashlib.sha1(f"{user_voice_id}|{text}{suffix}{mode_suffix}{style_suffix}".encode("utf-8")).hexdigest()


def _cache_get(text: str, user_voice_id: str, slow: bool = False, reading_mode: str = "default", delivery_style: str = "default") -> Tuple[bytes, str, str, str, str] | None:
    if len(text) > _TTS_CACHE_MAX_TEXT_LEN:
        return None
    key = _cache_key(text, user_voice_id, slow, reading_mode, delivery_style)
    if key not in _tts_cache:
        return None
    _tts_cache.move_to_end(key)
    return _tts_cache[key]


def _cache_put(text: str, user_voice_id: str, audio: bytes, content_type: str, provider: str, voice_name: str, language: str, slow: bool = False, reading_mode: str = "default", delivery_style: str = "default") -> None:
    if len(text) > _TTS_CACHE_MAX_TEXT_LEN:
        return
    key = _cache_key(text, user_voice_id, slow, reading_mode, delivery_style)
    _tts_cache[key] = (audio, content_type, provider, voice_name, language)
    _tts_cache.move_to_end(key)
    while len(_tts_cache) > _TTS_CACHE_MAX:
        _tts_cache.popitem(last=False)




async def call_elevenlabs_tts(
    text: str,
    voice_id: str,
    slow: bool = False,
    language_code: str | None = None,
) -> bytes:
    """Call ElevenLabs TTS and return MP3 bytes. Raises ElevenLabsUnavailable on failure."""
    api_key = get_elevenlabs_key()
    if not api_key:
        raise ElevenLabsUnavailable("missing ELEVENLABS_API_KEY")
    if _elevenlabs_blocked_until > time.monotonic():
        raise ElevenLabsUnavailable(f"ElevenLabs temporarily disabled: {_elevenlabs_block_reason}")

    url = f"{ELEVENLABS_TTS_URL}/{voice_id}"
    body = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.35 if slow else 0.5,
            "similarity_boost": 0.65 if slow else 0.75,
        },
    }
    if language_code:
        body["language_code"] = language_code
    try:
        async with _elevenlabs_semaphore:
            async with httpx.AsyncClient(timeout=30) as client:
                for attempt in range(ELEVENLABS_429_RETRIES + 1):
                    resp = await client.post(
                        url,
                        json=body,
                        headers={
                            "xi-api-key": api_key,
                            "Content-Type": "application/json",
                        },
                    )
                    if resp.status_code == 200:
                        return resp.content
                    if resp.status_code == 429 and attempt < ELEVENLABS_429_RETRIES:
                        retry_after = resp.headers.get("retry-after")
                        try:
                            delay = float(retry_after) if retry_after else 1.5
                        except ValueError:
                            delay = 1.5
                        await asyncio.sleep(min(max(delay, 0.5), 4.0))
                        continue
                    break

        try:
            detail = resp.json().get("detail", {})
            status = detail.get("status") if isinstance(detail, dict) else None
        except Exception:
            status = None
        if status == "quota_exceeded" or resp.status_code in (401, 403):
            _block_elevenlabs_temporarily(f"HTTP {resp.status_code} {status or ''}".strip())
        raise ElevenLabsUnavailable(
            f"ElevenLabs TTS error ({resp.status_code}): {resp.text[:200]}"
        )
    except httpx.TimeoutException:
        raise ElevenLabsUnavailable("ElevenLabs TTS timed out")
    except httpx.HTTPError as e:
        raise ElevenLabsUnavailable(f"ElevenLabs network error: {type(e).__name__}")

async def call_openai_tts(text: str, voice: str) -> bytes:
    """Call OpenAI TTS and return MP3 bytes. Raises HTTPException on hard failure."""
    api_key = get_openai_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI fallback not configured")

    body = {
        "model": OPENAI_TTS_MODEL,
        "voice": voice,
        "input": text,
        "response_format": "mp3",
        "instructions": (
            "Speak warmly and clearly, like a patient Quran teacher with a young "
            "child. Slow pace. Pause briefly at commas. Pronounce any Arabic "
            "words with care."
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                OPENAI_TTS_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code == 200:
            return resp.content
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI TTS error ({resp.status_code}): {resp.text[:200]}",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenAI TTS timed out")


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


async def call_gemini_tts(text: str, voice_name: str, language: str = "en", slow: bool = False) -> bytes:
    """
    Call Gemini TTS API and return WAV audio bytes.
    Tries models in order, falls back if primary fails.
    """
    api_key = get_api_key()
    if not api_key:
        raise GeminiUnavailable("missing GEMINI_API_KEY")

    styled_text = _wrap_delivery(text, language, slow=slow)

    # Build request body
    body = {
        "model": TTS_MODELS[0],  # placeholder, overridden per attempt
        "contents": [{"parts": [{"text": styled_text}]}],
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
                        last_error = f"TTS model {model} returned no audio"
                        continue

                    import base64
                    pcm_bytes = base64.b64decode(audio_b64)
                    return pcm_to_wav(pcm_bytes)

                # 401/403/404 → upstream config issue; treat as fallback-eligible
                # so a misconfigured Gemini account still lets OpenAI rescue us.
                last_error = f"TTS model {model} returned {resp.status_code}"
                continue
        except httpx.TimeoutException:
            last_error = f"TTS model {model} timed out"
            continue
        except httpx.HTTPError as e:
            last_error = f"TTS model {model} network error: {type(e).__name__}"
            continue

    raise GeminiUnavailable(last_error or "all Gemini models failed")


class EdgeUnavailable(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


async def call_edge_tts(text: str, voice: str, slow: bool = False, rate_override: str | None = None) -> bytes:
    """Synthesize MP3 via Microsoft Edge's free read-aloud endpoint.

    Uses Azure Neural voices natively — best Arabic quality available without
    a paid API key. Unofficial endpoint; raises EdgeUnavailable on failure so
    the caller can fall back to Gemini/OpenAI.

    The text is sent verbatim — no padding, no doubling. Edge's neural
    voice reads the word exactly as displayed. Final-harakah waqf is
    natural MSA pronunciation behavior at end-of-utterance.

    `slow=True` slows the rate ~25% for letter-by-letter pronunciation
    drills. Below ~-30% Edge's neural voices start sounding stretched.
    """
    rate = rate_override or ("-25%" if slow else "+0%")
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
        if not audio:
            raise EdgeUnavailable("edge-tts returned no audio")
        return bytes(audio)
    except EdgeUnavailable:
        raise
    except Exception as e:
        raise EdgeUnavailable(f"edge-tts {type(e).__name__}: {str(e)[:200]}")


def _needs_connected_harakat_crop(text: str) -> bool:
    return bool(_FINAL_SHORT_HARAKAH_RE.search(text.strip()))


async def call_edge_tts_full_harakat_drill(text: str, voice: str, slow: bool = False) -> bytes:
    """Use Edge Saudi connected speech, then crop before the helper syllable.

    Edge Saudi applies waqf on an isolated final harakah. By synthesizing
    `قَالَ لَ`, the first word is no longer phrase-final, so Hamed voices the
    final fatha. We then crop at the helper word boundary and keep only
    `قَالَ`.
    """
    if not _needs_connected_harakat_crop(text):
        return await call_edge_tts(text, voice, slow=slow)

    helper_text = f"{text} لَ"
    # Even "normal" full-harakat drill speed should be classroom-slow:
    # the learner is listening for exact harakat, not fluent recitation speed.
    rate = "-42%" if slow else "-18%"
    try:
        communicate = edge_tts.Communicate(helper_text, voice, rate=rate, boundary="WordBoundary")
        audio = bytearray()
        boundaries: list[dict] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                boundaries.append(chunk)
        if not audio:
            raise EdgeUnavailable("edge-tts returned no audio")
        if len(boundaries) < 2:
            return bytes(audio)

        crop_seconds = float(boundaries[-1]["offset"]) / 10_000_000.0
        if crop_seconds <= 0:
            return bytes(audio)

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as src:
            src.write(bytes(audio))
            src_path = src.name
        dst_path = f"{src_path}.crop.mp3"
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    src_path,
                    "-t",
                    f"{crop_seconds:.3f}",
                    "-codec:a",
                    "libmp3lame",
                    "-q:a",
                    "4",
                    dst_path,
                ],
                check=True,
                timeout=8,
            )
            with open(dst_path, "rb") as f:
                cropped = f.read()
            return cropped or bytes(audio)
        finally:
            for path in (src_path, dst_path):
                try:
                    os.unlink(path)
                except OSError:
                    pass
    except EdgeUnavailable:
        raise
    except Exception as e:
        raise EdgeUnavailable(f"edge-tts-connected-crop {type(e).__name__}: {str(e)[:200]}")


async def _probe_edge() -> dict:
    """Tiny synthesis probe — Edge has no public health endpoint, so we just
    try to synthesize a single character and confirm bytes come back."""
    out: dict = {
        "configured": True,  # no key needed
        "ok": False,
        "voices": list(set(EDGE_VOICE_MAP.values())),
        "error": None,
    }
    try:
        audio = await asyncio.wait_for(
            call_edge_tts("ا", "ar-SA-HamedNeural", slow=False),
            timeout=5,
        )
        out["ok"] = bool(audio)
        if not audio:
            out["error"] = "no audio returned"
    except asyncio.TimeoutError:
        out["error"] = "probe timed out"
    except EdgeUnavailable as e:
        out["error"] = e.message
    except Exception as e:
        out["error"] = f"probe failed: {type(e).__name__}"
    return out


async def _probe_gemini() -> dict:
    """Lightweight GET against Gemini's models endpoint."""
    api_key = get_api_key()
    out: dict = {
        "configured": bool(api_key),
        "model": TTS_MODELS[0],
        "fallback_model": TTS_MODELS[1] if len(TTS_MODELS) > 1 else None,
        "ok": False,
        "error": None,
    }
    if not api_key:
        out["error"] = "missing GEMINI_API_KEY"
        return out
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODELS[0]}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, headers={"x-goog-api-key": api_key})
        if resp.status_code == 200:
            out["ok"] = True
        elif resp.status_code in (401, 403):
            out["error"] = f"auth/permission denied ({resp.status_code})"
        elif resp.status_code == 404:
            out["error"] = f"model {TTS_MODELS[0]} not found for this account"
        elif resp.status_code == 429:
            out["error"] = "quota exceeded"
        else:
            out["error"] = f"probe HTTP {resp.status_code}"
    except httpx.TimeoutException:
        out["error"] = "probe timed out"
    except Exception as e:
        out["error"] = f"probe failed: {type(e).__name__}"
    return out




async def _probe_elevenlabs() -> dict:
    """Lightweight ElevenLabs health check.

    Use the subscription endpoint instead of a tiny TTS generation. A one-letter
    synthesis can succeed even when the account cannot afford a normal tutor
    sentence, which makes the Settings screen report a misleading active
    provider.
    """
    api_key = get_elevenlabs_key()
    out: dict = {
        "configured": bool(api_key),
        "model": ELEVENLABS_MODEL,
        "ok": False,
        "error": None,
        "remaining_credits": None,
    }
    if not api_key:
        out["error"] = "missing ELEVENLABS_API_KEY"
        return out
    if _elevenlabs_blocked_until > time.monotonic():
        out["error"] = f"temporarily disabled: {_elevenlabs_block_reason}"
        return out
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                ELEVENLABS_SUBSCRIPTION_URL,
                headers={"xi-api-key": api_key},
            )
        if resp.status_code == 200:
            data = resp.json()
            used = int(data.get("character_count") or 0)
            limit = int(data.get("character_limit") or 0)
            extension_raw = data.get("max_credit_limit_extension", 0)
            if extension_raw == "unlimited":
                remaining = 999_999_999
            else:
                extension = 0 if extension_raw is None else int(extension_raw or 0)
                remaining = max(0, limit + extension - used)
            out["remaining_credits"] = remaining
            out["tier"] = data.get("tier")
            out["status"] = data.get("status")
            if remaining >= ELEVENLABS_MIN_REMAINING_CREDITS:
                out["ok"] = True
            else:
                out["error"] = f"quota low/exceeded ({remaining} credits remaining)"
        elif resp.status_code in (401, 403):
            try:
                detail = resp.json().get("detail", {})
                status = detail.get("status") if isinstance(detail, dict) else None
            except Exception:
                status = None
            body = resp.text[:300]
            if status == "quota_exceeded" or "quota_exceeded" in body:
                out["error"] = "quota exceeded"
            elif status == "missing_permissions" or "missing_permissions" in body:
                out["ok"] = True
                out["warning"] = "missing user_read permission; quota cannot be checked"
            else:
                out["error"] = f"auth/permission denied ({resp.status_code})"
        elif resp.status_code == 429:
            out["error"] = "rate limited or quota exceeded"
        else:
            out["error"] = f"probe HTTP {resp.status_code}"
    except httpx.TimeoutException:
        out["error"] = "probe timed out"
    except Exception as e:
        out["error"] = f"probe failed: {type(e).__name__}"
    return out
async def _probe_openai() -> dict:
    """Lightweight HEAD-style probe against OpenAI's models endpoint."""
    api_key = get_openai_key()
    out: dict = {
        "configured": bool(api_key),
        "model": OPENAI_TTS_MODEL,
        "ok": False,
        "error": None,
    }
    if not api_key:
        out["error"] = "missing OPENAI_API_KEY"
        return out
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"https://api.openai.com/v1/models/{OPENAI_TTS_MODEL}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if resp.status_code == 200:
            out["ok"] = True
        elif resp.status_code in (401, 403):
            out["error"] = f"auth/permission denied ({resp.status_code})"
        elif resp.status_code == 404:
            out["error"] = f"model {OPENAI_TTS_MODEL} not available on this account"
        elif resp.status_code == 429:
            out["error"] = "quota exceeded"
        else:
            out["error"] = f"probe HTTP {resp.status_code}"
    except httpx.TimeoutException:
        out["error"] = "probe timed out"
    except Exception as e:
        out["error"] = f"probe failed: {type(e).__name__}"
    return out


@router.get("/health")
async def tts_health():
    """Reports all providers and which one answers next.

    `active_provider_arabic` and `active_provider_english` reflect the live
    routing decision per language. Edge is the preferred Arabic provider;
    Gemini is preferred for English; OpenAI is the universal fallback.
    """
    elevenlabs, edge, gemini, openai = await asyncio.gather(
        _probe_elevenlabs(), _probe_edge(), _probe_gemini(), _probe_openai()
    )

    if elevenlabs["ok"]:
        active_arabic = "elevenlabs"
    elif edge["ok"]:
        active_arabic = "edge"
    elif gemini["ok"]:
        active_arabic = "gemini"
    elif openai["ok"]:
        active_arabic = "openai"
    else:
        active_arabic = "none"

    if elevenlabs["ok"]:
        active_english = "elevenlabs"
    elif gemini["ok"]:
        active_english = "gemini"
    elif openai["ok"]:
        active_english = "openai"
    else:
        active_english = "none"

    return {
        "ok": active_arabic != "none" or active_english != "none",
        "active_provider_arabic": active_arabic,
        "active_provider_english": active_english,
        "elevenlabs": elevenlabs,
        "edge": edge,
        "gemini": gemini,
        "openai": openai,
        # Back-compat keys for the existing Settings UI
        "active_provider": active_english,
        "provider": "gemini",
        "model": gemini["model"],
        "fallback_model": gemini.get("fallback_model"),
        "has_api_key": gemini["configured"],
        "configured": gemini["configured"],
        "error": gemini["error"],
    }


async def _synthesize_gemini(text: str, user_voice: str, slow: bool = False) -> bytes:
    """Synthesize the whole utterance with one voice. Raises GeminiUnavailable on failure.

    The delivery-style cue is chosen by the dominant language of the text so an
    Arabic-heavy line gets Arabic teacher framing, but the voice itself is
    always the user's selection — no mid-sentence switching.
    """
    if not text.strip():
        raise GeminiUnavailable("no speakable text")
    cue_language = _dominant_language(text)
    return await call_gemini_tts(text, user_voice, language=cue_language, slow=slow)


def _slow_openai_instructions() -> str:
    """OpenAI TTS instructions for slow per-letter Arabic articulation."""
    return (
        "Speak this Arabic word VERY slowly, letter by letter, with clear "
        "articulation of each makhraj (point of articulation). Pause briefly "
        "between syllables. You are teaching pronunciation to a young child."
    )


def _full_harakat_openai_instructions(slow: bool = False) -> str:
    """OpenAI TTS instructions for Arabic drills that must not use waqf."""
    pace = "Speak slowly. " if slow else ""
    return (
        f"{pace}Speak the Arabic text exactly as written with FULL HARAKAT. "
        "Do not use waqf or pause-reading on the last letter. Pronounce the "
        "final short vowel if it is written. For example, قَالَ must end with "
        "the final fatha on لَ and sound like qaa-la, not qaal."
    )


def _professor_text(text: str) -> str:
    """Lesson narration wording: professional, clear, and child-appropriate."""
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return clean
    coaching_starters = (
        "mashaallah",
        "excellent",
        "very good",
        "well done",
        "good effort",
        "almost",
        "close",
        "listen",
        "slow",
        "welcome",
        "let's learn",
        "let us learn",
    )
    if clean.lower().startswith(coaching_starters):
        return clean
    return (
        "Welcome to NoorHafiz class. Keep your microphone close, listen first, "
        f"then repeat after me. {clean} I will guide you step by step."
    )


async def _call_openai_tts_with_instructions(text: str, voice: str, instructions: str | None) -> bytes:
    """OpenAI TTS with custom instructions string."""
    api_key = get_openai_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI fallback not configured")
    body = {
        "model": OPENAI_TTS_MODEL,
        "voice": voice,
        "input": text,
        "response_format": "mp3",
        "instructions": instructions or (
            "Speak warmly and clearly, like a patient Quran teacher with a "
            "young child. Slow pace. Pause briefly at commas. Pronounce any "
            "Arabic words with care."
        ),
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                OPENAI_TTS_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code == 200:
            return resp.content
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI TTS error ({resp.status_code}): {resp.text[:200]}",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OpenAI TTS timed out")


@router.post("/tutor")
async def tutor_tts(request: TTSRequest):
    """
    Generate tutor voice audio from text.

    Provider order:
      1. ElevenLabs for professional multilingual speech
      2. Edge for Arabic/professor fallbacks where it is useful
      3. Gemini
      4. OpenAI

    `slow=true` triggers a slow per-letter articulation cue (Arabic only),
    used for hard-word drill demos where pronunciation accuracy is critical.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    text = request.text.strip()
    user_voice_id = request.voice if request.voice in VOICE_MAP else "english_male"
    gemini_voice = VOICE_MAP[user_voice_id]
    slow = bool(request.slow)
    reading_mode = "full_harakat" if request.reading_mode == "full_harakat" else "default"
    full_harakat = reading_mode == "full_harakat"

    # Routing decisions:
    #   • English content → ElevenLabs → Gemini → OpenAI.
    #   • English professor lessons → ElevenLabs with classroom wording, then
    #     Edge professor voice, then Gemini/OpenAI.
    #   • Arabic content → ElevenLabs → Edge Saudi → Gemini → OpenAI.
    #     Edge's MSA voices apply waqf on isolated words, so it remains a
    #     fallback after ElevenLabs for full-harakat drills.
    is_arabic = (
        request.language == "ar"
        or _dominant_language(text) == "ar"
    )
    is_short_arabic_drill = is_arabic and len(text.split()) <= 3

    # Resolve the voices we'd use up-front so we can stamp them onto every
    # response (including cache hits) and the frontend can show the user
    # which actual voice was selected.
    edge_voice = EDGE_VOICE_MAP.get(user_voice_id, "ar-SA-HamedNeural")
    professor_voice = EDGE_PROFESSOR_VOICE_MAP.get(user_voice_id, "en-US-GuyNeural")
    openai_voice = OPENAI_VOICE_MAP.get(user_voice_id, "onyx")
    elevenlabs_voice = ELEVENLABS_VOICE_MAP.get(user_voice_id, "pNInz6obpgDQGcFmaJgB")
    declared_language = "ar-SA" if is_arabic else "en-US"
    delivery_style = "professor" if request.delivery_style == "professor" else "default"

    cached = _cache_get(text, user_voice_id, slow, reading_mode, delivery_style)
    if cached is not None:
        audio, ctype, provider, cached_voice, cached_lang = cached
        headers = {
            "Content-Disposition": f"inline; filename=tutor.{'mp3' if ctype == 'audio/mpeg' else 'wav'}",
            "Cache-Control": "no-cache",
            "X-NH-TTS-Provider": provider,
            "X-NH-TTS-Voice": cached_voice,
            "X-NH-TTS-Language": cached_lang,
            "X-NH-TTS-Cache": "hit",
            "X-NH-TTS-Slow": "1" if slow else "0",
            "X-NH-TTS-Reading-Mode": reading_mode,
            "X-NH-TTS-Delivery-Style": delivery_style,
        }
        if delivery_style == "professor" and cached_lang == "en-US":
            headers["X-NH-TTS-Spoken-Text"] = _safe_header_value(_professor_text(text), limit=500)
        elif provider == "edge" and reading_mode == "full_harakat" and cached_lang.startswith("ar") and _needs_connected_harakat_crop(text):
            headers["X-NH-TTS-Spoken-Text"] = "edge-saudi-connected-crop"
        return Response(
            content=audio,
            media_type=ctype,
            headers=headers,
        )

    elevenlabs_err: str | None = None
    edge_err: str | None = None
    gemini_first_err: str | None = None

    if not is_arabic:
        elevenlabs_text = _professor_text(text) if delivery_style == "professor" else text
        try:
            mp3_bytes = await call_elevenlabs_tts(
                elevenlabs_text,
                elevenlabs_voice,
                slow=slow or delivery_style == "professor",
                language_code="en",
            )
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "elevenlabs", elevenlabs_voice, "en-US", slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "elevenlabs",
                "X-NH-TTS-Voice": elevenlabs_voice,
                "X-NH-TTS-Language": "en-US",
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            if delivery_style == "professor":
                headers["X-NH-TTS-Spoken-Text"] = _safe_header_value(elevenlabs_text, limit=500)
            return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
        except ElevenLabsUnavailable as e:
            elevenlabs_err = e.message

    if delivery_style == "professor" and not is_arabic:
        try:
            professor_spoken_text = _professor_text(text)
            mp3_bytes = await call_edge_tts(professor_spoken_text, professor_voice, slow=slow, rate_override="-10%")
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "edge", professor_voice, "en-US", slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "edge",
                "X-NH-TTS-Voice": professor_voice,
                "X-NH-TTS-Language": "en-US",
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
                "X-NH-TTS-Spoken-Text": _safe_header_value(professor_spoken_text, limit=500),
            }
            if elevenlabs_err:
                headers["X-NH-TTS-ElevenLabs-Error"] = _safe_header_value(elevenlabs_err)
            return Response(
                content=mp3_bytes,
                media_type="audio/mpeg",
                headers=headers,
            )
        except EdgeUnavailable as e:
            edge_err = e.message

    # Arabic drill words / letters: ElevenLabs native multilingual first,
    # then Edge Saudi, then Gemini, then OpenAI.
    if is_short_arabic_drill:
        try:
            mp3_bytes = await call_elevenlabs_tts(text, elevenlabs_voice, slow=slow, language_code="ar")
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "elevenlabs", elevenlabs_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "elevenlabs",
                "X-NH-TTS-Voice": elevenlabs_voice,
                "X-NH-TTS-Language": declared_language,
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
        except ElevenLabsUnavailable as e:
            elevenlabs_err = e.message

        try:
            mp3_bytes = await call_edge_tts_full_harakat_drill(text, edge_voice, slow=slow) if full_harakat else await call_edge_tts(text, edge_voice, slow=slow)
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "edge", edge_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "edge",
                "X-NH-TTS-Voice": edge_voice,
                "X-NH-TTS-Language": declared_language,
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            if full_harakat and _needs_connected_harakat_crop(text):
                headers["X-NH-TTS-Spoken-Text"] = "edge-saudi-connected-crop"
            return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
        except EdgeUnavailable as e:
            edge_err = e.message  # fall through to Gemini/OpenAI

    # Long Arabic (ayahs) stays on Edge first; short Arabic falls through
    # here only if Edge already failed.
    if is_arabic and not is_short_arabic_drill:
        try:
            mp3_bytes = await call_elevenlabs_tts(text, elevenlabs_voice, slow=slow, language_code="ar")
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "elevenlabs", elevenlabs_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "elevenlabs",
                "X-NH-TTS-Voice": elevenlabs_voice,
                "X-NH-TTS-Language": declared_language,
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            if elevenlabs_err:
                headers["X-NH-TTS-ElevenLabs-Error"] = _safe_header_value(elevenlabs_err)
            if gemini_first_err:
                headers["X-NH-TTS-Gemini-Error"] = _safe_header_value(gemini_first_err)
            return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
        except ElevenLabsUnavailable as e:
            elevenlabs_err = e.message

        try:
            mp3_bytes = await call_edge_tts(text, edge_voice, slow=slow)
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "edge", edge_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.mp3",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "edge",
                "X-NH-TTS-Voice": edge_voice,
                "X-NH-TTS-Language": declared_language,
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            if elevenlabs_err:
                headers["X-NH-TTS-ElevenLabs-Error"] = _safe_header_value(elevenlabs_err)
            if gemini_first_err:
                headers["X-NH-TTS-Gemini-Error"] = _safe_header_value(gemini_first_err)
            return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
        except EdgeUnavailable as e:
            edge_err = e.message  # fall through to Gemini (or OpenAI if Gemini also failed)
    # Final Gemini attempt — skipped if Gemini already failed earlier in the
    # short-Arabic-drill path so we don't waste a round-trip on the same
    # outage. English content always reaches here as its first attempt.
    final_gemini_err: str | None = gemini_first_err
    if not gemini_first_err:
        try:
            audio_bytes = await _synthesize_gemini(text, gemini_voice, slow=slow)
            _cache_put(text, user_voice_id, audio_bytes, "audio/wav", "gemini", gemini_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
            headers = {
                "Content-Disposition": "inline; filename=tutor.wav",
                "Cache-Control": "no-cache",
                "X-NH-TTS-Provider": "gemini",
                "X-NH-TTS-Voice": gemini_voice,
                "X-NH-TTS-Language": declared_language,
                "X-NH-TTS-Cache": "miss",
                "X-NH-TTS-Slow": "1" if slow else "0",
                "X-NH-TTS-Reading-Mode": reading_mode,
                "X-NH-TTS-Delivery-Style": delivery_style,
            }
            if elevenlabs_err:
                headers["X-NH-TTS-ElevenLabs-Error"] = _safe_header_value(elevenlabs_err)
            if edge_err:
                headers["X-NH-TTS-Edge-Error"] = _safe_header_value(edge_err)
            return Response(content=audio_bytes, media_type="audio/wav", headers=headers)
        except GeminiUnavailable as e:
            final_gemini_err = e.message

    # OpenAI is the preferred full-harakat fallback because it can receive
    # explicit "no waqf" instructions while keeping the Arabic input exact.
    instructions = _full_harakat_openai_instructions(slow=slow) if full_harakat else (_slow_openai_instructions() if slow else None)
    try:
        mp3_bytes = await _call_openai_tts_with_instructions(text, openai_voice, instructions)
        _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "openai", openai_voice, declared_language, slow=slow, reading_mode=reading_mode, delivery_style=delivery_style)
        headers = {
            "Content-Disposition": "inline; filename=tutor.mp3",
            "Cache-Control": "no-cache",
            "X-NH-TTS-Provider": "openai",
            "X-NH-TTS-Voice": openai_voice,
            "X-NH-TTS-Language": declared_language,
            "X-NH-TTS-Cache": "miss",
            "X-NH-TTS-Gemini-Error": _safe_header_value(final_gemini_err),
            "X-NH-TTS-Slow": "1" if slow else "0",
            "X-NH-TTS-Reading-Mode": reading_mode,
            "X-NH-TTS-Delivery-Style": delivery_style,
        }
        if edge_err:
            headers["X-NH-TTS-Edge-Error"] = _safe_header_value(edge_err)
        if elevenlabs_err:
            headers["X-NH-TTS-ElevenLabs-Error"] = _safe_header_value(elevenlabs_err)
        return Response(content=mp3_bytes, media_type="audio/mpeg", headers=headers)
    except HTTPException as openai_exc:
        openai_err = _safe_header_value(str(openai_exc.detail))

    raise HTTPException(status_code=503, detail={
        "error": "tts_all_providers_failed",
        "message": "All TTS providers are unavailable",
        "elevenlabs_error": elevenlabs_err,
        "edge_error": edge_err,
        "gemini_error": final_gemini_err,
        "openai_error": openai_err,
    })


def _audio_file_key(request: TTSRequest) -> str:
    payload = {
        "version": TTS_AUDIO_CACHE_VERSION,
        "text": request.text.strip(),
        "voice": request.voice,
        "language": request.language,
        "slow": bool(request.slow),
        "reading_mode": request.reading_mode,
        "delivery_style": request.delivery_style,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _response_debug(headers) -> dict:
    return {
        "provider": headers.get("x-nh-tts-provider", "unknown"),
        "voice": headers.get("x-nh-tts-voice", ""),
        "language": headers.get("x-nh-tts-language", ""),
        "reading_mode": headers.get("x-nh-tts-reading-mode", "default"),
        "delivery_style": headers.get("x-nh-tts-delivery-style", "default"),
        "spoken_text": headers.get("x-nh-tts-spoken-text"),
    }


@router.post("/audio/prepare")
async def prepare_tts_audio(request: TTSRequest):
    """Generate a durable cached audio file and return a URL for playback.

    Lesson UI uses this to prepare clips ahead of time, then plays the generated
    file instead of invoking live browser speech synthesis or on-click TTS.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    TTS_AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _audio_file_key(request)
    meta_path = TTS_AUDIO_CACHE_DIR / f"{key}.json"

    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            audio_path = TTS_AUDIO_CACHE_DIR / meta["filename"]
            if audio_path.exists():
                return {**meta, "cached": True}
        except (OSError, KeyError, json.JSONDecodeError):
            pass

    response = await tutor_tts(request)
    body = response.body
    content_type = response.media_type or response.headers.get("content-type", "audio/mpeg")
    ext = "wav" if content_type == "audio/wav" else "mp3"
    filename = f"{key}.{ext}"
    audio_path = TTS_AUDIO_CACHE_DIR / filename
    audio_path.write_bytes(body)

    debug = _response_debug(response.headers)
    meta = {
        "ok": True,
        "key": key,
        "filename": filename,
        "url": f"/tts/audio/{filename}",
        "content_type": content_type,
        "text": request.text.strip(),
        "voice": request.voice,
        "slow": bool(request.slow),
        "cached": False,
        **debug,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


@router.get("/audio/{filename}")
async def get_tts_audio(filename: str):
    if not re.fullmatch(r"[a-f0-9]{40}\.(mp3|wav)", filename):
        raise HTTPException(status_code=404, detail="Audio not found")
    path = TTS_AUDIO_CACHE_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    media_type = "audio/wav" if filename.endswith(".wav") else "audio/mpeg"
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/voices")
async def list_voices():
    """List available tutor voice options. ElevenLabs is the primary spoken
    voice provider; Gemini, Edge, and OpenAI remain fallbacks depending on
    language and outage mode."""
    return {
        "voices": [
            {
                "id": "english_male",
                "label": "Male",
                "gemini_voice": "Algenib",
                "edge_voice": "ar-SA-HamedNeural",
                "elevenlabs_voice": ELEVENLABS_VOICE_MAP["english_male"],
            },
            {
                "id": "english_female",
                "label": "Female",
                "gemini_voice": "Achernar",
                "edge_voice": "ar-SA-ZariyahNeural",
                "elevenlabs_voice": ELEVENLABS_VOICE_MAP["english_female"],
            },
            {
                "id": "arabic_male",
                "label": "Arabic Male",
                "gemini_voice": "Charon",
                "edge_voice": "ar-SA-HamedNeural",
                "elevenlabs_voice": ELEVENLABS_VOICE_MAP["arabic_male"],
            },
            {
                "id": "arabic_female",
                "label": "Arabic Female",
                "gemini_voice": "Kore",
                "edge_voice": "ar-SA-ZariyahNeural",
                "elevenlabs_voice": ELEVENLABS_VOICE_MAP["arabic_female"],
            },
        ],
        "default": "english_male",
    }


class PrewarmEntry(BaseModel):
    text: str
    voice: str = "english_male"
    slow: bool = False


class PrewarmRequest(BaseModel):
    entries: List[PrewarmEntry]


async def _prewarm_one(entry: PrewarmEntry) -> str:
    """Synthesize and cache one entry. Returns 'hit' | 'miss' | 'skip' | 'error'."""
    text = (entry.text or "").strip()
    if not text:
        return "skip"
    user_voice_id = entry.voice if entry.voice in VOICE_MAP else "english_male"
    slow = bool(entry.slow)
    if _cache_get(text, user_voice_id, slow) is not None:
        return "hit"

    is_ar = _dominant_language(text) == "ar"
    declared_language = "ar-SA" if is_ar else "en-US"

    elevenlabs_voice = ELEVENLABS_VOICE_MAP.get(user_voice_id, "pNInz6obpgDQGcFmaJgB")
    try:
        mp3_bytes = await call_elevenlabs_tts(text, elevenlabs_voice, slow=slow, language_code="ar" if is_ar else "en")
        _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "elevenlabs", elevenlabs_voice, declared_language, slow=slow)
        return "miss"
    except ElevenLabsUnavailable:
        pass

    if is_ar:

        edge_voice = EDGE_VOICE_MAP.get(user_voice_id, "ar-SA-HamedNeural")
        try:
            mp3_bytes = await call_edge_tts(text, edge_voice, slow=slow)
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "edge", edge_voice, declared_language, slow=slow)
            return "miss"
        except EdgeUnavailable:
            pass  # fall through to Gemini

    gemini_voice = VOICE_MAP[user_voice_id]
    try:
        audio_bytes = await _synthesize_gemini(text, gemini_voice, slow=slow)
        _cache_put(text, user_voice_id, audio_bytes, "audio/wav", "gemini", gemini_voice, declared_language, slow=slow)
        return "miss"
    except GeminiUnavailable:
        openai_voice = OPENAI_VOICE_MAP.get(user_voice_id, "onyx")
        instructions = _slow_openai_instructions() if slow else None
        try:
            mp3_bytes = await _call_openai_tts_with_instructions(text, openai_voice, instructions)
            _cache_put(text, user_voice_id, mp3_bytes, "audio/mpeg", "openai", openai_voice, declared_language, slow=slow)
            return "miss"
        except HTTPException:
            return "error"


@router.post("/prewarm")
async def tts_prewarm(request: PrewarmRequest):
    """Warm the TTS cache for a batch of (text, voice) entries in parallel.

    Used by the frontend at session start to pre-synthesize the most common
    feedback templates so playback at feedback time is an instant cache hit
    instead of a 1–3s round-trip.

    No audio is returned — only counts of cache hits, misses, skips, errors.
    """
    entries = request.entries[:32]  # bound the fan-out
    if not entries:
        return {"ok": True, "hit": 0, "miss": 0, "skip": 0, "error": 0, "total": 0}

    results = await asyncio.gather(*(_prewarm_one(e) for e in entries))
    counts = {"hit": 0, "miss": 0, "skip": 0, "error": 0}
    for r in results:
        counts[r] = counts.get(r, 0) + 1
    counts["total"] = len(entries)
    counts["ok"] = True
    return counts
