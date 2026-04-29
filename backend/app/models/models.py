from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    """Parent or standalone user account."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="parent")  # "parent" | "admin"
    language = Column(String, default="en")  # "en" | "ar" | "fr"
    qiraa = Column(String, default="hafs")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    children = relationship("Child", back_populates="parent", cascade="all, delete-orphan")


class Child(Base):
    """Child profile linked to a parent account."""
    __tablename__ = "children"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=True)
    avatar = Column(String, nullable=True)  # emoji or color
    current_surah = Column(Integer, default=1)  # surah number
    current_ayah = Column(Integer, default=1)  # ayah number
    streak_days = Column(Integer, default=0)
    total_mastered = Column(Integer, default=0)
    total_practiced = Column(Integer, default=0)
    difficulty = Column(String, default="medium")  # beginner | medium | advanced | hard
    voice_tutor = Column(Boolean, default=True)  # voice feedback ON/OFF
    repeat_each_ayah = Column(Integer, default=3)  # how many times to repeat ayah before advancing
    memory_check_pass_score = Column(Integer, default=70)  # score threshold for memory check (70/80/90)
    hide_text_in_memory_check = Column(Boolean, default=True)
    learning_path_preset = Column(String, default="fatiha_forward")
    learning_start_surah = Column(Integer, default=1)
    learning_start_ayah = Column(Integer, default=1)
    learning_end_surah = Column(Integer, default=114)
    learning_end_ayah = Column(Integer, default=6)
    learning_completion_behavior = Column(String, default="stop")  # hide ayah text during memory check
    created_at = Column(DateTime, server_default=func.now())

    parent = relationship("User", back_populates="children")
    sessions = relationship("PracticeSession", back_populates="child", cascade="all, delete-orphan")


class PracticeSession(Base):
    """A single recitation practice session."""
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    surah = Column(Integer, nullable=False)
    ayah_start = Column(Integer, nullable=False)
    ayah_end = Column(Integer, nullable=False)
    accuracy = Column(Float, default=0.0)  # 0-100
    words_correct = Column(Integer, default=0)
    words_total = Column(Integer, default=0)
    mistakes = Column(Text, nullable=True)  # JSON string of mistakes
    status = Column(String, default="completed")  # completed | mastering | needs-work
    duration_seconds = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    child = relationship("Child", back_populates="sessions")


class TutorMemoryEvent(Base):
    """Snapshot of a practice result for OpenClaw tutor intelligence.
    One row per scoring result. Used by OpenClaw to generate personalized
    tutor messages. Never stores critical learning data — DB is source of truth."""
    __tablename__ = "tutor_memory_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    child_name = Column(String, nullable=False)
    surah = Column(Integer, nullable=False)
    surah_name = Column(String, nullable=False)
    ayah = Column(Integer, nullable=False)
    accuracy = Column(Float, nullable=False)
    passed = Column(Boolean, nullable=False)
    repeat_count = Column(Integer, default=0)
    repeat_goal = Column(Integer, default=3)
    hard_word = Column(String, nullable=True)
    audio_unclear = Column(Boolean, default=False)
    action = Column(String, nullable=False)  # retry | repeat | move_next | memory_check | new_surah | lesson_complete
    previous_ayah = Column(Integer, nullable=True)
    previous_surah_name = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Mastery(Base):
    """Track which ayahs a child has mastered."""
    __tablename__ = "mastery"

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    surah = Column(Integer, nullable=False)
    ayah = Column(Integer, nullable=False)
    mastered = Column(Boolean, default=False)  # legacy — still tracked for backward compat
    attempts = Column(Integer, default=0)
    best_accuracy = Column(Float, default=0.0)
    practice_pass_count = Column(Integer, default=0)  # times passed this ayah in practice
    ready_for_memory_check = Column(Boolean, default=False)  # ready for memory check mode
    memorized = Column(Boolean, default=False)  # confirmed via memory check
    memory_check_attempts = Column(Integer, default=0)  # number of memory check attempts
    memory_check_best_accuracy = Column(Float, default=0.0)  # best score in memory check
    last_practiced = Column(DateTime, server_default=func.now())
