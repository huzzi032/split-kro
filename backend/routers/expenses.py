from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException # type: ignore
from sqlalchemy.orm import Session # type: ignore
from database import get_db # type: ignore
import crud, schemas, models # type: ignore
from security import get_current_user # type: ignore
from email_service import send_group_notification_email # type: ignore
from typing import List, Optional

router = APIRouter()

@router.post("/", response_model=schemas.ExpenseResponse)
def create_expense(
    expense: schemas.ExpenseCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not expense.paidBy:
        expense.paidBy = current_user.id

    group = db.query(models.Group).filter(models.Group.id == expense.groupId).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    created = crud.create_expense(db=db, expense=expense)

    members = db.query(models.GroupMember).filter(models.GroupMember.groupId == expense.groupId).all()
    user_ids = [member.userId for member in members]
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    email_by_user_id = {user.id: user.email for user in users if user.email}

    title = f"New expense in {group.name}"
    body = f"{current_user.name} added {created.amount} {created.currency} for {created.description or 'an expense'}."
    for member in members:
        crud.create_notification(
            db,
            user_id=member.userId,
            group_id=expense.groupId,
            notif_type=models.NotificationTypeEnum.expense_added,
            title=title,
            body=body,
            related_id=created.id,
            auto_commit=False,
        )
        member_email = email_by_user_id.get(member.userId)
        if member_email:
            background_tasks.add_task(send_group_notification_email, member_email, title, body)

    limit = crud.get_member_limit(db, expense.groupId, expense.paidBy)
    if limit:
        total_paid = crud.get_total_paid_by_member(db, expense.groupId, expense.paidBy)
        if total_paid >= limit.amount and (limit.lastNotifiedTotal is None or total_paid > limit.lastNotifiedTotal):
            warn_title = "Spending limit reached"
            warn_body = f"You reached {total_paid:.2f} in {group.name}, which is above your limit of {limit.amount:.2f}."
            crud.create_notification(
                db,
                user_id=expense.paidBy,
                group_id=expense.groupId,
                notif_type=models.NotificationTypeEnum.reminder,
                title=warn_title,
                body=warn_body,
                auto_commit=False,
            )
            payer = db.query(models.User).filter(models.User.id == expense.paidBy).first()
            if payer and payer.email:
                background_tasks.add_task(send_group_notification_email, payer.email, warn_title, warn_body)
            limit.lastNotifiedTotal = total_paid
            limit.lastNotifiedAt = datetime.now(timezone.utc)

    db.commit()

    return created

@router.get("/")
def list_expenses(groupId: int, category: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Expense).filter(models.Expense.groupId == groupId)
    if category:
        try:
            query = query.filter(models.Expense.category == models.CategoryEnum(category))
        except Exception:
            query = query.filter(models.Expense.category == category)
    exps = query.all()
    return [
       {
           "id": e.id,
           "amount": e.amount,
           "currency": e.currency,
           "category": getattr(e.category, 'value', str(e.category)),
           "description": e.description,
           "expenseDate": str(e.expenseDate),
           "payer": {"name": e.payer.name if e.payer else "Unknown"}
       } for e in exps
    ]


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if not crud.is_group_member(db, expense.groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    if expense.paidBy != current_user.id and not crud.is_group_admin(db, expense.groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Only the payer or an admin can delete this expense")

    crud.delete_expense(db, expense_id)
    return {"ok": True}
