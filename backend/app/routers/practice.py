from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, Child, PracticeSession, Mastery
from app.schemas import SessionCreate, SessionResponse, DashboardStats
from app.auth import get_current_user

router = APIRouter(prefix="/practice", tags=["practice"])


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

    # Update mastery records
    for ayah in range(data.ayah_start, data.ayah_end + 1):
        mastery = db.query(Mastery).filter(
            Mastery.child_id == data.child_id,
            Mastery.surah == data.surah,
            Mastery.ayah == ayah,
        ).first()
        if not mastery:
            mastery = Mastery(
                child_id=data.child_id,
                surah=data.surah,
                ayah=ayah,
                attempts=1,
                best_accuracy=data.accuracy,
                mastered=data.accuracy >= 90,
            )
            db.add(mastery)
        else:
            mastery.attempts += 1
            if data.accuracy > mastery.best_accuracy:
                mastery.best_accuracy = data.accuracy
            if data.accuracy >= 90:
                mastery.mastered = True

    # Update child stats
    child.total_practiced += 1
    mastered_count = db.query(Mastery).filter(
        Mastery.child_id == data.child_id,
        Mastery.mastered == True,
    ).count()
    child.total_mastered = mastered_count

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
        if m.mastered:
            progress[key]["mastered"] += 1

    return DashboardStats(
        child=child,
        recent_sessions=recent,
        mastery_progress=progress,
    )
