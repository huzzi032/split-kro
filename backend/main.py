import os
from dotenv import load_dotenv # type: ignore
load_dotenv(override=True)

from fastapi import FastAPI, Depends, HTTPException # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import engine, get_db # type: ignore
import models # type: ignore
from routers import auth, groups, expenses, chat, notifications, analytics, settlements, events # type: ignore

load_dotenv()

# Create DB Tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Splitwise AI API")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(settlements.router, prefix="/api/settlements", tags=["settlements"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])

@app.get("/api/ping")
def ping():
    return {"ok": True, "ts": "ok"}

from fastapi import Request # type: ignore
from fastapi.responses import JSONResponse # type: ignore
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "trace": traceback.format_exc()}
    )

@app.get("/api/sysinfo")
def sysinfo():
    import database # type: ignore
    return {"db": database.DATABASE_URL, "driver": str(database.engine.url)}

if __name__ == "__main__":
    import uvicorn # type: ignore
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
