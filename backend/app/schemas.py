from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ── Auth ──

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── User (Parent) ──

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "parent"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    language: Optional[str] = None
    qiraa: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    language: str
    qiraa: str
    created_at: datetime
    children: list["ChildResponse"] = []

    model_config = {"from_attributes": True}


# ── Child ──

class ChildCreate(BaseModel):
    name: str
    age: Optional[int] = None
    avatar: Optional[str] = None


class ChildUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    avatar: Optional[str] = None
    current_surah: Optional[int] = None
    current_ayah: Optional[int] = None
    difficulty: Optional[str] = None  # beginner | medium | advanced | hard
    voice_tutor: Optional[bool] = None
    repeat_each_ayah: Optional[int] = None
    memory_check_pass_score: Optional[int] = None
    hide_text_in_memory_check: Optional[bool] = None


class ChildResponse(BaseModel):
    id: int
    parent_id: int
    name: str
    age: Optional[int] = None
    avatar: Optional[str] = None
    current_surah: int
    current_ayah: int
    streak_days: int
    total_mastered: int
    total_practiced: int
    difficulty: str = "medium"
    voice_tutor: bool = True
    repeat_each_ayah: int = 3
    memory_check_pass_score: int = 70
    hide_text_in_memory_check: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Practice Session ──

class SessionCreate(BaseModel):
    child_id: int
    surah: int
    ayah_start: int
    ayah_end: int
    accuracy: float
    words_correct: int
    words_total: int
    mistakes: Optional[str] = None
    status: str = "completed"
    duration_seconds: int = 0


class SessionResponse(BaseModel):
    id: int
    child_id: int
    surah: int
    ayah_start: int
    ayah_end: int
    accuracy: float
    words_correct: int
    words_total: int
    mistakes: Optional[str] = None
    status: str
    duration_seconds: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Mastery ──

class MasteryResponse(BaseModel):
    id: int
    child_id: int
    surah: int
    ayah: int
    mastered: bool
    attempts: int
    best_accuracy: float
    practice_pass_count: int
    ready_for_memory_check: bool
    memorized: bool
    memory_check_attempts: int
    memory_check_best_accuracy: float
    last_practiced: datetime

    model_config = {"from_attributes": True}


# ── Dashboard ──

class DashboardStats(BaseModel):
    child: ChildResponse
    recent_sessions: list[SessionResponse]
    mastery_progress: dict  # {surah_num: {mastered: int, total: int}}


# ── Mastery Progress ──

class MasteryProgressRequest(BaseModel):
    child_id: int
    surah: int
    ayah: int
    accuracy: float
