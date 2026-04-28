import os
from dotenv import load_dotenv # type: ignore
load_dotenv()

from database import engine # type: ignore
from sqlalchemy import text # type: ignore
import traceback

def run_migration():
    with open("migrate_log.txt", "w") as f:
        try:
            with engine.connect() as conn:
                conn.execute(text('ALTER TABLE users ADD COLUMN "passwordHash" VARCHAR(255)'))
                conn.commit()
                f.write("Successfully added passwordHash column\n")
        except Exception as e:
            f.write("Error adding passwordHash:\n" + traceback.format_exc() + "\n")

        try:
            with engine.connect() as conn:
                conn.execute(text('ALTER TABLE users ADD COLUMN "unionId" VARCHAR(255)'))
                conn.commit()
                f.write("Successfully added unionId column\n")
        except Exception as e2:
            f.write("Error adding unionId:\n" + traceback.format_exc() + "\n")
            
        try:
            with engine.connect() as conn:
                conn.execute(text('ALTER TABLE chat_messages ADD COLUMN "expenseCreated" BOOLEAN DEFAULT FALSE'))
                conn.commit()
                f.write("Successfully added expenseCreated column\n")
        except Exception as e2:
            f.write("Error adding expenseCreated:\n" + traceback.format_exc() + "\n")

        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users'"))
                cols = [row[0] for row in result]
                f.write(f"Columns in users table: {cols}\n")
        except Exception as e:
            f.write(traceback.format_exc())

if __name__ == "__main__":
    run_migration()
