from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child, PracticeSession, Mastery
from app.schemas import SessionCreate, SessionResponse, DashboardStats, MasteryProgressRequest
from app.auth import get_current_user

router = APIRouter(prefix="/practice", tags=["practice"])

# ── Helper: get or create mastery row ──

def _get_or_create_mastery(db: Session, child_id: int, surah: int, ayah: int) -> Mastery:
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
        )
        db.add(mastery)
        db.flush()
    return mastery


# ── Sessions ──

@router.post("/sessions", response_model=SessionResponse)
def create_session(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Verify child belongs to this parent
    child = db.query(Child).filter(Child.id == data.child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    session = PracticeSession(
        child_id=data.child_id,
        surah=data.surah,
        ayah_start=data.ayah_start,
        ayah_end=data.ayah_end,
        accuracy=data.accuracy,
        words_correct=data.words_correct,
        words_total=data.words_total,
        mistakes=data.mistakes,
        status=data.status,
        duration_seconds=data.duration_seconds,
    )
    db.add(session)

    # Update mastery records with new practice tracking logic
    child = db.query(Child).filter(Child.id == data.child_id).first()
    for ayah in range(data.ayah_start, data.ayah_end + 1):
        mastery = _get_or_create_mastery(db, data.child_id, data.surah, ayah)
        mastery.attempts += 1
        if data.accuracy > mastery.best_accuracy:
            mastery.best_accuracy = data.accuracy

        # Increment practice_pass_count and check repeat threshold
        mastery.practice_pass_count += 1
        if child and mastery.practice_pass_count >= child.repeat_each_ayah:
            mastery.ready_for_memory_check = True
        # Do NOT set memorized from practice sessions

    # Update child stats
    child.total_practiced += 1
    if child:
        memorized_count = db.query(Mastery).filter(
            Mastery.child_id == data.child_id,
            Mastery.memorized == True,
        ).count()
        child.total_mastered = memorized_count

    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{child_id}", response_model=list[SessionResponse])
def get_sessions(
    child_id: int,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    return (
        db.query(PracticeSession)
        .filter(PracticeSession.child_id == child_id)
        .order_by(PracticeSession.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/dashboard/{child_id}", response_model=DashboardStats)
def get_dashboard(
    child_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    recent = (
        db.query(PracticeSession)
        .filter(PracticeSession.child_id == child_id)
        .order_by(PracticeSession.created_at.desc())
        .limit(10)
        .all()
    )

    # Build mastery progress per surah
    masteries = db.query(Mastery).filter(Mastery.child_id == child_id).all()
    progress = {}
    for m in masteries:
        key = str(m.surah)
        if key not in progress:
            progress[key] = {"mastered": 0, "total": 0, "attempts": 0}
        progress[key]["total"] += 1
        progress[key]["attempts"] += m.attempts
        if m.mastered or m.memorized:
            progress[key]["mastered"] += 1

    return DashboardStats(
        child=child,
        recent_sessions=recent,
        mastery_progress=progress,
    )


# ── Mastery endpoints ──

@router.get("/mastery/{child_id}", response_model=list[dict])
def get_mastery(
    child_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all mastery rows for a child."""
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    rows = db.query(Mastery).filter(Mastery.child_id == child_id).all()
    result = []
    for m in rows:
        result.append({
            "id": m.id,
            "child_id": m.child_id,
            "surah": m.surah,
            "ayah": m.ayah,
            "mastered": m.mastered,
            "attempts": m.attempts,
            "best_accuracy": m.best_accuracy,
            "practice_pass_count": m.practice_pass_count or 0,
            "ready_for_memory_check": m.ready_for_memory_check or False,
            "memorized": m.memorized or False,
            "memory_check_attempts": m.memory_check_attempts or 0,
            "memory_check_best_accuracy": m.memory_check_best_accuracy or 0.0,
            "last_practiced": m.last_practiced.isoformat() if m.last_practiced else None,
        })
    return result


@router.get("/mastery/{child_id}/{surah}/{ayah}")
def get_ayah_mastery(
    child_id: int,
    surah: int,
    ayah: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get mastery row for a specific ayah."""
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    mastery = db.query(Mastery).filter(
        Mastery.child_id == child_id,
        Mastery.surah == surah,
        Mastery.ayah == ayah,
    ).first()

    if not mastery:
        return None

    return {
        "id": mastery.id,
        "child_id": mastery.child_id,
        "surah": mastery.surah,
        "ayah": mastery.ayah,
        "mastered": mastery.mastered,
        "attempts": mastery.attempts,
        "best_accuracy": mastery.best_accuracy,
        "practice_pass_count": mastery.practice_pass_count or 0,
        "ready_for_memory_check": mastery.ready_for_memory_check or False,
        "memorized": mastery.memorized or False,
        "memory_check_attempts": mastery.memory_check_attempts or 0,
        "memory_check_best_accuracy": mastery.memory_check_best_accuracy or 0.0,
        "last_practiced": mastery.last_practiced.isoformat() if mastery.last_practiced else None,
    }


# ── Practice pass tracking ──

@router.post("/mastery-progress")
def record_practice_pass(
    data: MasteryProgressRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a successful practice pass for an ayah.
    Increments practice_pass_count and checks repeat_each_ayah threshold."""
    child = db.query(Child).filter(Child.id == data.child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    mastery = _get_or_create_mastery(db, data.child_id, data.surah, data.ayah)
    mastery.attempts += 1
    if data.accuracy > (mastery.best_accuracy or 0):
        mastery.best_accuracy = data.accuracy

    # Increment practice_pass_count
    mastery.practice_pass_count = (mastery.practice_pass_count or 0) + 1

    # Check repeat threshold
    if mastery.practice_pass_count >= child.repeat_each_ayah:
        mastery.ready_for_memory_check = True

    # Do NOT set memorized from practice — only from memory check

    db.commit()
    db.refresh(mastery)

    return {
        "id": mastery.id,
        "child_id": mastery.child_id,
        "surah": mastery.surah,
        "ayah": mastery.ayah,
        "mastered": mastery.mastered,
        "attempts": mastery.attempts,
        "best_accuracy": mastery.best_accuracy,
        "practice_pass_count": mastery.practice_pass_count or 0,
        "ready_for_memory_check": mastery.ready_for_memory_check or False,
        "memorized": mastery.memorized or False,
        "memory_check_attempts": mastery.memory_check_attempts or 0,
        "memory_check_best_accuracy": mastery.memory_check_best_accuracy or 0.0,
        "last_practiced": mastery.last_practiced.isoformat() if mastery.last_practiced else None,
    }


# ── Memory Check ──

@router.post("/memory-check")
async def memory_check(
    child_id: int = Form(...),
    surah: int = Form(...),
    ayah: int = Form(...),
    audio_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Memory check scoring — child recites from memory, no reciter audio.
    Scores against reference, sets memorized if score >= child's pass threshold."""
    import os
    import tempfile
    import time
    import json
    import asyncio

    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == current_user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    # Save audio to temp file
    suffix = os.path.splitext(audio_file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio_file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Reuse Whisper transcription from recite.py
        from app.routers.recite import transcribe_audio, normalize_arabic, compare_texts, detect_unclear_audio

        # Transcribe
        transcript, whisper_load_ms, transcribe_ms = await asyncio.wait_for(
            asyncio.to_thread(transcribe_audio, tmp_path),
            timeout=90,
        )

        # Check for unclear audio
        audio_size = len(content)
        unclear = detect_unclear_audio(audio_size, transcript)
        if unclear:
            return {
                "accuracy": 0,
                "feedback": unclear["feedback"],
                "memorized": False,
                "transcript": transcript,
                "reference": "",
                "audio_unclear": True,
                "audio_unclear_reason": unclear["reason"],
            }

        # Get reference ayah text
        from app.routers.quran import get_ayah
        ref_data = await get_ayah(surah, ayah)
        reference_text = ref_data.get("data", {}).get("text", "")

        if not reference_text:
            return {
                "accuracy": 0,
                "feedback": "Could not load reference text.",
                "memorized": False,
                "transcript": transcript,
                "reference": "",
                "audio_unclear": False,
            }

        # Compare texts
        difficulty = child.difficulty or "medium"
        result = compare_texts(reference_text, transcript, difficulty)
        accuracy = result["accuracy"]

        # Update mastery record
        mastery = _get_or_create_mastery(db, child_id, surah, ayah)
        mastery.memory_check_attempts = (mastery.memory_check_attempts or 0) + 1
        if accuracy > (mastery.memory_check_best_accuracy or 0):
            mastery.memory_check_best_accuracy = accuracy

        pass_score = child.memory_check_pass_score or 70
        if accuracy >= pass_score:
            mastery.memorized = True
            mastery.ready_for_memory_check = False  # no longer "ready" — it's done!
        else:
            # Mark as needs practice — reset ready flag so they practice again
            mastery.ready_for_memory_check = False

        # Update child total_mastered from memorized count
        memorized_count = db.query(Mastery).filter(
            Mastery.child_id == child_id,
            Mastery.memorized == True,
        ).count()
        child.total_mastered = memorized_count

        db.commit()
        db.refresh(mastery)

        # Generate child-friendly feedback
        from app.routers.quran import SURAH_NAMES
        surah_name = SURAH_NAMES.get(surah, f"Surah {surah}")

        if mastery.memorized:
            feedback = f"MashaAllah, you remembered it! {accuracy:.0f}% accuracy — {surah_name} ayah {ayah} is memorized."
        else:
            feedback = f"Good try. You scored {accuracy:.0f}% (need {pass_score}%). Let's practice this one again."

        return {
            "accuracy": accuracy,
            "feedback": feedback,
            "memorized": mastery.memorized,
            "transcript": transcript,
            "reference": reference_text,
            "audio_unclear": False,
        }

    except asyncio.TimeoutError:
        return {
            "accuracy": 0,
            "feedback": "The scoring took too long. Please try again.",
            "memorized": False,
            "transcript": "",
            "reference": "",
            "audio_unclear": True,
            "audio_unclear_reason": "transcription_timeout",
        }
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
