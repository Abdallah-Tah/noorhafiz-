"""Add difficulty and voice_tutor columns to children table."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noorhafiz.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if columns already exist
    cur.execute("PRAGMA table_info(children)")
    columns = [row[1] for row in cur.fetchall()]

    if "difficulty" not in columns:
        cur.execute("ALTER TABLE children ADD COLUMN difficulty VARCHAR DEFAULT 'medium'")
        print("Added 'difficulty' column to children")

    if "voice_tutor" not in columns:
        cur.execute("ALTER TABLE children ADD COLUMN voice_tutor BOOLEAN DEFAULT 1")
        print("Added 'voice_tutor' column to children")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
