from fastapi import APIRouter, Depends, HTTPException # type: ignore
from sqlalchemy.orm import Session # type: ignore
from sqlalchemy import func # type: ignore
from database import get_db # type: ignore
from security import get_current_user # type: ignore
import crud, models # type: ignore
from typing import Dict, Optional

router = APIRouter()


@router.get("/group")
def group_stats(
    groupId: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.query(models.Group).filter(models.Group.id == groupId).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if not crud.is_group_member(db, groupId, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    expenses = db.query(models.Expense).filter(models.Expense.groupId == groupId).all()
    total_amount = sum(float(e.amount or 0) for e in expenses)
    total_expenses = len(expenses)
    average_expense = total_amount / total_expenses if total_expenses else 0

    category_totals: Dict[str, float] = {}
    member_totals: Dict[int, float] = {}
    month_totals: Dict[str, Dict[str, float]] = {}

    for exp in expenses:
        category = getattr(exp.category, "value", str(exp.category))
        category_totals[category] = category_totals.get(category, 0) + float(exp.amount or 0)

        member_totals[exp.paidBy] = member_totals.get(exp.paidBy, 0) + float(exp.amount or 0)

        month_key = exp.expenseDate.strftime("%Y-%m") if exp.expenseDate else "unknown"
        if month_key not in month_totals:
            month_totals[month_key] = {"total": 0, "count": 0}
        month_totals[month_key]["total"] += float(exp.amount or 0)
        month_totals[month_key]["count"] += 1

    users = db.query(models.User).filter(models.User.id.in_(list(member_totals.keys()))).all()
    user_names = {u.id: (u.name or u.email or f"User {u.id}") for u in users}

    category_breakdown = [
        {"category": k, "total": v} for k, v in category_totals.items()
    ]
    member_spending = [
        {"userId": uid, "name": user_names.get(uid, f"User {uid}"), "total": total}
        for uid, total in member_totals.items()
    ]
    monthly_trends = [
        {"month": month, "total": data["total"], "count": data["count"]}
        for month, data in month_totals.items()
    ]

    category_breakdown.sort(key=lambda x: x["total"], reverse=True)
    member_spending.sort(key=lambda x: x["total"], reverse=True)
    monthly_trends.sort(key=lambda x: x["month"]) 

    return {
        "totalAmount": total_amount,
        "totalExpenses": total_expenses,
        "averageExpense": average_expense,
        "categoryBreakdown": category_breakdown,
        "memberSpending": member_spending,
        "monthlyTrends": monthly_trends,
    }


@router.get("/personal")
def personal_stats(
    groupId: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if groupId is not None:
        group = db.query(models.Group).filter(models.Group.id == groupId).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        if not crud.is_group_member(db, groupId, current_user.id):
            raise HTTPException(status_code=403, detail="Not a member of this group")

        balances = crud.calculate_group_balances(db, groupId)
        current = next((b for b in balances if b["userId"] == current_user.id), None)
        if not current:
            return {"totalPaid": 0.0, "totalOwed": 0.0, "net": 0.0}

        return {
            "totalPaid": current["paid"],
            "totalOwed": current["owed"],
            "net": current["net"],
        }

    total_paid = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.paidBy == current_user.id,
    ).scalar() or 0

    total_owed = db.query(func.sum(models.ExpenseSplit.amountOwed)).filter(
        models.ExpenseSplit.userId == current_user.id,
        models.ExpenseSplit.settled == False,  # noqa: E712
    ).scalar() or 0

    total_paid_f = float(total_paid)
    total_owed_f = float(total_owed)
    return {
        "totalPaid": total_paid_f,
        "totalOwed": total_owed_f,
        "net": total_paid_f - total_owed_f,
    }
