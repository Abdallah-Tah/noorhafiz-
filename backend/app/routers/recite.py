import os
import re
import tempfile
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child, PracticeSession, Mastery
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


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        logger.info("[whisper] Loading model: %s", WHISPER_MODEL_SIZE)
        _whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        logger.info("[whisper] Model loaded: %s", WHISPER_MODEL_SIZE)
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


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using faster-whisper (cached model)."""
    model = get_whisper_model()
    segments, info = model.transcribe(audio_path, language="ar")
    text = "".join(s.text for s in segments).strip()
    return text


def normalize_arabic(text: str) -> str:
    """
    Thorough Arabic normalization for comparison.
    - Remove tashkeel/harakat (fatha, damma, kasra, shadda, sukun, etc.)
    - Remove pause marks (waqf marks: ۚ ۛ ۙ ۘ)
    - Remove punctuation and non-Arabic characters
    - Remove tatweel (kashida)
    - Normalize Alef variants: أ إ آ ٱ → ا
    - Normalize Ya: ى → ي
    - Normalize Waw Hamza: ؤ → و
    - Normalize Alef Maksura is handled by Ya normalization
    - Collapse extra spaces
    """
    if not text:
        return ""

    # Remove tashkeel (harakat): Fatha, Damma, Kasra, Shadda, Sukun,
    # Fathatan, Dammatan, Kasratan, Superscript Alef, etc.
    text = re.sub(r'[\u064B-\u065F\u0617-\u061A\u0670]', '', text)

    # Remove Quran-specific pause/waqf marks
    text = re.sub(r'[\u06D6-\u06ED]', '', text)

    # Remove tatweel/kashida
    text = text.replace('\u0640', '')

    # Normalize Alef variants → bare Alef
    text = text.replace('آ', 'ا')   # Alef madda
    text = text.replace('أ', 'ا')   # Alef hamza on top
    text = text.replace('إ', 'ا')   # Alef hamza below
    text = text.replace('ٱ', 'ا')   # Alef wasl

    # Normalize Ya / Alef Maksura
    text = text.replace('ى', 'ي')   # Alef maksura → Ya

    # Normalize Waw Hamza
    text = text.replace('ؤ', 'و')   # Waw hamza → Waw

    # Remove all non-Arabic-letter characters (keep only Arabic block + spaces)
    text = re.sub(r'[^\u0621-\u063A\u0641-\u064A\s]', '', text)

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
    reference_text: str,
) -> dict | None:
    """
    Detect if the audio recording is unclear, too short, or silent.
    Returns None if audio seems fine, or a dict with audio_unclear details.
    """
    # Check 1: audio file too small
    if audio_size < MIN_AUDIO_SIZE_BYTES:
        return {
            "audio_unclear": True,
            "reason": "audio_too_short_or_empty",
            "feedback": "I could not hear you clearly. Please try again close to the phone.",
        }

    # Check 2: empty transcript
    if not transcript or not transcript.strip():
        return {
            "audio_unclear": True,
            "reason": "empty_transcript",
            "feedback": "I could not hear the ayah clearly. Please try recording again close to the phone.",
        }

    # Check 3: transcript too short
    normalized = normalize_arabic(transcript)
    if len(normalized) < MIN_TRANSCRIPT_CHARS:
        return {
            "audio_unclear": True,
            "reason": "transcript_too_short",
            "feedback": "I could not hear the ayah clearly. Please try recording again close to the phone.",
        }

    # Check 4: no meaningful Arabic words detected
    if not _has_meaningful_arabic(transcript):
        return {
            "audio_unclear": True,
            "reason": "no_meaningful_arabic",
            "feedback": "I could not hear the ayah clearly. Please try recording again close to the phone.",
        }

    # Check 5: transcript has words but zero overlap with reference
    # (Whisper heard something but it's completely unrelated to the ayah)
    if reference_text:
        ref_words = set(normalize_arabic(reference_text).split())
        trans_words = set(normalized.split())
        overlap = ref_words & trans_words
        if len(overlap) == 0 and len(trans_words) <= 3:
            return {
                "audio_unclear": True,
                "reason": "transcript_unrelated",
                "feedback": "I could not hear the ayah clearly. Please try recording again close to the phone.",
            }

    return None


def compare_texts_positional(reference: str, transcription: str) -> dict:
    """
    Strict positional word-by-word comparison (for Medium/Advanced/Hard).
    Compares words in order and reports mistakes + missing words.
    """
    ref_words = normalize_arabic(reference).split()
    trans_words = normalize_arabic(transcription).split()

    if not ref_words:
        return {"accuracy": 0, "correct": 0, "total": 0, "missing": [], "extra": [], "mistakes": []}

    correct = 0
    mistakes = []
    missing = []

    for i, ref_word in enumerate(ref_words):
        if i < len(trans_words):
            if ref_word == trans_words[i]:
                correct += 1
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
    }


def compare_texts_fuzzy(reference: str, transcription: str) -> dict:
    """
    Fuzzy/contains-based comparison for Beginner mode (Stage 1: word memorization).
    """
    ref_words = normalize_arabic(reference).split()
    trans_words = normalize_arabic(transcription).split()

    if not ref_words:
        return {"accuracy": 0, "correct": 0, "total": 0, "missing": [], "extra": [], "mistakes": []}

    if not trans_words:
        return {
            "accuracy": 0,
            "correct": 0,
            "total": len(ref_words),
            "missing": [{"word": w, "position": i + 1} for i, w in enumerate(ref_words)],
            "extra": [],
            "mistakes": [],
        }

    used_indices = set()
    correct = 0
    missing = []
    mistakes = []

    for i, ref_word in enumerate(ref_words):
        found = False
        for j, trans_word in enumerate(trans_words):
            if j not in used_indices:
                if ref_word == trans_word:
                    used_indices.add(j)
                    correct += 1
                    found = True
                    break
                elif _words_similar(ref_word, trans_word):
                    used_indices.add(j)
                    correct += 1
                    found = True
                    break

        if not found:
            missing.append({"word": ref_word, "position": i + 1})

    extra_words = [trans_words[j] for j in range(len(trans_words)) if j not in used_indices]

    total = len(ref_words)
    accuracy = round((correct / total) * 100, 1) if total > 0 else 0

    return {
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "missing": missing,
        "extra": [{"word": w, "position": -1} for w in extra_words],
        "mistakes": mistakes,
    }


def _words_similar(word1: str, word2: str) -> bool:
    """Check if two Arabic words are similar enough for beginner mode."""
    if not word1 or not word2:
        return False
    if word1 == word2:
        return True
    shorter = min(len(word1), len(word2))
    longer = max(len(word1), len(word2))
    if shorter >= 2 and longer - shorter <= 2:
        if word1[:shorter] == word2[:shorter]:
            return True
    return False


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
        got = str(item.get("got", "")).strip()
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
    total = result.get("total", 0)
    mistakes = result.get("mistakes", [])[:max_words]
    missing = result.get("missing", [])[:max_words]
    extra = result.get("extra", [])[:max_words]

    score_line = f"I heard {correct}/{total} words correctly" if total else "I could not compare the words clearly"
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
        return "I could not hear the ayah clearly. Try recording again close to the phone."

    if style == "encouraging":
        if accuracy >= 99.5:
            return f"Amazing! I heard all {total} words correctly. Great job!"
        if accuracy >= config["advance_threshold"]:
            if practice_parts:
                return f"Good job — {score_line}. {' '.join(practice_parts)}"
            return f"Good job — {score_line}. You passed this ayah!"
        if practice_parts:
            return f"Good try — {score_line}. {' '.join(practice_parts)} Listen again, then repeat."
        return f"Good try — {score_line}. Listen again, then repeat."

    if style == "balanced":
        if accuracy >= 99.5:
            return f"Excellent — all {total}/{total} words matched in {surah_name} ayah {ayah}."
        if accuracy >= config["advance_threshold"]:
            return f"Passed — {score_line}. {' '.join(practice_parts)}".strip()
        return f"Not passed yet — {score_line}. {' '.join(practice_parts) or 'Listen again and retry.'}"

    if style == "detailed":
        if accuracy >= 99.5:
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
        return "I could not hear the ayah clearly. Please try recording again close to the phone."

    if accuracy >= 99.5:
        return f"Amazing! I heard all {total} words correctly. Let's go to the next ayah."

    if accuracy >= threshold:
        if focus_words:
            return f"Good job. I heard {correct} out of {total}. Practice {focus_words}, then let's continue."
        return f"Good job. I heard {correct} out of {total}. Let's continue."

    if focus_words:
        return f"Good try. I heard {correct} out of {total}. Practice {focus_words}. Listen again, then repeat."

    return f"Good try. I heard {correct} out of {total}. Listen again, then repeat."


@router.post("/test-mic")
async def test_microphone(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Test microphone: transcribe 3-second recording and return the transcript.
    Used for mic diagnostics — does NOT score or save anything.
    """
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_size = len(content)
        tmp_path = tmp.name

    try:
        transcript = transcribe_audio(tmp_path)

        logger.info(
            "[test-mic] user=%s audio_size=%d transcript=%r",
            current_user.id, audio_size, transcript,
        )

        return {
            "transcript": transcript,
            "audio_size_bytes": audio_size,
            "audio_size_kb": round(audio_size / 1024, 1),
            "has_meaningful_arabic": _has_meaningful_arabic(transcript),
            "normalized": normalize_arabic(transcript),
        }
    finally:
        os.unlink(tmp_path)


@router.post("/score")
async def score_recitation(
    audio: UploadFile = File(...),
    surah: int = Form(...),
    ayah: int = Form(...),
    child_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accept audio recording, transcribe with Whisper, compare against reference.
    Uses child's difficulty level for scoring thresholds and feedback style.

    Returns audio_unclear=true if recording is too short/silent/noisy,
    without saving to DB or advancing progress.
    """
    # Verify child belongs to parent
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    difficulty = child.difficulty or "medium"
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])

    # Save uploaded audio to temp file
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        audio_size = len(content)
        tmp_path = tmp.name

    try:
        # Transcribe
        transcript = transcribe_audio(tmp_path)

        # Get reference text from Quran API
        ref_data = await get_ayah(surah, ayah)
        reference_text = ref_data.get("data", {}).get("text", "")

        # Normalized versions for logging
        normalized_transcript = normalize_arabic(transcript)
        normalized_reference = normalize_arabic(reference_text)

        # ── Check for unclear audio BEFORE scoring ──
        unclear = detect_unclear_audio(audio_size, transcript, reference_text)

        if unclear:
            logger.info(
                "[score] audio_unclear child_id=%d surah=%d ayah=%d "
                "audio_size=%d reason=%s transcript=%r normalized_transcript=%r "
                "normalized_reference=%r whisper_model=tiny",
                child_id, surah, ayah, audio_size, unclear["reason"],
                transcript, normalized_transcript, normalized_reference,
            )
            return {
                "accuracy": 0,
                "transcript": transcript,
                "reference": reference_text,
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
        result = compare_texts(reference_text, transcript, difficulty)
        accuracy = result["accuracy"]
        threshold = config["advance_threshold"]

        # Check attempt count for assisted advance (beginner only)
        mastery = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.surah == surah,
            Mastery.ayah == ayah,
        ).first()
        attempt_number = (mastery.attempts + 1) if mastery else 1

        # Determine if child should advance
        should_advance = accuracy >= threshold
        assisted_advance = False

        # Beginner assisted progress
        if not should_advance and config.get("assisted_advance_attempts"):
            max_attempts = config["assisted_advance_attempts"]
            if attempt_number >= max_attempts:
                assisted_advance = True
                should_advance = True

        # Get surah name for feedback
        from app.routers.quran import SURAH_NAMES
        surah_name = SURAH_NAMES.get(surah, f"Surah {surah}")

        # ── Check for beginner 0% with almost no matching words ──
        # If accuracy is 0% in beginner mode, treat as unclear rather than harsh failure
        if accuracy == 0 and difficulty == "beginner":
            trans_words = set(normalized_transcript.split())
            ref_words = set(normalized_reference.split())
            overlap = trans_words & ref_words
            if len(overlap) == 0:
                logger.info(
                    "[score] beginner_0%_no_overlap child_id=%d surah=%d ayah=%d "
                    "treating as unclear",
                    child_id, surah, ayah,
                )
                return {
                    "accuracy": 0,
                    "transcript": transcript,
                    "reference": reference_text,
                    "feedback": "Good try. I could not hear the ayah clearly. Try again close to the phone and recite slowly.",
                    "voice_text": "Good try. I could not hear the ayah clearly. Try again close to the phone and recite slowly.",
                    "should_advance": False,
                    "details": result,
                    "difficulty": difficulty,
                    "threshold": threshold,
                    "attempt_number": 0,
                    "assisted_advance": False,
                    "audio_unclear": True,
                    "audio_unclear_reason": "beginner_zero_accuracy_no_overlap",
                    "audio_size_bytes": audio_size,
                    "audio_size_kb": round(audio_size / 1024, 1),
                }

        # Generate feedback
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

        # Determine session status
        if accuracy >= 90:
            status = "mastered"
        elif should_advance:
            status = "needs_practice" if assisted_advance else "practicing"
        else:
            status = "needs-work"

        # Save session to DB
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
                mastered=accuracy >= 90,
            )
            db.add(mastery)
        else:
            mastery.attempts += 1
            if accuracy > mastery.best_accuracy:
                mastery.best_accuracy = accuracy
            if accuracy >= 90:
                mastery.mastered = True

        # Update child stats
        child.total_practiced += 1
        mastered_count = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.mastered == True,
        ).count()
        child.total_mastered = mastered_count

        db.commit()

        # ── Debug logging ──
        logger.info(
            "[score] child_id=%d surah=%d ayah=%d audio_size=%d "
            "whisper_model=tiny transcript=%r normalized_transcript=%r "
            "normalized_reference=%r score=%.1f audio_unclear=False "
            "threshold=%d should_advance=%s attempt=%d",
            child_id, surah, ayah, audio_size,
            transcript, normalized_transcript, normalized_reference,
            accuracy, threshold, should_advance, attempt_number,
        )

        return {
            "accuracy": accuracy,
            "transcript": transcript,
            "reference": reference_text,
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
            "audio_size_bytes": audio_size,
            "audio_size_kb": round(audio_size / 1024, 1),
        }

    finally:
        os.unlink(tmp_path)
