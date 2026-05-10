"""Unit tests for tutor TTS routing."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers import tts


def test_full_harakat_short_drill_uses_elevenlabs_first(monkeypatch):
    """Arabic drill words now use ElevenLabs native multilingual voice first."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fake_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fake_elevenlabs)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="قَالَ",
        voice="arabic_male",
        language="ar",
        reading_mode="full_harakat",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert response.headers["X-NH-TTS-Voice"] == tts.ELEVENLABS_VOICE_MAP["arabic_male"]
    assert response.headers["X-NH-TTS-Language"] == "ar-SA"
    assert response.headers["X-NH-TTS-Reading-Mode"] == "full_harakat"
    assert "X-NH-TTS-Spoken-Text" not in response.headers
    assert calls == [f"elevenlabs:قَالَ:{tts.ELEVENLABS_VOICE_MAP['arabic_male']}"]

    cached_response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="قَالَ",
        voice="arabic_male",
        language="ar",
        reading_mode="full_harakat",
    )))
    assert cached_response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert cached_response.headers["X-NH-TTS-Cache"] == "hit"
    assert "X-NH-TTS-Spoken-Text" not in cached_response.headers


def test_full_harakat_short_drill_falls_back_after_elevenlabs_failure(monkeypatch):
    """If ElevenLabs is down, Arabic drill words fall back to Edge Saudi connected crop."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fail_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        raise tts.ElevenLabsUnavailable("elevenlabs down")

    async def fake_edge_full(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"edge-full:{text}:{voice}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fail_elevenlabs)
    monkeypatch.setattr(tts, "call_edge_tts_full_harakat_drill", fake_edge_full)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="قَالَ",
        voice="arabic_male",
        language="ar",
        reading_mode="full_harakat",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "edge"
    assert response.headers["X-NH-TTS-Voice"] == "ar-SA-HamedNeural"
    assert response.headers["X-NH-TTS-Spoken-Text"] == "edge-saudi-connected-crop"
    assert calls == [
        f"elevenlabs:قَالَ:{tts.ELEVENLABS_VOICE_MAP['arabic_male']}",
        "edge-full:قَالَ:ar-SA-HamedNeural",
    ]


def test_default_short_arabic_drill_uses_elevenlabs_first(monkeypatch):
    """Default Arabic drill mode uses ElevenLabs first."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fake_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fake_elevenlabs)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="قَالَ",
        voice="arabic_male",
        language="ar",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert response.headers["X-NH-TTS-Reading-Mode"] == "default"
    assert calls == [f"elevenlabs:قَالَ:{tts.ELEVENLABS_VOICE_MAP['arabic_male']}"]


def test_default_short_arabic_drill_falls_back_to_edge(monkeypatch):
    """If ElevenLabs fails, default Arabic drill falls back to Edge."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fail_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        raise tts.ElevenLabsUnavailable("elevenlabs down")

    async def fake_edge(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"edge:{text}:{voice}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fail_elevenlabs)
    monkeypatch.setattr(tts, "call_edge_tts", fake_edge)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="قَالَ",
        voice="arabic_male",
        language="ar",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "edge"
    assert response.headers["X-NH-TTS-Reading-Mode"] == "default"
    assert calls == [
        f"elevenlabs:قَالَ:{tts.ELEVENLABS_VOICE_MAP['arabic_male']}",
        "edge:قَالَ:ar-SA-HamedNeural",
    ]


def test_full_harakat_short_drill_falls_back_all_providers(monkeypatch):
    """If ElevenLabs and Edge Saudi are down, the exact Arabic text can still fall back."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fail_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        raise tts.ElevenLabsUnavailable("elevenlabs down")

    async def fail_edge(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"edge-full:{text}:{voice}")
        raise tts.EdgeUnavailable("edge down")

    async def fail_gemini(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"gemini:{text}:{voice}")
        raise tts.GeminiUnavailable("gemini down")

    async def fail_openai(text: str, voice: str, instructions: str | None) -> bytes:
        calls.append(f"openai:{text}")
        raise tts.HTTPException(status_code=503, detail="openai down")

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fail_elevenlabs)
    monkeypatch.setattr(tts, "call_edge_tts_full_harakat_drill", fail_edge)
    monkeypatch.setattr(tts, "_synthesize_gemini", fail_gemini)
    monkeypatch.setattr(tts, "_call_openai_tts_with_instructions", fail_openai)

    try:
        asyncio.run(tts.tutor_tts(tts.TTSRequest(
            text="قَالَ",
            voice="arabic_male",
            language="ar",
            reading_mode="full_harakat",
        )))
        raise AssertionError("Expected TTS failure")
    except tts.HTTPException as exc:
        assert exc.status_code == 503
    assert calls == [
        f"elevenlabs:قَالَ:{tts.ELEVENLABS_VOICE_MAP['arabic_male']}",
        "edge-full:قَالَ:ar-SA-HamedNeural",
        "gemini:قَالَ:Charon",
        "openai:قَالَ",
    ]


def test_long_arabic_text_uses_elevenlabs_first(monkeypatch):
    """Multi-word Arabic phrases use ElevenLabs first."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fake_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fake_elevenlabs)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        voice="arabic_female",
        language="ar",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert response.headers["X-NH-TTS-Voice"] == tts.ELEVENLABS_VOICE_MAP["arabic_female"]
    assert calls == [f"elevenlabs:بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ:{tts.ELEVENLABS_VOICE_MAP['arabic_female']}"]


def test_long_arabic_text_falls_back_to_edge_then_gemini(monkeypatch):
    """If ElevenLabs and Edge fail, long Arabic falls back to Gemini."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fail_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}")
        raise tts.ElevenLabsUnavailable("elevenlabs down")

    async def fail_edge(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"edge:{text}:{voice}")
        raise tts.EdgeUnavailable("edge down")

    async def fake_gemini(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"gemini:{text}:{voice}")
        return b"wav"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fail_elevenlabs)
    monkeypatch.setattr(tts, "call_edge_tts", fail_edge)
    monkeypatch.setattr(tts, "_synthesize_gemini", fake_gemini)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        voice="arabic_female",
        language="ar",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "gemini"
    assert response.headers["X-NH-TTS-Voice"] == "Kore"
    assert calls == [
        f"elevenlabs:بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ:{tts.ELEVENLABS_VOICE_MAP['arabic_female']}",
        "edge:بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ:ar-SA-ZariyahNeural",
        "gemini:بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ:Kore",
    ]


def test_english_content_uses_elevenlabs_first(monkeypatch):
    """English tutor prompts use ElevenLabs first."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fake_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}:{language_code}")
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fake_elevenlabs)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="Your turn to recite.",
        voice="english_male",
        language="en",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert response.headers["X-NH-TTS-Voice"] == tts.ELEVENLABS_VOICE_MAP["english_male"]
    assert calls == [f"elevenlabs:Your turn to recite.:{tts.ELEVENLABS_VOICE_MAP['english_male']}:en"]


def test_english_content_falls_back_to_gemini_after_elevenlabs_failure(monkeypatch):
    """Gemini remains the first English fallback if ElevenLabs is unavailable."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fail_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(f"elevenlabs:{text}:{voice_id}:{language_code}")
        raise tts.ElevenLabsUnavailable("elevenlabs down")

    async def fake_gemini(text: str, voice: str, slow: bool = False) -> bytes:
        calls.append(f"gemini:{text}:{voice}")
        return b"wav"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fail_elevenlabs)
    monkeypatch.setattr(tts, "_synthesize_gemini", fake_gemini)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="Your turn to recite.",
        voice="english_male",
        language="en",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "gemini"
    assert response.headers["X-NH-TTS-Voice"] == "Algenib"
    assert calls == [
        f"elevenlabs:Your turn to recite.:{tts.ELEVENLABS_VOICE_MAP['english_male']}:en",
        "gemini:Your turn to recite.:Algenib",
    ]


def test_professor_english_adds_live_class_welcome_and_uses_elevenlabs(monkeypatch):
    """Lesson narration sounds like a hosted class, not a bare sentence."""
    tts._tts_cache.clear()
    calls: list[str] = []

    async def fake_elevenlabs(text: str, voice_id: str, slow: bool = False, language_code: str | None = None) -> bytes:
        calls.append(text)
        return b"mp3"

    monkeypatch.setattr(tts, "call_elevenlabs_tts", fake_elevenlabs)

    response = asyncio.run(tts.tutor_tts(tts.TTSRequest(
        text="The lips touch gently for meem.",
        voice="english_male",
        language="en",
        delivery_style="professor",
    )))

    assert response.headers["X-NH-TTS-Provider"] == "elevenlabs"
    assert response.headers["X-NH-TTS-Delivery-Style"] == "professor"
    assert calls == [
        "Welcome to NoorHafiz class. Keep your microphone close, listen first, then repeat after me. The lips touch gently for meem. I will guide you step by step."
    ]
