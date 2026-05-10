import os
import re
import time
import asyncio
import tempfile
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child, PracticeSession, Mastery, TutorMemoryEvent
from app.auth import get_current_user
from app.routers.quran import get_ayah

router = APIRouter(prefix="/recite", tags=["recite"])

logger = logging.getLogger("noorhafiz.recite")

# Global cached Whisper model — loaded once, reused across requests
_whisper_model = None

# Configurable Whisper model via environment variable
# Options: tiny, base, small, medium, large
# Default: tiny (fast, Pi-friendly)
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL", "tiny")


# Bismillah header tokens (normalized, no diacritics) — for Ayah 1 of non-Fatiha,
# non-Tawbah surahs the unnumbered Bismillah header is stripped from the child's
# display, so words from it shouldn't be picked as good_word or hard_word.
_BISMILLAH_HEADER_TOKENS = {"بسم", "الرحمن", "الرحيم"}


def _normalize_bismillah_token(word: str) -> str:
    """Loose normalization to match Bismillah-header words regardless of diacritics."""
    if not word:
        return ""
    # Strip Arabic diacritics, tatweel
    cleaned = re.sub(r"[ً-ْٰۖ-ۭـ]", "", word)
    # Normalize alef variants
    cleaned = re.sub(r"[آأإٱ]", "ا", cleaned)
    return cleaned.strip()


def _looks_like_bismillah_header(words: list[str], surah: int, ayah: int) -> bool:
    """At least two of {بسم, الرحمن, الرحيم} together → header was scored."""
    if surah == 1 or surah == 9 or ayah != 1:
        return False
    matches = sum(1 for w in words if _normalize_bismillah_token(w) in _BISMILLAH_HEADER_TOKENS)
    return matches >= 2


def _filter_bismillah_tokens(words: list[str], surah: int, ayah: int) -> list[str]:
    if not _looks_like_bismillah_header(words, surah, ayah):
        return words
    return [w for w in words if _normalize_bismillah_token(w) not in _BISMILLAH_HEADER_TOKENS]


# Known Bismillah variants from different Quran text sources (longest first).
_BISMILLAH_VARIANTS = [
    # Uthmani with U+06E1 small high meem, U+06CC farsi yeh (alquran.cloud / Tanzil)
    "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ",
    # Standard diacritized with U+0652 sukun
    "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
    "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    # Without diacritics
    "بسم الله الرحمن الرحيم",
    "بسم ٱلله ٱلرحمن ٱلرحيم",
]


def _should_strip_bismillah(surah: int, ayah: int) -> bool:
    """Only strip the unnumbered Bismillah header, NEVER the ayah text itself."""
    return surah != 1 and surah != 9 and ayah == 1


def _strip_bismillah_from_text(text: str) -> str:
    """Strip a leading Bismillah from Arabic text using exact prefix matching.
    Only removes known Bismillah variants; never mutates ayah text."""
    trimmed = text.lstrip()
    for variant in _BISMILLAH_VARIANTS:
        if trimmed.startswith(variant):
            after = trimmed[len(variant):]
            # Trim any trailing separator/spaces after the Bismillah
            return re.sub(r"^[ \t ​-‏﻿]+", "", after)
    return text


def _pick_focus_word(words: list[str], surah: int, ayah: int) -> str | None:
    """Pick the longest word from a list, ignoring Bismillah header tokens
    when they appear together on a non-Fatiha Ayah 1."""
    if not words:
        return None
    candidates = _filter_bismillah_tokens(words, surah, ayah)
    if not candidates:
        return None
    return max(candidates, key=len)


_whisper_model_cached = False  # track whether model was already loaded before this call

def get_whisper_model():
    global _whisper_model, _whisper_model_cached
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        t0 = time.monotonic()
        logger.info("[whisper] Loading model: %s (cold start)", WHISPER_MODEL_SIZE)
        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        dt = (time.monotonic() - t0) * 1000
        logger.info("[whisper] Model loaded: %s in %.0f ms", WHISPER_MODEL_SIZE, dt)
    else:
        _whisper_model_cached = True
    return _whisper_model


# ─── Stage markers (future design) ──────────────────────────
# Stage 1 = word memorization (current implementation)
# Stage 2 = pronunciation accuracy (future: phoneme-level)
# Stage 3 = tajweed rules (future: tajweed-specific scoring)
# ─────────────────────────────────────────────────────────────


# Difficulty configuration
# Stage 1: word memorization thresholds
DIFFICULTY_CONFIG = {
    "beginner": {
        "advance_threshold": 50,
        "assisted_advance_attempts": 3,  # allow advance after N attempts even if below threshold
        "style": "encouraging",
        "max_feedback_words": 3,
        "show_transcript": False,
        "fuzzy_matching": True,       # use contains-based matching
        "mode_label": "Coaching",     # UI label
    },
    "medium": {
        "advance_threshold": 75,
        "assisted_advance_attempts": None,  # no assisted advance
        "style": "balanced",
        "max_feedback_words": 5,
        "show_transcript": True,
        "fuzzy_matching": False,
        "mode_label": "Memorization",
    },
    "advanced": {
        "advance_threshold": 85,
        "assisted_advance_attempts": None,
        "style": "detailed",
        "max_feedback_words": 10,
        "show_transcript": True,
        "fuzzy_matching": False,
        "mode_label": "Advanced",
    },
    "hard": {
        "advance_threshold": 90,
        "assisted_advance_attempts": None,
        "style": "strict",
        "max_feedback_words": 10,
        "show_transcript": True,
        "fuzzy_matching": False,
        "mode_label": "Hifz Test",
    },
}

# ─── Audio quality thresholds ────────────────────────────────
MIN_AUDIO_SIZE_BYTES = 1000       # < 1KB = probably silence/noise
MIN_TRANSCRIPT_WORDS = 2          # Whisper must return at least this many Arabic words
MIN_TRANSCRIPT_CHARS = 4          # Minimum meaningful transcript length


def transcribe_audio(
    audio_path: str,
    initial_prompt: str | None = None,
) -> tuple[str, float, float]:
    """
    Transcribe audio using faster-whisper (cached model).
    Returns (transcript, whisper_load_ms, transcribe_ms).

    Tuned for kid-voice single-word and short-ayah recordings:
      - vad_filter=True drops silent regions so Whisper doesn't hallucinate
        text from background noise (a real problem on fixed-duration drills).
      - condition_on_previous_text=False prevents drift across segments.
      - temperature=0.0 makes output deterministic; we don't want creative
        re-interpretation when scoring.
      - initial_prompt biases the vocabulary toward the expected reference
        word/phrase. Critical for single-word drills with the `tiny` model.
    """
    t0 = time.monotonic()
    model = get_whisper_model()
    t1 = time.monotonic()
    whisper_load_ms = (t1 - t0) * 1000

    segments, info = model.transcribe(
        audio_path,
        language="ar",
        vad_filter=True,
        condition_on_previous_text=False,
        temperature=0.0,
        initial_prompt=initial_prompt,
        beam_size=5,
    )
    text = "".join(s.text for s in segments).strip()
    t2 = time.monotonic()
    transcribe_ms = (t2 - t1) * 1000

    logger.info(
        "[NoorHafiz Timing] whisper_load_ms=%.0f transcribe_ms=%.0f "
        "detected_lang=%s lang_prob=%.3f prompt=%r",
        whisper_load_ms, transcribe_ms, info.language, info.language_probability,
        (initial_prompt or "")[:40],
    )

    return text, whisper_load_ms, transcribe_ms


def normalize_arabic(text: str) -> str:
    """
    Thorough Arabic normalization for comparison.
    - Fix dagger-alif word bridges (Uthmani: space+superscript_alef+word_joiner → ا)
    - Remove tashkeel/harakat (fatha, damma, kasra, shadda, sukun, etc.)
    - Remove pause marks (waqf marks)
    - Remove tatweel (kashida)
    - Remove zero-width characters (joiner, non-joiner, word joiner)
    - Normalize Alef variants: أ إ آ ٱ → ا
    - Normalize Farsi Yeh (U+06CC, used in Uthmani script) → ي
    - Normalize Ya / Alef Maksura: ى → ي
    - Normalize Waw Hamza: ؤ → و
    - Keep Arabic letters + space only; strip everything else
    - Collapse extra spaces
    """
    if not text:
        return ""

    # ── Pre‑normalization: dagger‑alif word bridges ──
    # Uthmani script writes الصراط as: الصرَ<space>ٰ\u2060طَ
    # Replace: space + superscript_alef + word_joiner → regular ا
    text = re.sub(r'\s+\u0670\u2060', 'ا', text)

    # Remove tashkeel (harakat): Fatha, Damma, Kasra, Shadda, Sukun,
    # Fathatan, Dammatan, Kasratan, Superscript Alef, etc.
    text = re.sub(r'[\u064B-\u065F\u0617-\u061A\u0670]', '', text)

    # Remove Quran-specific pause/waqf marks
    text = re.sub(r'[\u06D6-\u06ED]', '', text)

    # Remove tatweel/kashida
    text = text.replace('\u0640', '')

    # Remove zero-width characters that create false word boundaries
    # U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 Word Joiner, U+FEFF BOM/ZWNBS
    text = re.sub(r'[\u200B\u200C\u200D\u2060\uFEFF]', '', text)

    # Normalize Alef variants → bare Alef
    text = text.replace('آ', 'ا')   # Alef madda
    text = text.replace('أ', 'ا')   # Alef hamza on top
    text = text.replace('إ', 'ا')   # Alef hamza below
    text = text.replace('ٱ', 'ا')   # Alef wasl

    # Normalize Farsi Yeh (U+06CC, used in Uthmani script for final yaa)
    # e.g., المستقيم → المستقيم, الرحيم → الرحيم
    # Without this, \u06CC is stripped by the non-Arabic filter below
    text = text.replace('\u06CC', 'ي')

    # Normalize Alef Maksura → Ya
    text = text.replace('ى', 'ي')

    # Normalize Waw Hamza → Waw
    text = text.replace('ؤ', 'و')

    # Remove all non-Arabic-letter characters.
    # Keep: Arabic block 0621-064A, Farsi Yeh 06CC (normalized above),
    # Yeh Barree 06D2-06D3, and spaces.
    text = re.sub(r'[^\u0621-\u064A\u06CC\u06D2\u06D3\s]', '', text)

    # Collapse multiple spaces into one
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def _has_meaningful_arabic(text: str) -> bool:
    """Check if text contains meaningful Arabic words (not just noise)."""
    normalized = normalize_arabic(text)
    if not normalized:
        return False
    words = normalized.split()
    if len(words) < MIN_TRANSCRIPT_WORDS:
        return False
    # Check that words are at least 2 chars each (filter out single-letter noise)
    real_words = [w for w in words if len(w) >= 2]
    return len(real_words) >= MIN_TRANSCRIPT_WORDS


def detect_unclear_audio(
    audio_size: int,
    transcript: str,
) -> dict | None:
    """
    Detect if the audio recording is genuinely unclear (no signal/speech).
    Returns None if audio seems fine, or a dict with audio_unclear details.

    IMPORTANT: Having wrong words is NOT unclear audio.
    If Whisper heard Arabic words but they don't match the ayah,
    that's a wrong recitation or transcription — audio_unclear must be FALSE.
    Only return audio_unclear=true for: silence, noise, empty, too-short, no-Arabic.
    """
    # Check 1: audio file too small
    if audio_size < MIN_AUDIO_SIZE_BYTES:
        return {
            "audio_unclear": True,
            "reason": "audio_too_short_or_empty",
            "feedback": "I could not hear your voice clearly. Check the microphone and try again.",
        }

    # Check 2: empty transcript
    if not transcript or not transcript.strip():
        return {
            "audio_unclear": True,
            "reason": "empty_transcript",
            "feedback": "I could not hear your voice clearly. Check the microphone and try again.",
        }

    # Check 3: transcript too short (< 4 chars of Arabic)
    normalized = normalize_arabic(transcript)
    if len(normalized) < MIN_TRANSCRIPT_CHARS:
        return {
            "audio_unclear": True,
            "reason": "transcript_too_short",
            "feedback": "I could not hear your voice clearly. Check the microphone and try again.",
        }

    # Check 4: no meaningful Arabic words (need ≥2 words of ≥2 chars each)
    if not _has_meaningful_arabic(transcript):
        return {
            "audio_unclear": True,
            "reason": "no_meaningful_arabic",
            "feedback": "I could not hear your voice clearly. Check the microphone and try again.",
        }

    # Audio is clear — Whisper heard real Arabic words.
    # Even if the score is 0%, that's a wrong recitation, not unclear audio.
    return None


def compare_texts_positional(reference: str, transcription: str) -> dict:
    """
    Strict positional word-by-word comparison (for Medium/Advanced/Hard).
    Compares words in order and reports mistakes + missing words.
    """
    ref_words = normalize_arabic(reference).split()
    trans_words = normalize_arabic(transcription).split()

    if not ref_words:
        return {"accuracy": 0, "correct": 0, "total": 0, "missing": [], "extra": [], "mistakes": [], "matched": []}

    correct = 0
    mistakes = []
    missing = []
    matched = []

    for i, ref_word in enumerate(ref_words):
        if i < len(trans_words):
            if ref_word == trans_words[i]:
                correct += 1
                matched.append({"word": ref_word, "position": i + 1})
            else:
                mistakes.append({"expected": ref_word, "got": trans_words[i], "position": i + 1})
        else:
            missing.append({"word": ref_word, "position": i + 1})

    extra = trans_words[len(ref_words):]
    total = len(ref_words)
    accuracy = round((correct / total) * 100, 1) if total > 0 else 0

    return {
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "missing": missing,
        "extra": [{"word": w, "position": i + len(ref_words) + 1} for i, w in enumerate(extra)],
        "mistakes": mistakes,
        "matched": matched,
    }


def compare_texts_fuzzy(reference: str, transcription: str) -> dict:
    """
    Fuzzy/contains-based comparison for Beginner mode (Stage 1: word memorization).
    
    Distinguishes exact matches from fuzzy (close-but-not-exact) matches.
    Fuzzy matches count as 0.5 toward accuracy (not full credit) and are
    recorded as type='fuzzy' mistakes so feedback can mention near-misses.
    """
    ref_words = normalize_arabic(reference).split()
    trans_words = normalize_arabic(transcription).split()

    if not ref_words:
        return {"accuracy": 0, "exact_correct": 0, "fuzzy_correct": 0, "correct": 0, "total": 0, "missing": [], "extra": [], "mistakes": [], "matched": []}

    if not trans_words:
        return {
            "accuracy": 0,
            "exact_correct": 0,
            "fuzzy_correct": 0,
            "correct": 0,
            "total": len(ref_words),
            "missing": [{"word": w, "position": i + 1} for i, w in enumerate(ref_words)],
            "extra": [],
            "mistakes": [],
            "matched": [],
        }

    used_indices = set()
    exact_correct = 0
    fuzzy_correct = 0
    missing = []
    mistakes = []
    matched = []  # ref_words that hit an exact match — used to praise the child

    for i, ref_word in enumerate(ref_words):
        found = False
        # Pass 1: exact match only
        for j, trans_word in enumerate(trans_words):
            if j not in used_indices:
                if ref_word == trans_word:
                    used_indices.add(j)
                    exact_correct += 1
                    matched.append({"word": ref_word, "position": i + 1})
                    found = True
                    break

        if found:
            continue

        # Pass 2: fuzzy (close but not exact) match
        for j, trans_word in enumerate(trans_words):
            if j not in used_indices:
                if _words_similar(ref_word, trans_word):
                    used_indices.add(j)
                    fuzzy_correct += 1
                    mistakes.append({
                        "expected": ref_word,
                        "heard": trans_word,
                        "type": "fuzzy",
                        "position": i + 1,
                    })
                    found = True
                    break

        if not found:
            missing.append({"word": ref_word, "position": i + 1})

    extra_words = [trans_words[j] for j in range(len(trans_words)) if j not in used_indices]

    total = len(ref_words)
    # Fuzzy matches count as 0.5 instead of 1.0 toward accuracy
    effective_correct = exact_correct + (fuzzy_correct * 0.5)
    accuracy = round((effective_correct / total) * 100, 1) if total > 0 else 0
    correct = exact_correct + fuzzy_correct  # total raw count for feedback

    return {
        "accuracy": accuracy,
        "correct": correct,
        "exact_correct": exact_correct,
        "fuzzy_correct": fuzzy_correct,
        "total": total,
        "missing": missing,
        "extra": [{"word": w, "position": -1} for w in extra_words],
        "mistakes": mistakes,
        "matched": matched,
    }


# ── Phonetic / Whisper‑error substitution map ────────────────
# Common mistakes Whisper makes with Arabic consonants
_PHONETIC_CANONICAL = {
    'ص': 'س',   # sād → sīn
    'ط': 'ت',   # ṭāʾ → tāʾ
    'ظ': 'ذ',   # ẓāʾ → dhāl
    'ض': 'د',   # ḍād → dāl
    'ق': 'ك',   # qāf → kāf
    'غ': 'خ',   # ghayn → khāʾ
    'ء': 'ا',   # hamza → alef
    'ة': 'ه',   # tāʾ marbūṭa → hāʾ
    'ث': 'س',   # thāʾ → sīn
    'ذ': 'ز',   # dhāl → zāy
    'ح': 'ه',   # ḥāʾ → hāʾ
    'ع': 'ا',   # ʿayn → alef (common Whisper drop)
}


# ── Madd integrity check ─────────────────────────────────────
# In Arabic orthography, the long-vowel ("madd") letters ا و ي appear in the
# spelling whenever the vowel is elongated. A child saying short "yaqul"
# instead of long "yaqūl" produces audio that Whisper transcribes as يقل
# (no waw) rather than يقول. The fuzzy matcher would still pass that
# (similarity ratio ≈ 0.86), so we add a strict integrity gate: each madd
# letter's count in the reference must equal its count in the transcript.
#
# Used by the word-drill scorer only. Full-ayah scoring intentionally
# stays loose because Whisper noise across many words averages out.
MADD_LETTERS = ("ا", "و", "ي")


def _madd_letters_match(reference_norm: str, transcript_norm: str) -> tuple[bool, list[str]]:
    """Compare madd-letter counts between normalized reference and transcript.

    Both inputs MUST already be normalized (no tashkeel, no tatweel,
    Alef variants and Alef Maksura already collapsed). Returns
    (ok, missing_letters) — `missing_letters` lists which long vowels
    were in the reference but not produced (in spoken/audio form) by
    the child."""
    missing: list[str] = []
    for letter in MADD_LETTERS:
        if reference_norm.count(letter) > transcript_norm.count(letter):
            missing.append(letter)
    return (not missing, missing)


def _words_similar(word1: str, word2: str) -> bool:
    """Check if two Arabic words are similar enough for beginner mode.
    Uses SequenceMatcher ratio + phonetic substitution map."""
    if not word1 or not word2:
        return False
    if word1 == word2:
        return True

    # 1. Exact match after phonetic substitution
    if _phonetic_normalize(word1) == _phonetic_normalize(word2):
        return True

    # 2. SequenceMatcher ratio (edit‑distance similarity)
    ratio = _arabic_similarity(word1, word2)
    if ratio >= 0.72:
        return True

    # 3. One string is substring of the other (Whisper drops/adds prefix)
    if len(word1) >= 3 and len(word2) >= 3:
        if word1 in word2 or word2 in word1:
            return True

    return False


def _phonetic_normalize(word: str) -> str:
    """Map similar-sounding consonants to canonical forms."""
    return ''.join(_PHONETIC_CANONICAL.get(c, c) for c in word)


def _arabic_similarity(word1: str, word2: str) -> float:
    """Compute edit-distance similarity between two Arabic words.
    Also tries phonetic-normalized comparison and returns the higher score."""
    from difflib import SequenceMatcher
    ratio_raw = SequenceMatcher(None, word1, word2).ratio()
    ratio_phon = SequenceMatcher(
        None, _phonetic_normalize(word1), _phonetic_normalize(word2),
    ).ratio()
    return max(ratio_raw, ratio_phon)


def compare_texts(reference: str, transcription: str, difficulty: str = "medium") -> dict:
    """Compare reference ayah text with transcription."""
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])
    if config.get("fuzzy_matching"):
        return compare_texts_fuzzy(reference, transcription)
    else:
        return compare_texts_positional(reference, transcription)


def _limited_words(items: list, key: str, max_words: int) -> str:
    return ", ".join(str(item.get(key, "")).strip() for item in items[:max_words] if item.get(key))


def _mistake_pairs(mistakes: list, max_words: int, with_position: bool = False) -> str:
    parts = []
    for item in mistakes[:max_words]:
        expected = str(item.get("expected", "")).strip()
        got = str(item.get("got") or item.get("heard", "")).strip()
        if not expected:
            continue
        if with_position and item.get("position"):
            parts.append(f"expected {expected}, heard {got or 'nothing'} at word {item['position']}")
        else:
            parts.append(f"expected {expected}, heard {got or 'nothing'}")
    return "; ".join(parts)


def generate_feedback(
    accuracy: float,
    result: dict,
    difficulty: str,
    surah_name: str,
    ayah: int,
    attempt_number: int = 1,
    assisted_advance: bool = False,
) -> str:
    """Generate evidence-based kid-friendly feedback."""
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])
    style = config["style"]
    max_words = config["max_feedback_words"]
    correct = result.get("correct", 0)
    exact_correct = result.get("exact_correct", 0)
    fuzzy_correct = result.get("fuzzy_correct", 0)
    total = result.get("total", 0)
    mistakes = result.get("mistakes", [])[:max_words]
    missing = result.get("missing", [])[:max_words]
    extra = result.get("extra", [])[:max_words]

    # Build score line: distinguish exact vs fuzzy matches
    if total:
        if fuzzy_correct > 0:
            score_line = f"I heard {exact_correct}/{total} words clearly, {fuzzy_correct} were close"
        else:
            score_line = f"I heard {correct}/{total} words correctly"
    else:
        score_line = "I could not compare the words clearly"
    missing_words = _limited_words(missing, "word", max_words)
    extra_words = _limited_words(extra, "word", max_words)
    mistake_text = _mistake_pairs(mistakes, max_words, with_position=(style in {"detailed", "strict"}))

    practice_parts = []
    if mistake_text:
        practice_parts.append(f"Check: {mistake_text}.")
    if missing_words:
        practice_parts.append(f"Practice these words: {missing_words}.")
    if extra_words and style in {"detailed", "strict"}:
        practice_parts.append(f"Extra words I heard: {extra_words}.")

    if assisted_advance:
        focus = missing_words or (mistakes[0].get("expected") if mistakes else "this ayah")
        return f"Good practice — {score_line}. We'll move on now and come back to {focus} later."

    if total == 0:
        return "I could not load enough words to score this ayah clearly. Please try again."

    if correct == 0:
        # Whisper heard Arabic words but they didn't match the ayah.
        # This is NOT unclear audio (which is caught earlier by detect_unclear_audio).
        # It's wrong recitation or transcription.
        if mistake_text:
            return f"I heard Arabic, but it didn't match the ayah. {mistake_text}. Let's try again slowly."
        return "I heard Arabic, but it did not match enough. Let's try again slowly."

    if style == "encouraging":
        if accuracy >= 99.5 and fuzzy_correct == 0:
            return f"Amazing! I heard all {total} words correctly. Great job!"
        if accuracy >= config["advance_threshold"]:
            if fuzzy_correct > 0:
                fuzzy_words = _limited_words([m for m in mistakes if m.get("type") == "fuzzy"], "expected", max_words)
                return f"Good job. {fuzzy_words} was close. Let's say it clearly."
            if practice_parts:
                return f"Good job — {score_line}. {' '.join(practice_parts)}"
            return f"Good job — {score_line}. You passed this ayah!"
        if practice_parts:
            return f"Good try — {score_line}. {' '.join(practice_parts)} Listen again, then repeat."
        return f"Good try — {score_line}. Listen again, then repeat."

    if style == "balanced":
        if accuracy >= 99.5 and fuzzy_correct == 0:
            return f"Excellent — all {total}/{total} words matched in {surah_name} ayah {ayah}."
        if accuracy >= config["advance_threshold"]:
            return f"Passed — {score_line}. {' '.join(practice_parts)}".strip()
        return f"Not passed yet — {score_line}. {' '.join(practice_parts) or 'Listen again and retry.'}"

    if style == "detailed":
        if accuracy >= 99.5 and fuzzy_correct == 0:
            return f"Excellent — {total}/{total} words matched."
        return f"{score_line}. {' '.join(practice_parts) or 'Review and retry.'}"

    # HARD / strict
    if accuracy >= config["advance_threshold"]:
        return f"Passed — {score_line}. {' '.join(practice_parts)}".strip()
    return f"Not passed — {score_line}. {' '.join(practice_parts) or 'Review and retry.'}"


def generate_voice_text(
    accuracy: float,
    result: dict,
    difficulty: str,
    surah_name: str,
    ayah: int,
    attempt_number: int = 1,
    assisted_advance: bool = False,
) -> str:
    """Generate short evidence-based text for TTS voice tutor."""
    correct = result.get("correct", 0)
    total = result.get("total", 0)
    exact_correct = result.get("exact_correct", 0)
    fuzzy_correct = result.get("fuzzy_correct", 0)
    missing = result.get("missing", [])[:2]
    mistakes = result.get("mistakes", [])[:2]
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])
    threshold = config["advance_threshold"]

    missing_words = _limited_words(missing, "word", 2)
    mistake_words = _limited_words(mistakes, "expected", 2)
    focus_words = missing_words or mistake_words

    if assisted_advance:
        if focus_words:
            return f"Good practice. I heard {correct} out of {total}. We'll move on and practice {focus_words} later."
        return f"Good practice. I heard {correct} out of {total}. Let's keep going."

    if total == 0 or correct == 0:
        if total == 0:
            return "I could not load enough words to score, please try again."
        return "I heard Arabic words but they did not match the ayah. Let's try again slowly."

    if accuracy >= 99.5 and fuzzy_correct == 0:
        return f"Amazing! I heard all {total} words correctly. Let's go to the next ayah."

    if accuracy >= threshold:
        if fuzzy_correct > 0:
            fuzzy_word = _limited_words([m for m in mistakes if m.get("type") == "fuzzy"], "expected", 2)
            if fuzzy_word:
                return f"Good job. {fuzzy_word} was close. Let's say it clearly."
        if focus_words:
            return f"Good job. I heard {correct} out of {total}. Practice {focus_words}, then let's continue."
        return f"Good job. I heard {correct} out of {total}. Let's continue."

    if fuzzy_correct > 0:
        fuzzy_word = _limited_words([m for m in mistakes if m.get("type") == "fuzzy"], "expected", 2)
        if fuzzy_word:
            return f"Good try. I heard {exact_correct} out of {total} clearly and {fuzzy_word} was close. Listen again, then repeat."

    if focus_words:
        return f"Good try. I heard {correct} out of {total}. Practice {focus_words}. Listen again, then repeat."

    return f"Good try. I heard {correct} out of {total}. Listen again, then repeat."


@router.post("/test-mic")
async def test_microphone(
    audio: UploadFile = File(...),
    duration_seconds: float = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    Test microphone: transcribe 3-second recording and return the transcript.
    Used for mic diagnostics — does NOT score or save anything.
    """
    t_total_start = time.monotonic()
    content_type = audio.content_type or "unknown"
    filename = audio.filename or "unknown"

    t0 = time.monotonic()
    suffix = os.path.splitext(filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_size = len(content)
        tmp_path = tmp.name
    t_audio_read_ms = (time.monotonic() - t0) * 1000

    try:
        transcript, whisper_load_ms, transcribe_ms = transcribe_audio(tmp_path)
        normalized = normalize_arabic(transcript)

        # Run unclear-audio detection on the test-mic recording
        unclear = detect_unclear_audio(audio_size, transcript)

        t_total_ms = (time.monotonic() - t_total_start) * 1000

        logger.info(
            "[NoorHafiz Recite Debug] TEST_MIC user=%s filename=%s content_type=%s "
            "audio_size=%d duration=%.1fs whisper_model=%s "
            "transcript=%r normalized=%r "
            "has_arabic=%s audio_unclear=%s reason=%s "
            "timing: total_ms=%.0f audio_read_ms=%.0f whisper_load_ms=%.0f "
            "transcribe_ms=%.0f whisper_cached=%s",
            current_user.id, filename, content_type,
            audio_size, duration_seconds or 0, WHISPER_MODEL_SIZE,
            transcript, normalized,
            _has_meaningful_arabic(transcript),
            unclear is not None,
            unclear.get("reason", None) if unclear else None,
            t_total_ms, t_audio_read_ms, whisper_load_ms, transcribe_ms,
            _whisper_model_cached,
        )

        return {
            "transcript": transcript,
            "normalized_transcript": normalized,
            "audio_size_bytes": audio_size,
            "audio_size_kb": round(audio_size / 1024, 1),
            "duration_seconds": duration_seconds or 0,
            "has_meaningful_arabic": _has_meaningful_arabic(transcript),
            "audio_unclear": unclear is not None,
            "audio_unclear_reason": unclear["reason"] if unclear else None,
            "content_type": content_type,
            "whisper_model": WHISPER_MODEL_SIZE,
        }
    finally:
        os.unlink(tmp_path)


@router.post("/score-word")
async def score_word_drill(
    audio: UploadFile = File(...),
    reference_word: str = Form(...),
    child_id: int = Form(...),
    duration_seconds: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Score a single-word drill recording.

    Used after 2+ consecutive failures on the same Ayah: the agent isolates
    the hardest word and asks the child to say only that word. We compare
    the transcript against the single reference word using the same fuzzy
    similarity helpers used for full-Ayah scoring (Whisper-error tolerant).

    Does NOT save a PracticeSession or Mastery row — drill is a coaching
    sub-loop, not a graded attempt.
    """
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    ref = (reference_word or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="reference_word is required")

    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_size = len(content)
        tmp_path = tmp.name

    try:
        try:
            # Bias Whisper toward the expected word so a tiny model has a
            # fighting chance on isolated kid-voice drills. The prompt is
            # gentle priming — Whisper still rejects clearly different audio.
            prompt = f"الكلمة هي: {ref}"
            transcript, _, _ = await asyncio.wait_for(
                asyncio.to_thread(transcribe_audio, tmp_path, prompt),
                timeout=60,
            )
        except asyncio.TimeoutError:
            return {
                "matched": False,
                "transcript": "",
                "reference": ref,
                "audio_unclear": True,
                "audio_unclear_reason": "transcription_timeout",
            }

        # Single-word drills use a leaner unclear-audio check than full-ayah
        # scoring. detect_unclear_audio() requires ≥4 normalized chars and
        # ≥2 words, which incorrectly rejects valid Tajweed drill words like
        # قَالَ → قال (3 chars) or هُوَ → هو (2 chars). Here we only fail
        # on truly empty/silent audio.
        if audio_size < MIN_AUDIO_SIZE_BYTES:
            return {
                "matched": False,
                "transcript": "",
                "reference": ref,
                "audio_unclear": True,
                "audio_unclear_reason": "audio_too_short_or_empty",
            }
        if not transcript or not transcript.strip():
            return {
                "matched": False,
                "transcript": "",
                "reference": ref,
                "audio_unclear": True,
                "audio_unclear_reason": "empty_transcript",
            }
        if not normalize_arabic(transcript):
            return {
                "matched": False,
                "transcript": transcript,
                "reference": ref,
                "audio_unclear": True,
                "audio_unclear_reason": "no_arabic_detected",
            }

        norm_ref = normalize_arabic(ref)
        norm_trans = normalize_arabic(transcript)
        ref_tokens = norm_ref.split()
        trans_tokens = norm_trans.split()

        # The child should say exactly the one word — but Whisper may include
        # filler. Match if any transcript token is similar to the reference.
        matched = False
        matched_token = ""
        for tw in trans_tokens:
            if all(_words_similar(tw, rw) for rw in ref_tokens):
                matched = True
                matched_token = tw
                break
            if any(_words_similar(tw, rw) for rw in ref_tokens):
                matched = True
                matched_token = tw
                break

        # Madd integrity gate. Whisper transcripts of short-voweled speech
        # drop the long-vowel letter (e.g., yaqul → يقل instead of يقول);
        # the fuzzy matcher above would still pass them. Reject any match
        # that is missing a madd letter the reference requires.
        madd_missing: list[str] = []
        if matched and matched_token:
            madd_ok, madd_missing = _madd_letters_match(norm_ref, matched_token)
            if not madd_ok:
                logger.info(
                    "[NoorHafiz Drill] madd_missing ref=%r heard=%r missing=%r",
                    ref, transcript, madd_missing,
                )
                matched = False

        return {
            "matched": matched,
            "transcript": transcript,
            "reference": ref,
            "normalized_transcript": norm_trans,
            "normalized_reference": norm_ref,
            "audio_unclear": False,
            "audio_unclear_reason": None,
            "madd_missing": madd_missing,
        }
    finally:
        os.unlink(tmp_path)


@router.post("/score")
async def score_recitation(
    audio: UploadFile = File(...),
    surah: int = Form(...),
    ayah: int = Form(...),
    child_id: int = Form(...),
    duration_seconds: float = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accept audio recording, transcribe with Whisper, compare against reference.
    Uses child's difficulty level for scoring thresholds and feedback style.

    Returns audio_unclear=true if recording is too short/silent/noisy,
    without saving to DB or advancing progress.
    """
    t_total_start = time.monotonic()
    content_type = audio.content_type or "unknown"
    filename = audio.filename or "unknown"
    logger.info(
        "[NoorHafiz Recite Debug] REQUEST_RECEIVED child_id=%d surah=%d ayah=%d "
        "filename=%s content_type=%s",
        child_id, surah, ayah, filename, content_type,
    )

    # Verify child belongs to parent
    t0 = time.monotonic()
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    t_db_lookup_ms = (time.monotonic() - t0) * 1000

    difficulty = child.difficulty or "medium"
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])

    # Save uploaded audio to temp file
    t0 = time.monotonic()
    suffix = os.path.splitext(filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_size = len(content)
        tmp_path = tmp.name
    t_audio_read_ms = (time.monotonic() - t0) * 1000

    t_transcribe_start = time.monotonic()
    whisper_load_ms = 0
    transcribe_ms = 0
    t_ref_fetch_ms = 0
    t_normalize_ms = 0
    t_compare_ms = 0
    t_feedback_ms = 0
    t_db_save_ms = 0
    transcription_timed_out = False

    try:
        # ── Transcribe with 90s timeout wrapper ──
        TRANS_TIMEOUT_S = 90
        try:
            transcript, whisper_load_ms, transcribe_ms = await asyncio.wait_for(
                asyncio.to_thread(transcribe_audio, tmp_path),
                timeout=TRANS_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            transcription_timed_out = True
            logger.error(
                "[NoorHafiz Recite Debug] TRANSCRIPTION_TIMEOUT child_id=%d surah=%d ayah=%d "
                "audio_size_bytes=%d elapsed_ms=%.0f",
                child_id, surah, ayah, audio_size,
                (time.monotonic() - t_transcribe_start) * 1000,
            )
            return {
                "accuracy": 0,
                "transcript": "",
                "reference": "",
                "normalized_transcript": "",
                "normalized_reference": "",
                "feedback": "The scoring took too long. Please try again.",
                "voice_text": "The scoring took too long. Please try again.",
                "should_advance": False,
                "details": {},
                "difficulty": difficulty,
                "threshold": config.get("advance_threshold", 75),
                "attempt_number": 0,
                "assisted_advance": False,
                "audio_unclear": True,
                "audio_unclear_reason": "transcription_timeout",
                "audio_size_bytes": audio_size,
                "audio_size_kb": round(audio_size / 1024, 1),
                "duration_seconds": duration_seconds or 0,
                "content_type": content_type,
                "whisper_model": WHISPER_MODEL_SIZE,
            }

        # Get reference text from Quran API
        t0 = time.monotonic()
        ref_data = await get_ayah(surah, ayah)
        reference_text = ref_data.get("data", {}).get("text", "")
        t_ref_fetch_ms = (time.monotonic() - t0) * 1000

        # Strip unnumbered Bismillah header from reference for Ayah 1 so the
        # comparison matches what the child sees on screen. Without this every
        # non-Fatiha/non-Tawbah Ayah 1 is scored with 3 guaranteed "missing" words.
        if _should_strip_bismillah(surah, ayah):
            reference_text = _strip_bismillah_from_text(reference_text)

        # Normalized versions for logging
        t0 = time.monotonic()
        normalized_transcript = normalize_arabic(transcript)
        normalized_reference = normalize_arabic(reference_text)
        t_normalize_ms = (time.monotonic() - t0) * 1000

        # ── Check for genuinely unclear audio (silence/noise/empty) BEFORE scoring ──
        unclear = detect_unclear_audio(audio_size, transcript)

        if unclear:
            logger.info(
                "[NoorHafiz Recite Debug] AUDIO_UNCLEAR child_id=%d surah=%d ayah=%d "
                "filename=%s content_type=%s audio_size_bytes=%d whisper_model=%s "
                "transcript=%r normalized_transcript=%r "
                "reference=%r normalized_reference=%r "
                "reason=%s whisper_cached=%s "
                "timing: db_lookup=%.0fms audio_read=%.0fms whisper_load=%.0fms "
                "transcribe=%.0fms ref_fetch=%.0fms normalize=%.0fms",
                child_id, surah, ayah,
                filename, content_type, audio_size, WHISPER_MODEL_SIZE,
                transcript, normalized_transcript,
                reference_text, normalized_reference,
                unclear["reason"], _whisper_model_cached,
                t_db_lookup_ms, t_audio_read_ms, whisper_load_ms, transcribe_ms,
                t_ref_fetch_ms, t_normalize_ms,
            )
            return {
                "accuracy": 0,
                "transcript": transcript,
                "reference": reference_text,
                "normalized_transcript": normalized_transcript,
                "normalized_reference": normalized_reference,
                "feedback": unclear["feedback"],
                "voice_text": unclear["feedback"],
                "should_advance": False,
                "details": {},
                "difficulty": difficulty,
                "attempt_number": 0,
                "assisted_advance": False,
                "audio_unclear": True,
                "audio_unclear_reason": unclear["reason"],
                "audio_size_bytes": audio_size,
                "audio_size_kb": round(audio_size / 1024, 1),
                "duration_seconds": duration_seconds or 0,
                "content_type": content_type,
                "whisper_model": WHISPER_MODEL_SIZE,
            }

        if not reference_text:
            return {
                "accuracy": 0,
                "transcript": transcript,
                "reference": "",
                "feedback": "Could not load reference text for comparison.",
                "voice_text": "Sorry, I could not load the reference text. Please try again.",
                "should_advance": False,
                "details": {},
                "difficulty": difficulty,
                "attempt_number": 1,
                "assisted_advance": False,
                "audio_unclear": False,
                "audio_size_bytes": audio_size,
                "audio_size_kb": round(audio_size / 1024, 1),
            }

        # Compare using difficulty-appropriate method
        t0 = time.monotonic()
        result = compare_texts(reference_text, transcript, difficulty)
        accuracy = result["accuracy"]
        threshold = config["advance_threshold"]
        t_compare_ms = (time.monotonic() - t0) * 1000

        # Check attempt count for assisted advance (beginner only)
        t0 = time.monotonic()
        mastery = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.surah == surah,
            Mastery.ayah == ayah,
        ).first()
        attempt_number = (mastery.attempts + 1) if mastery else 1

        # Determine if child should advance
        should_advance = accuracy >= threshold
        assisted_advance = False

        # Beginner assisted progress — require minimum useful score
        if not should_advance and config.get("assisted_advance_attempts"):
            max_attempts = config["assisted_advance_attempts"]
            min_assist_accuracy = 25  # at least 25% or 1 matched word
            if attempt_number >= max_attempts and accuracy >= min_assist_accuracy:
                assisted_advance = True
                should_advance = True

        # Get surah name for feedback
        from app.routers.quran import SURAH_NAMES
        surah_name = SURAH_NAMES.get(surah, f"Surah {surah}")

        # ── All audio checks passed — score the recitation ──
        # Note: accuracy may be 0 if Whisper heard different Arabic words.
        # That's a wrong recitation, NOT unclear audio — treat as normal low score.

        # Generate feedback
        t0 = time.monotonic()
        feedback = generate_feedback(
            accuracy, result, difficulty, surah_name, ayah,
            attempt_number=attempt_number,
            assisted_advance=assisted_advance,
        )
        voice_text = generate_voice_text(
            accuracy, result, difficulty, surah_name, ayah,
            attempt_number=attempt_number,
            assisted_advance=assisted_advance,
        )
        t_feedback_ms = (time.monotonic() - t0) * 1000

        # Determine session status
        if accuracy >= 90:
            status = "mastered"
        elif should_advance:
            status = "needs_practice" if assisted_advance else "practicing"
        else:
            status = "needs-work"

        # Save session to DB
        t0 = time.monotonic()
        session = PracticeSession(
            child_id=child_id,
            surah=surah,
            ayah_start=ayah,
            ayah_end=ayah,
            accuracy=accuracy,
            words_correct=result["correct"],
            words_total=result["total"],
            mistakes=json.dumps(result["mistakes"] + result["missing"]),
            status=status,
            duration_seconds=0,
        )
        db.add(session)

        # Update mastery
        if not mastery:
            mastery = Mastery(
                child_id=child_id,
                surah=surah,
                ayah=ayah,
                attempts=1,
                best_accuracy=accuracy,
            )
            db.add(mastery)
        else:
            mastery.attempts += 1
            if accuracy > mastery.best_accuracy:
                mastery.best_accuracy = accuracy
            # Do NOT set memorized from practice — only from memory check endpoint

        # Update child stats
        child.total_practiced += 1
        mastered_count = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.memorized == True,
        ).count()
        child.total_mastered = mastered_count

        db.commit()

        # ── Create TutorMemoryEvent for OpenClaw tutor intelligence ──
        t_tutor_event_start = time.monotonic()
        try:
            # Determine action for this result
            missing = result.get("missing", [])
            matched = result.get("matched", [])

            missing_words = [m.get("word", "") for m in missing if m.get("word")]
            matched_words = [m.get("word", "") for m in matched if m.get("word")]

            # Hard word — longest missing word, ignoring Bismillah header on Ayah 1
            hard_word = _pick_focus_word(missing_words, surah, ayah)
            # Good word — a word the child got right; same Bismillah filter applies
            good_word = _pick_focus_word(matched_words, surah, ayah)

            # Get mastery for repeat count
            repeat_goal = child.repeat_each_ayah or 3

            if should_advance:
                # Cap practice_pass_count at the repeat goal — no over-counting like "6 of 3".
                # Once at the goal the ayah is ready for memory check; further practice
                # is allowed but doesn't push the count past the goal.
                current_count = mastery.practice_pass_count or 0
                if current_count < repeat_goal:
                    mastery.practice_pass_count = current_count + 1
                if (mastery.practice_pass_count or 0) >= repeat_goal:
                    mastery.ready_for_memory_check = True
                    action = "move_next"
                else:
                    action = "repeat"
            else:
                action = "retry"

            # mastery.practice_pass_count was already incremented (and capped) above,
            # so this reflects the just-completed pass — no further +1.
            repeat_count = mastery.practice_pass_count or 0

            tutor_event = TutorMemoryEvent(
                session_id=session.id,
                child_id=child_id,
                child_name=child.name,
                surah=surah,
                surah_name=surah_name,
                ayah=ayah,
                accuracy=accuracy,
                passed=should_advance,
                repeat_count=repeat_count,
                repeat_goal=repeat_goal,
                hard_word=hard_word,
                good_word=good_word,
                audio_unclear=False,
                action=action,
            )
            db.add(tutor_event)
            db.commit()
            tutor_event_id = tutor_event.id
        except Exception:
            logger.exception("[tutor] Failed to create TutorMemoryEvent — non-blocking")
            db.rollback()
            tutor_event_id = None
        t_tutor_event_ms = (time.monotonic() - t_tutor_event_start) * 1000

        t_db_save_ms = (time.monotonic() - t0) * 1000

        t_total_ms = (time.monotonic() - t_total_start) * 1000

        # ── Timing summary log ──
        logger.info(
            "[NoorHafiz Timing] total_ms=%.0f db_lookup_ms=%.0f audio_read_ms=%.0f "
            "whisper_load_ms=%.0f transcribe_ms=%.0f ref_fetch_ms=%.0f "
            "normalize_ms=%.0f compare_ms=%.0f feedback_ms=%.0f db_save_ms=%.0f "
            "whisper_cached=%s audio_size_bytes=%d",
            t_total_ms, t_db_lookup_ms, t_audio_read_ms,
            whisper_load_ms, transcribe_ms, t_ref_fetch_ms,
            t_normalize_ms, t_compare_ms, t_feedback_ms, t_db_save_ms,
            _whisper_model_cached, audio_size,
        )

        # ── Debug logging ──
        logger.info(
            "[NoorHafiz Recite Debug] SCORE child_id=%d surah=%d ayah=%d "
            "filename=%s content_type=%s audio_size_bytes=%d whisper_model=%s "
            "transcript=%r normalized_transcript=%r "
            "reference=%r normalized_reference=%r "
            "score=%.1f audio_unclear=False, "
            "threshold=%d should_advance=%s attempt=%d total_ms=%.0f",
            child_id, surah, ayah,
            filename, content_type, audio_size, WHISPER_MODEL_SIZE,
            transcript, normalized_transcript, normalized_reference,
            accuracy, threshold, should_advance, attempt_number, t_total_ms,
        )

        # ── Structured quality log (no Grafana yet) ──
        logger.info(
            "[NoorHafiz Score Quality] "
            "model=%s duration_ms=%.0f audio_size=%d "
            "transcript_length=%d arabic_word_count=%d "
            "exact_matches=%d fuzzy_matches=%d missing_count=%d "
            "final_accuracy=%.1f unclear_reason=%s",
            WHISPER_MODEL_SIZE, t_total_ms, audio_size,
            len(transcript), len(normalized_transcript.split()) if normalized_transcript else 0,
            result.get("exact_correct", result.get("correct", 0)),
            result.get("fuzzy_correct", 0),
            len(result.get("missing", [])),
            accuracy,
            "None",
        )

        return {
            "accuracy": accuracy,
            "transcript": transcript,
            "reference": reference_text,
            "normalized_transcript": normalized_transcript,
            "normalized_reference": normalized_reference,
            "feedback": feedback,
            "voice_text": voice_text,
            "should_advance": should_advance,
            "details": result,
            "difficulty": difficulty,
            "threshold": threshold,
            "session_id": session.id,
            "attempt_number": attempt_number,
            "assisted_advance": assisted_advance,
            "audio_unclear": False,
            "audio_unclear_reason": None,
            "audio_size_bytes": audio_size,
            "audio_size_kb": round(audio_size / 1024, 1),
            "duration_seconds": duration_seconds or 0,
            "content_type": content_type,
            "whisper_model": WHISPER_MODEL_SIZE,
            "tutor_memory_event_id": tutor_event_id,
        }

    finally:
        os.unlink(tmp_path)
