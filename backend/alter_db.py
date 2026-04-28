from database import engine
from sqlalchemy import text

if __name__ == "__main__":
    with engine.connect() as con:
        try:
            con.execute(text('ALTER TABLE users ADD COLUMN "passwordHash" VARCHAR(255);'))
            con.commit()
            print("Successfully added passwordHash column")
        except Exception as e:
            print("Error or already exists:", e)
