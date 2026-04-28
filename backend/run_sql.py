import os
from dotenv import load_dotenv # type: ignore
load_dotenv(override=True)

from sqlalchemy import create_engine, text # type: ignore

url = os.getenv("NEON_DATABASE_URL")
if not url:
    print("NO URL FOUND")
    exit(1)

engine = create_engine(url)

with engine.connect() as conn:
    try:
        conn.execute(text('ALTER TABLE users ADD COLUMN "passwordHash" VARCHAR(255) DEFAULT \'dummy\';'))
        conn.commit()
        print("Successfully added passwordHash to Neon DB!")
    except Exception as e:
        print(f"Error executing ALTER: {e}")
