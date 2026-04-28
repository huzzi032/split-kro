from fastapi import APIRouter, Depends, HTTPException  # type: ignore
from pydantic import BaseModel, Field  # type: ignore
from sqlalchemy.orm import Session  # type: ignore
from typing import Optional

from database import get_db  # type: ignore
from security import get_current_user  # type: ignore
import crud  # type: ignore
import models  # type: ignore

router = APIRouter()


class SettlementCreatePayload(BaseModel):
    groupId: int
    paidTo: int
    amount: float = Field(gt=0)
    currency: str = "PKR"
    paymentMethod: Optional[str] = None
    notes: Optional[str] = None


def _serialize_settlement(db: Session, settlement: models.Settlement):
    payer = db.query(models.User).filter(models.User.id == settlement.paidBy).first()
    payee = db.query(models.User).filter(models.User.id == settlement.paidTo).first()
    return {
        "id": settlement.id,
        "groupId": settlement.groupId,
        "paidBy": settlement.paidBy,
        "paidTo": settlement.paidTo,
        "amount": float(settlement.amount or 0),
        "currency": settlement.currency,
        "paymentMethod": settlement.paymentMethod,
        "notes": settlement.notes,
        "isConfirmed": settlement.isConfirmed,
        "createdAt": settlement.createdAt,
        "payer": {"name": payer.name if payer else "Unknown"},
        "payee": {"name": payee.name if payee else "Unknown"},
    }


def _minimize_transactions(balances):
    creditors = sorted(
        [
            {"userId": b["userId"], "name": b["name"], "net": float(b["net"])}
            for b in balances
            if float(b["net"]) > 0.01
        ],
        key=lambda x: x["net"],
        reverse=True,
    )
    debtors = sorted(
        [
            {"userId": b["userId"], "name": b["name"], "net": abs(float(b["net"]))}
            for b in balances
            if float(b["net"]) < -0.01
        ],
        key=lambda x: x["net"],
        reverse=True,
    )

    transactions = []
    i = 0
    j = 0

    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]
        amount = min(debtor["net"], creditor["net"])

        if amount > 0.01:
            transactions.append(
                {
                    "from": debtor["userId"],
                    "fromName": debtor["name"],
                    "to": creditor["userId"],
                    "toName": creditor["name"],
                    "amount": round(float(amount), 2),
                }
            )

        debtor["net"] -= amount
        creditor["net"] -= amount

        if debtor["net"] < 0.01:
            i += 1
        if creditor["net"] < 0.01:
            j += 1

    return transactions


@router.get("/")
def list_settlements(
    groupId: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not crud.is_group_member(db, groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    rows = (
        db.query(models.Settlement)
        .filter(models.Settlement.groupId == groupId)
        .order_by(models.Settlement.createdAt.desc())
        .all()
    )
    return [_serialize_settlement(db, row) for row in rows]


@router.get("/balances")
def group_balances(
    groupId: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not crud.is_group_member(db, groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")
    return crud.calculate_group_balances(db, groupId)


@router.get("/plan")
def settlement_plan(
    groupId: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not crud.is_group_member(db, groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    balances = crud.calculate_group_balances(db, groupId)
    return {"balances": balances, "transactions": _minimize_transactions(balances)}


@router.post("/")
def create_settlement(
    payload: SettlementCreatePayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == payload.groupId).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if payload.paidTo == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot settle with yourself")

    if not crud.is_group_member(db, payload.groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    if not crud.is_group_member(db, payload.groupId, payload.paidTo):
        raise HTTPException(status_code=400, detail="Recipient is not a group member")

    settlement = models.Settlement(
        groupId=payload.groupId,
        paidBy=current_user.id,
        paidTo=payload.paidTo,
        amount=payload.amount,
        currency=payload.currency,
        paymentMethod=payload.paymentMethod,
        notes=payload.notes,
        isConfirmed=True,
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    title = f"Settlement recorded in {group.name}"
    body = f"{current_user.name or current_user.email} settled {payload.amount:.2f} {payload.currency} with you."

    crud.create_notification(
        db,
        user_id=payload.paidTo,
        group_id=payload.groupId,
        notif_type=models.NotificationTypeEnum.settlement,
        title=title,
        body=body,
        related_id=settlement.id,
        auto_commit=True,
    )

    return _serialize_settlement(db, settlement)
