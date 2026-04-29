"""Add learning path columns to children table.
Run: cd backend && .venv/bin/python3 migrate_add_learning_path.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "noorhafiz.db")

COLUMNS = [
    ("children", "learning_path_preset", "VARCHAR DEFAULT 'fatiha_forward'"),
    ("children", "learning_start_surah", "INTEGER DEFAULT 1"),
    ("children", "learning_start_ayah", "INTEGER DEFAULT 1"),
    ("children", "learning_end_surah", "INTEGER DEFAULT 114"),
    ("children", "learning_end_ayah", "INTEGER DEFAULT 6"),
    ("children", "learning_completion_behavior", "VARCHAR DEFAULT 'stop'"),
]

def main():
    conn = sqlite3.connect(DB_PATH)
    for table, col_name, col_def in COLUMNS:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")
            print(f"  Added {table}.{col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  Skip {table}.{col_name} (already exists)")
            else:
                raise
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    main()
