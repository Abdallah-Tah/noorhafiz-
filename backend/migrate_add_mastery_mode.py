"""
Migration: Add Practice Mode + Memory Check columns to Child and Mastery tables.
Preserves existing data. Safe for SQLite (catches duplicate column errors).
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from app.database import engine, SessionLocal

COLUMNS_CHILD = [
    ("repeat_each_ayah", "INTEGER NOT NULL DEFAULT 3"),
    ("memory_check_pass_score", "INTEGER NOT NULL DEFAULT 70"),
    ("hide_text_in_memory_check", "BOOLEAN NOT NULL DEFAULT 1"),
]

COLUMNS_MASTERY = [
    ("practice_pass_count", "INTEGER NOT NULL DEFAULT 0"),
    ("ready_for_memory_check", "BOOLEAN NOT NULL DEFAULT 0"),
    ("memorized", "BOOLEAN NOT NULL DEFAULT 0"),
    ("memory_check_attempts", "INTEGER NOT NULL DEFAULT 0"),
    ("memory_check_best_accuracy", "FLOAT NOT NULL DEFAULT 0.0"),
]


def add_columns_safe(conn, table: str, columns: list[tuple[str, str]]):
    """Add columns with try/except for SQLite duplicate column safety."""
    for col_name, col_def in columns:
        try:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
            conn.commit()
            print(f"  ✓ Added {table}.{col_name}")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print(f"  - {table}.{col_name} already exists, skipping")
            else:
                print(f"  ✗ Failed to add {table}.{col_name}: {e}")
                raise


def set_defaults_by_difficulty(conn):
    """Set repeat_each_ayah based on existing child difficulty levels."""
    try:
        # Beginner: 3, Medium: 3, Advanced: 1, Hard: 1
        # But only update children where repeat_each_ayah is still the default (3)
        # and difficulty suggests otherwise.
        result = conn.execute(text(
            "UPDATE children SET repeat_each_ayah = 1 "
            "WHERE difficulty IN ('advanced', 'hard') "
            "AND (repeat_each_ayah = 3 OR repeat_each_ayah IS NULL)"
        ))
        conn.commit()
        if result.rowcount > 0:
            print(f"  ✓ Set repeat_each_ayah=1 for {result.rowcount} advanced/hard children")
        else:
            print("  - No advanced/hard children needed adjustment")
    except Exception as e:
        print(f"  ⚠ Could not set difficulty-based defaults: {e}")


def main():
    print("NoorHafiz — Migration: Practice Mode + Memory Check columns")
    print("=" * 60)

    with engine.connect() as conn:
        print("\n1. Adding columns to children table...")
        add_columns_safe(conn, "children", COLUMNS_CHILD)

        print("\n2. Setting repeat_each_ayah defaults by difficulty...")
        set_defaults_by_difficulty(conn)

        print("\n3. Adding columns to mastery table...")
        add_columns_safe(conn, "mastery", COLUMNS_MASTERY)

    print("\n✅ Migration complete.")
    print("\nNew columns added:")
    print("  children: repeat_each_ayah, memory_check_pass_score, hide_text_in_memory_check")
    print("  mastery:  practice_pass_count, ready_for_memory_check, memorized,")
    print("            memory_check_attempts, memory_check_best_accuracy")


if __name__ == "__main__":
    main()
