"""Create tajweed_lessons + tajweed_progress tables and load the seed curriculum.

Idempotent — safe to run multiple times. Existing lessons are updated by
topic_key (so editing the seed JSON and re-running picks up changes without
wiping per-child progress).
"""
import json
import os
import sqlite3
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noorhafiz.db")
SEED_PATH = (
    Path(__file__).resolve().parent / "seeds" / "tajweed_curriculum.json"
)


def ensure_tables(cur: sqlite3.Cursor) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tajweed_lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_index INTEGER NOT NULL,
            stage TEXT NOT NULL,
            topic_key TEXT UNIQUE NOT NULL,
            title_ar TEXT NOT NULL,
            title_en TEXT NOT NULL,
            explanation_ar TEXT NOT NULL,
            explanation_en TEXT NOT NULL,
            demo_words TEXT NOT NULL,
            demo_ayat TEXT,
            prerequisite_ids TEXT,
            drill_pass_target INTEGER DEFAULT 5
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_tajweed_lessons_topic_key "
        "ON tajweed_lessons (topic_key)"
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tajweed_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            child_id INTEGER NOT NULL,
            lesson_id INTEGER NOT NULL,
            status TEXT DEFAULT 'available',
            drill_pass_count INTEGER DEFAULT 0,
            last_attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            mastered_at DATETIME,
            FOREIGN KEY (child_id) REFERENCES children (id),
            FOREIGN KEY (lesson_id) REFERENCES tajweed_lessons (id)
        )
        """
    )
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tajweed_progress_child_lesson "
        "ON tajweed_progress (child_id, lesson_id)"
    )


def load_seed(cur: sqlite3.Cursor) -> int:
    if not SEED_PATH.exists():
        print(f"Seed file not found at {SEED_PATH} — skipping seed load")
        return 0
    with open(SEED_PATH, encoding="utf-8") as f:
        lessons = json.load(f)

    # Two-pass insert so prerequisite_keys can resolve to ids regardless of
    # order in the JSON. Pass 1 inserts with empty prereqs; pass 2 fills them.
    topic_to_id: dict[str, int] = {}
    for lesson in lessons:
        cur.execute(
            "SELECT id FROM tajweed_lessons WHERE topic_key = ?",
            (lesson["topic_key"],),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                UPDATE tajweed_lessons SET
                    order_index = ?,
                    stage = ?,
                    title_ar = ?,
                    title_en = ?,
                    explanation_ar = ?,
                    explanation_en = ?,
                    demo_words = ?,
                    demo_ayat = ?,
                    drill_pass_target = ?
                WHERE topic_key = ?
                """,
                (
                    lesson["order_index"],
                    lesson["stage"],
                    lesson["title_ar"],
                    lesson["title_en"],
                    lesson["explanation_ar"],
                    lesson["explanation_en"],
                    json.dumps(lesson.get("demo_words", []), ensure_ascii=False),
                    json.dumps(lesson.get("demo_ayat", []), ensure_ascii=False),
                    int(lesson.get("drill_pass_target", 5)),
                    lesson["topic_key"],
                ),
            )
            topic_to_id[lesson["topic_key"]] = existing[0]
        else:
            cur.execute(
                """
                INSERT INTO tajweed_lessons (
                    order_index, stage, topic_key, title_ar, title_en,
                    explanation_ar, explanation_en, demo_words, demo_ayat,
                    prerequisite_ids, drill_pass_target
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lesson["order_index"],
                    lesson["stage"],
                    lesson["topic_key"],
                    lesson["title_ar"],
                    lesson["title_en"],
                    lesson["explanation_ar"],
                    lesson["explanation_en"],
                    json.dumps(lesson.get("demo_words", []), ensure_ascii=False),
                    json.dumps(lesson.get("demo_ayat", []), ensure_ascii=False),
                    json.dumps([]),  # filled in pass 2
                    int(lesson.get("drill_pass_target", 5)),
                ),
            )
            topic_to_id[lesson["topic_key"]] = cur.lastrowid

    # Pass 2 — resolve prerequisite_keys → ids
    for lesson in lessons:
        prereq_keys = lesson.get("prerequisite_keys", [])
        prereq_ids = [topic_to_id[k] for k in prereq_keys if k in topic_to_id]
        cur.execute(
            "UPDATE tajweed_lessons SET prerequisite_ids = ? WHERE topic_key = ?",
            (json.dumps(prereq_ids), lesson["topic_key"]),
        )

    return len(lessons)


def migrate() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        ensure_tables(cur)
        n = load_seed(cur)
        conn.commit()
        print(f"Tajweed migration complete — {n} lessons in seed")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
