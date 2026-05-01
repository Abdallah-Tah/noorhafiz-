"""Add good_word column to tutor_memory_events table.

Lets the tutor praise a specific word the child got right
(e.g. "Nice — 'Allah' was clear, let's work on the ending.")
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noorhafiz.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(tutor_memory_events)")
    columns = [row[1] for row in cur.fetchall()]

    if "good_word" not in columns:
        cur.execute("ALTER TABLE tutor_memory_events ADD COLUMN good_word VARCHAR")
        print("Added 'good_word' column to tutor_memory_events")
    else:
        print("'good_word' column already present — skipping")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
