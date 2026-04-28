import os
import pytest
from sqlalchemy import create_engine
from dotenv import load_dotenv
import models

try:
    import psycopg2  # type: ignore
except Exception:
    pytest.skip("Skipping DB connectivity test: psycopg2 is unavailable in this environment.", allow_module_level=True)

load_dotenv()

DATABASE_URL = os.getenv("NEON_DATABASE_URL")

engine = create_engine(
    DATABASE_URL, 
    pool_size=5, 
    max_overflow=5, 
    pool_timeout=30, 
    pool_recycle=1800
)

try:
    print("Testing DB connection...")
    connection = engine.connect()
    print("Connection successful!")
    print("Creating tables...")
    models.Base.metadata.create_all(bind=engine)
    print("Tables created successfully!")
    connection.close()
except Exception as e:
    print(f"Error: {e}")
