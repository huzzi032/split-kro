import os
from sqlalchemy import create_engine # type: ignore
from sqlalchemy.orm import declarative_base, sessionmaker # type: ignore

# Expects NEON_DATABASE_URL to be provided by the user later
DATABASE_URL = os.getenv("NEON_DATABASE_URL", "sqlite:///./test.db")

# To support neon we normally use postgresql://, if provided with postgres:// replace it
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
