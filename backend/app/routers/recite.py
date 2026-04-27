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


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using faster-whisper (cached model)."""
    model = get_whisper_model()
    segments, info = model.transcribe(audio_path, language="ar")
    text = "".join(s.text for s in segments).strip()
    return text


def normalize_arabic(text: str) -> str:
    """Basic Arabic text normalization for comparison."""
    import re
    # Remove diacritics (tashkeel)
    text = re.sub(r'[\u0617-\u061A\u064B-\u065F\u0670]', '', text)
    # Remove tatweel
    text = text.replace('\u0640', '')
    # Normalize alef variants
    text = text.replace('آ', 'ا').replace('أ', 'ا').replace('إ', 'ا').replace('ٱ', 'ا')
    # Normalize ya
    text = text.replace('ى', 'ي')
    # Remove non-Arabic chars
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

    # Simple alignment: match words in order
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
    Returns accuracy, mistakes, and feedback.
    """
    # Verify child belongs to parent
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

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
                "should_advance": False,
                "details": {},
            }

        # Compare
        result = compare_texts(reference_text, transcript)
        accuracy = result["accuracy"]
        should_advance = accuracy >= 60

        # Generate feedback
        if accuracy >= 90:
            feedback = "Excellent! You recited this ayah perfectly!"
        elif accuracy >= 70:
            feedback = f"Good effort! You got {result['correct']} out of {result['total']} words right. Keep practicing!"
        elif accuracy >= 50:
            feedback = f"Keep going! You got {result['correct']} out of {result['total']} words. Listen again and try once more."
        else:
            feedback = f"Let's try again. Listen carefully to the recitation and repeat. ({result['correct']}/{result['total']} words)"

        if result["missing"]:
            words = ", ".join(m["word"] for m in result["missing"][:3])
            feedback += f" Missing words: {words}"

        if result["mistakes"]:
            words = ", ".join(f"{m['expected']}→{m['got']}" for m in result["mistakes"][:3])
            feedback += f" Mistakes: {words}"

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
            status="mastered" if accuracy >= 90 else "practicing" if accuracy >= 60 else "needs-work",
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
            "should_advance": should_advance,
            "details": result,
            "session_id": session.id,
        }

    finally:
        os.unlink(tmp_path)
