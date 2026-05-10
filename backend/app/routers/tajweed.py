"""Tajweed learning section — Ayman-Suwaid progressive curriculum.

Endpoints:
  GET  /tajweed/lessons                    — full curriculum, no per-child state
  GET  /tajweed/progress/{child_id}        — child's lesson tree with status
  POST /tajweed/lesson/{lesson_id}/drill-pass  — increment drill_pass_count
  POST /tajweed/lesson/{lesson_id}/complete    — mark mastered (manual or
                                                  auto when drill_pass_count
                                                  reaches drill_pass_target)

Lesson content (titles, explanations, demo words) is static and lives in
backend/seeds/tajweed_curriculum.json — loaded into the DB by
migrate_add_tajweed.py. Per-child state is computed by joining
tajweed_progress against the lesson list, with locked/available derived from
prerequisite_ids.
"""
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.models import Child, TajweedLesson, TajweedProgress, User

router = APIRouter(prefix="/tajweed", tags=["tajweed"])


class LessonOut(BaseModel):
    id: int
    order_index: int
    stage: str
    topic_key: str
    title_ar: str
    title_en: str
    explanation_ar: str
    explanation_en: str
    demo_words: List[str]
    demo_ayat: list
    prerequisite_ids: List[int]
    drill_pass_target: int


class LessonWithProgress(LessonOut):
    status: str  # 'locked' | 'available' | 'in_progress' | 'mastered'
    drill_pass_count: int
    mastered_at: Optional[datetime]


def _serialize_lesson(lesson: TajweedLesson) -> LessonOut:
    return LessonOut(
        id=lesson.id,
        order_index=lesson.order_index,
        stage=lesson.stage,
        topic_key=lesson.topic_key,
        title_ar=lesson.title_ar,
        title_en=lesson.title_en,
        explanation_ar=lesson.explanation_ar,
        explanation_en=lesson.explanation_en,
        demo_words=json.loads(lesson.demo_words or "[]"),
        demo_ayat=json.loads(lesson.demo_ayat or "[]"),
        prerequisite_ids=json.loads(lesson.prerequisite_ids or "[]"),
        drill_pass_target=lesson.drill_pass_target or 5,
    )


def _verify_child(db: Session, user: User, child_id: int) -> Child:
    child = db.query(Child).filter(Child.id == child_id, Child.parent_id == user.id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


@router.get("/lessons", response_model=List[LessonOut])
def list_lessons(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return the full curriculum in Suwaid's progression order."""
    lessons = db.query(TajweedLesson).order_by(TajweedLesson.order_index).all()
    return [_serialize_lesson(l) for l in lessons]


@router.get("/progress/{child_id}", response_model=List[LessonWithProgress])
def get_progress(
    child_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return every lesson with this child's status (locked / available / mastered)."""
    _verify_child(db, user, child_id)
    lessons = db.query(TajweedLesson).order_by(TajweedLesson.order_index).all()
    progress_rows = db.query(TajweedProgress).filter(TajweedProgress.child_id == child_id).all()
    progress_by_lesson: dict[int, TajweedProgress] = {p.lesson_id: p for p in progress_rows}

    mastered_ids: set[int] = {p.lesson_id for p in progress_rows if p.status == "mastered"}

    out: List[LessonWithProgress] = []
    for lesson in lessons:
        prereq_ids: List[int] = json.loads(lesson.prerequisite_ids or "[]")
        prog = progress_by_lesson.get(lesson.id)
        if prog and prog.status == "mastered":
            status = "mastered"
        elif prog and prog.status == "in_progress":
            status = "in_progress"
        else:
            # Auto-derived: available iff all prereqs mastered (or no prereqs).
            if all(pid in mastered_ids for pid in prereq_ids):
                status = "available"
            else:
                status = "locked"
        out.append(
            LessonWithProgress(
                **_serialize_lesson(lesson).model_dump(),
                status=status,
                drill_pass_count=prog.drill_pass_count if prog else 0,
                mastered_at=prog.mastered_at if prog else None,
            )
        )
    return out


def _get_or_create_progress(db: Session, child_id: int, lesson_id: int) -> TajweedProgress:
    prog = (
        db.query(TajweedProgress)
        .filter(TajweedProgress.child_id == child_id, TajweedProgress.lesson_id == lesson_id)
        .first()
    )
    if prog is None:
        prog = TajweedProgress(child_id=child_id, lesson_id=lesson_id, status="in_progress", drill_pass_count=0)
        db.add(prog)
        db.flush()
    return prog


class DrillPassRequest(BaseModel):
    child_id: int


@router.post("/lesson/{lesson_id}/drill-pass", response_model=LessonWithProgress)
def record_drill_pass(
    lesson_id: int,
    body: DrillPassRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Increment drill_pass_count. Auto-masters the lesson once the count
    hits drill_pass_target."""
    _verify_child(db, user, body.child_id)
    lesson = db.query(TajweedLesson).filter(TajweedLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    prog = _get_or_create_progress(db, body.child_id, lesson_id)
    if prog.status != "mastered":
        prog.drill_pass_count = (prog.drill_pass_count or 0) + 1
        prog.status = "in_progress"
        target = lesson.drill_pass_target or 5
        if prog.drill_pass_count >= target:
            prog.status = "mastered"
            prog.mastered_at = datetime.utcnow()
    db.commit()
    db.refresh(prog)
    return _build_lesson_with_progress(db, lesson, body.child_id)


class CompleteRequest(BaseModel):
    child_id: int


@router.post("/lesson/{lesson_id}/complete", response_model=LessonWithProgress)
def complete_lesson(
    lesson_id: int,
    body: CompleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually mark a lesson mastered (e.g. parent override)."""
    _verify_child(db, user, body.child_id)
    lesson = db.query(TajweedLesson).filter(TajweedLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    prog = _get_or_create_progress(db, body.child_id, lesson_id)
    prog.status = "mastered"
    prog.mastered_at = datetime.utcnow()
    if (prog.drill_pass_count or 0) < (lesson.drill_pass_target or 5):
        prog.drill_pass_count = lesson.drill_pass_target or 5
    db.commit()
    db.refresh(prog)
    return _build_lesson_with_progress(db, lesson, body.child_id)


def _build_lesson_with_progress(db: Session, lesson: TajweedLesson, child_id: int) -> LessonWithProgress:
    """Serialize a single lesson with this child's status, including the
    locked/available derivation from prerequisite mastery."""
    prog = (
        db.query(TajweedProgress)
        .filter(TajweedProgress.child_id == child_id, TajweedProgress.lesson_id == lesson.id)
        .first()
    )
    prereq_ids: List[int] = json.loads(lesson.prerequisite_ids or "[]")
    if prog and prog.status == "mastered":
        status = "mastered"
    elif prog and prog.status == "in_progress":
        status = "in_progress"
    else:
        mastered_count = (
            db.query(TajweedProgress)
            .filter(
                TajweedProgress.child_id == child_id,
                TajweedProgress.status == "mastered",
                TajweedProgress.lesson_id.in_(prereq_ids) if prereq_ids else False,
            )
            .count()
        )
        status = "available" if mastered_count == len(prereq_ids) else "locked"

    return LessonWithProgress(
        **_serialize_lesson(lesson).model_dump(),
        status=status,
        drill_pass_count=prog.drill_pass_count if prog else 0,
        mastered_at=prog.mastered_at if prog else None,
    )
