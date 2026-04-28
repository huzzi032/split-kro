from fastapi import APIRouter, Depends, HTTPException # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import get_db # type: ignore
import crud, schemas, models # type: ignore
from security import get_current_user # type: ignore
from typing import List

router = APIRouter()


@router.get("/", response_model=List[schemas.NotificationResponse])
def list_notifications(
    unreadOnly: bool = False,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return crud.list_notifications_for_user(db, current_user.id, unread_only=unreadOnly)


@router.get("/unread-count")
def unread_count(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"count": crud.get_unread_notification_count(db, current_user.id)}


@router.post("/mark-read", response_model=schemas.NotificationResponse)
def mark_read(
    payload: schemas.NotificationMarkRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = crud.mark_notification_read(db, current_user.id, payload.id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notif


@router.post("/mark-all-read")
def mark_all_read(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    crud.mark_all_notifications_read(db, current_user.id)
    return {"ok": True}
