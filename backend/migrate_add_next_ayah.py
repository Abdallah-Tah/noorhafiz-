"""Add next_ayah column to tutor_memory_events table.

Lets the tutor message say the correct next ayah number
(e.g. "Moving to Ayah 2" instead of "Moving to Ayah 1").
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noorhafiz.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(tutor_memory_events)")
    columns = [row[1] for row in cur.fetchall()]

    if "next_ayah" not in columns:
        cur.execute("ALTER TABLE tutor_memory_events ADD COLUMN next_ayah INTEGER")
        print("Added 'next_ayah' column to tutor_memory_events")
    else:
        print("'next_ayah' column already present — skipping")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
