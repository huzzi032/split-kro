from fastapi import APIRouter, Depends, HTTPException  # type: ignore
from sqlalchemy.orm import Session  # type: ignore
from typing import Optional

from database import get_db  # type: ignore
from security import get_current_user  # type: ignore
import crud  # type: ignore
import models  # type: ignore
import schemas  # type: ignore

router = APIRouter()


def _serialize_event(event: models.EventPlan, member_count: Optional[int] = None):
    return {
        "id": event.id,
        "groupId": event.groupId,
        "name": event.name,
        "description": event.description,
        "budget": event.budget,
        "currency": event.currency,
        "status": getattr(event.status, "value", event.status),
        "startDate": event.startDate,
        "endDate": event.endDate,
        "createdBy": event.createdBy,
        "createdAt": event.createdAt,
        "memberCount": member_count,
    }


@router.post("/")
def create_event(
    payload: schemas.EventCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == payload.groupId).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_member(db, payload.groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    event = crud.create_event(db, payload, current_user.id)
    member_count = db.query(models.EventMember).filter(models.EventMember.eventId == event.id).count()
    return _serialize_event(event, member_count)


@router.get("/")
def list_events(
    groupId: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = crud.get_events_for_user(db, current_user.id, group_id=groupId)
    results = []
    for event in events:
        member_count = db.query(models.EventMember).filter(models.EventMember.eventId == event.id).count()
        results.append(_serialize_event(event, member_count))
    return results


@router.get("/{event_id}")
def get_event_detail(
    event_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(models.EventPlan).filter(models.EventPlan.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    member = db.query(models.EventMember).filter(
        models.EventMember.eventId == event_id,
        models.EventMember.userId == current_user.id,
    ).first()
    if not member and not crud.is_group_member(db, event.groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    detail = crud.get_event_detail(db, event_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Event not found")

    return detail


@router.post("/{event_id}/expenses", response_model=schemas.EventExpenseResponse)
def create_event_expense(
    event_id: int,
    payload: schemas.EventExpenseCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(models.EventPlan).filter(models.EventPlan.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    member = db.query(models.EventMember).filter(
        models.EventMember.eventId == event_id,
        models.EventMember.userId == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this event")

    if payload.paidBy is None:
        payload.paidBy = current_user.id

    if not payload.splits:
        members = db.query(models.EventMember).filter(models.EventMember.eventId == event_id).all()
        if not members:
            raise HTTPException(status_code=400, detail="No members in this event")
        per_person = payload.amount / len(members)
        payload.splits = [{"userId": m.userId, "amount": f"{per_person:.2f}"} for m in members]

    payload.eventId = event_id
    created = crud.create_event_expense(db, payload)

    return created


@router.get("/{event_id}/balances")
def event_balances(
    event_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = db.query(models.EventMember).filter(
        models.EventMember.eventId == event_id,
        models.EventMember.userId == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this event")

    return crud.calculate_event_balances(db, event_id)


@router.get("/{event_id}/summary")
def event_summary(
    event_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(models.EventPlan).filter(models.EventPlan.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    member = db.query(models.EventMember).filter(
        models.EventMember.eventId == event_id,
        models.EventMember.userId == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this event")

    expenses = db.query(models.EventExpense).filter(models.EventExpense.eventId == event_id).all()
    spent_total = sum(float(exp.amount or 0) for exp in expenses)
    budget = float(event.budget or 0)
    remaining = budget - spent_total if budget else None

    return {
        "eventId": event.id,
        "name": event.name,
        "currency": event.currency,
        "budget": budget if event.budget is not None else None,
        "spent": spent_total,
        "remaining": remaining,
    }
