import os
import tempfile
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child, PracticeSession, Mastery
from app.auth import get_current_user
from app.routers.quran import get_ayah

router = APIRouter(prefix="/recite", tags=["recite"])

# Global cached Whisper model — loaded once, reused across requests
_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_model


# Difficulty configuration
DIFFICULTY_CONFIG = {
    "beginner": {
        "advance_threshold": 60,
        "style": "encouraging",
        "max_feedback_words": 3,
        "show_transcript": False,
    },
    "medium": {
        "advance_threshold": 75,
        "style": "balanced",
        "max_feedback_words": 5,
        "show_transcript": True,
    },
    "advanced": {
        "advance_threshold": 85,
        "style": "detailed",
        "max_feedback_words": 10,
        "show_transcript": True,
    },
    "hard": {
        "advance_threshold": 90,
        "style": "strict",
        "max_feedback_words": 10,
        "show_transcript": True,
    },
}


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using faster-whisper (cached model)."""
    model = get_whisper_model()
    segments, info = model.transcribe(audio_path, language="ar")
    text = "".join(s.text for s in segments).strip()
    return text


def normalize_arabic(text: str) -> str:
    """Basic Arabic text normalization for comparison."""
    import re
    text = re.sub(r'[\u0617-\u061A\u064B-\u065F\u0670]', '', text)
    text = text.replace('\u0640', '')
    text = text.replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا').replace('ٱ', 'ا')
    text = text.replace('ى', 'ي')
    text = re.sub(r'[^\u0600-\u06FF\s]', '', text)
    return text.strip()


def compare_texts(reference: str, transcription: str) -> dict:
    """Compare reference ayah text with transcription word-by-word."""
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


def generate_feedback(
    accuracy: float,
    result: dict,
    difficulty: str,
    surah_name: str,
    ayah: int,
) -> str:
    """Generate kid-friendly feedback based on difficulty level and scoring result."""
    config = DIFFICULTY_CONFIG.get(difficulty, DIFFICULTY_CONFIG["medium"])
    style = config["style"]
    max_words = config["max_feedback_words"]
    correct = result["correct"]
    total = result["total"]
    mistakes = result["mistakes"][:max_words]
    missing = result["missing"][:max_words]

    if style == "encouraging":
        # Beginner: short, friendly, repeat-after-me style
        if accuracy >= 90:
            return f"Amazing! You said it perfectly! Ready for the next ayah?"
        elif accuracy >= 60:
            missing_words = ", ".join(m["word"] for m in missing[:2])
            if missing_words:
                return f"Good try! Listen again for: {missing_words}. You can do it!"
            return f"Good job! {correct} out of {total} words right. Keep going!"
        else:
            return f"Let's try again! Listen carefully and repeat after me. You got {correct} out of {total}."

    elif style == "balanced":
        # Medium: normal scoring
        if accuracy >= 90:
            return f"Excellent work on {surah_name} ayah {ayah}! You got {correct}/{total} words right."
        elif accuracy >= 60:
            wrong = ", ".join(f"{m['expected']}→{m['got']}" for m in mistakes[:2])
            miss = ", ".join(m["word"] for m in missing[:2])
            parts = [f"Good effort! {correct}/{total} correct."]
            if wrong:
                parts.append(f"Fix: {wrong}")
            if miss:
                parts.append(f"Missing: {miss}")
            return " ".join(parts)
        else:
            return f"Try again. You got {correct}/{total}. Listen once more and repeat carefully."

    elif style == "detailed":
        # Advanced: more correction details
        if accuracy >= 90:
            return f"Very good. {correct}/{total} words correct. Minor details to polish."
        elif accuracy >= 60:
            wrong = ", ".join(f"{m['expected']}→{m['got']} (word {m['position']})" for m in mistakes[:3])
            miss = ", ".join(f"{m['word']} (word {m['position']})" for m in missing[:3])
            parts = [f"{correct}/{total} correct."]
            if wrong:
                parts.append(f"Mistakes: {wrong}")
            if miss:
                parts.append(f"Missing: {miss}")
            return " ".join(parts)
        else:
            return f"Need more practice. {correct}/{total}. Review the ayah and try again."

    else:  # strict / hard
        if accuracy >= 90:
            return f"Passed. {correct}/{total}. Next ayah."
        else:
            wrong = ", ".join(f"{m['expected']}→{m['got']}" for m in mistakes[:5])
            miss = ", ".join(m["word"] for m in missing[:5])
            parts = [f"Not passed. {correct}/{total}."]
            if wrong:
                parts.append(f"Errors: {wrong}")
            if miss:
                parts.append(f"Missing: {miss}")
            return " ".join(parts)


def generate_voice_text(
    accuracy: float,
    result: dict,
    difficulty: str,
    surah_name: str,
    ayah: int,
) -> str:
    """Generate short text for TTS voice tutor. Keep it brief for kids."""
    correct = result["correct"]
    total = result["total"]
    missing = result["missing"][:2]

    if accuracy >= 90:
        return f"Great job! You got it right! Let's move to the next ayah."
    elif accuracy >= 60:
        miss_words = ", ".join(m["word"] for m in missing[:2])
        if miss_words:
            return f"Good try. You missed {miss_words}. Listen again and repeat after me."
        return f"Good effort! {correct} out of {total}. Let's keep going."
    else:
        miss_words = ", ".join(m["word"] for m in missing[:2])
        if miss_words:
            return f"Let's try again. Listen carefully for: {miss_words}. Repeat after me."
        return f"Listen again carefully and try one more time. You can do it!"


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
    Returns accuracy, mistakes, feedback, voice_text, and whether to advance.
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
        tmp_path = tmp.name

    try:
        # Transcribe
        transcript = transcribe_audio(tmp_path)

        # Get reference text from Quran API
        ref_data = await get_ayah(surah, ayah)
        reference_text = ref_data.get("data", {}).get("text", "")

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
            }

        # Compare
        result = compare_texts(reference_text, transcript)
        accuracy = result["accuracy"]
        threshold = config["advance_threshold"]
        should_advance = accuracy >= threshold

        # Get surah name for feedback
        from app.routers.quran import SURAH_NAMES
        surah_name = SURAH_NAMES.get(surah, f"Surah {surah}")

        # Generate feedback
        feedback = generate_feedback(accuracy, result, difficulty, surah_name, ayah)
        voice_text = generate_voice_text(accuracy, result, difficulty, surah_name, ayah)

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
            status="mastered" if accuracy >= 90 else "practicing" if should_advance else "needs-work",
            duration_seconds=0,
        )
        db.add(session)

        # Update mastery
        mastery = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.surah == surah,
            Mastery.ayah == ayah,
        ).first()
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
        }

    finally:
        os.unlink(tmp_path)
