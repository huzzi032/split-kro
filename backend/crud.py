from sqlalchemy.orm import Session # type: ignore
from sqlalchemy import func # type: ignore
from typing import Optional
from datetime import datetime, timedelta, timezone
import models, schemas # type: ignore
from uuid import uuid4

def get_user_by_unionId(db: Session, unionId: str):
    return db.query(models.User).filter(models.User.unionId == unionId).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    db_user = models.User(
        unionId=user.email,  # keeping unionId as unique email for compatibility
        name=user.name, 
        email=user.email,
        passwordHash=hashed_password,
        role=schemas.RoleEnum.user
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def create_group(db: Session, group: schemas.GroupCreate, user_id: int):
    db_group = models.Group(**group.dict(), createdBy=user_id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Add creator as admin
    member = models.GroupMember(groupId=db_group.id, userId=user_id, role=models.GroupRoleEnum.admin)
    db.add(member)
    db.commit()
    
    return db_group


def create_event(db: Session, event: schemas.EventCreate, user_id: int):
    event_data = event.dict(exclude={"memberIds"})
    event_data["createdBy"] = user_id
    db_event = models.EventPlan(**event_data)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    group_members = db.query(models.GroupMember).filter(models.GroupMember.groupId == event.groupId).all()
    group_member_ids = [m.userId for m in group_members]

    member_ids = event.memberIds or group_member_ids
    member_ids = [mid for mid in member_ids if mid in group_member_ids]

    for uid in member_ids:
        role = models.EventRoleEnum.organizer if uid == user_id else models.EventRoleEnum.participant
        db.add(models.EventMember(eventId=db_event.id, userId=uid, role=role))

    db.commit()
    return db_event


def get_events_for_user(db: Session, user_id: int, group_id: Optional[int] = None):
    event_ids = (
        db.query(models.EventMember.eventId)
        .filter(models.EventMember.userId == user_id)
        .subquery()
    )
    query = db.query(models.EventPlan).filter(models.EventPlan.id.in_(event_ids))
    if group_id:
        query = query.filter(models.EventPlan.groupId == group_id)
    return query.order_by(models.EventPlan.createdAt.desc()).all()


def get_event_detail(db: Session, event_id: int):
    event = db.query(models.EventPlan).filter(models.EventPlan.id == event_id).first()
    if not event:
        return None

    members = db.query(models.EventMember).filter(models.EventMember.eventId == event_id).all()
    member_ids = [m.userId for m in members]
    users = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
    user_map = {u.id: u for u in users}

    expenses = db.query(models.EventExpense).filter(models.EventExpense.eventId == event_id).order_by(
        models.EventExpense.expenseDate.desc(),
        models.EventExpense.id.desc(),
    ).all()

    return {
        "event": event,
        "members": [
            {
                "id": m.id,
                "userId": m.userId,
                "role": getattr(m.role, "value", m.role),
                "user": {
                    "name": user_map.get(m.userId).name if user_map.get(m.userId) else "Unknown",
                    "email": user_map.get(m.userId).email if user_map.get(m.userId) else "",
                },
            }
            for m in members
        ],
        "expenses": [
            {
                "id": e.id,
                "eventId": e.eventId,
                "paidBy": e.paidBy,
                "amount": e.amount,
                "currency": e.currency,
                "description": e.description,
                "expenseDate": e.expenseDate,
                "payer": {"name": e.payer.name if e.payer else "Unknown"},
            }
            for e in expenses
        ],
    }


def create_event_expense_splits(db: Session, event_expense_id: int, splits: list):
    for split in splits:
        split_data = split.dict() if hasattr(split, "dict") else split
        if not isinstance(split_data, dict):
            continue

        amount_raw = (
            split_data.get("amount")
            or split_data.get("amountOwed")
            or split_data.get("owed")
            or split_data.get("share")
        )
        try:
            amount = float(amount_raw or 0)
        except Exception:
            amount = 0

        percentage = (
            split_data.get("percentage")
            or split_data.get("percent")
            or split_data.get("pct")
        )
        try:
            percentage_val = float(percentage) if percentage is not None else None
        except Exception:
            percentage_val = None

        user_id = split_data.get("userId")
        if user_id is None:
            continue

        db.add(models.EventExpenseSplit(
            eventExpenseId=event_expense_id,
            userId=int(user_id),
            amountOwed=amount,
            percentage=percentage_val,
        ))
    db.commit()


def create_event_expense(db: Session, expense: schemas.EventExpenseCreate):
    event_data = expense.dict(exclude={"splits"})
    db_expense = models.EventExpense(**event_data)
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)

    splits = getattr(expense, "splits", None)
    if splits:
        create_event_expense_splits(db, db_expense.id, splits)
    return db_expense


def calculate_event_balances(db: Session, event_id: int):
    members = db.query(models.EventMember).filter(models.EventMember.eventId == event_id).all()
    if not members:
        return []

    user_ids = [m.userId for m in members]
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    user_names = {u.id: (u.name or u.email or "User") for u in users}

    paid: dict[int, float] = {uid: 0 for uid in user_ids}
    owed: dict[int, float] = {uid: 0 for uid in user_ids}

    expenses = db.query(models.EventExpense).filter(models.EventExpense.eventId == event_id).all()
    member_count = len(user_ids)

    for exp in expenses:
        amount = float(exp.amount or 0)
        if exp.paidBy in paid:
            paid[exp.paidBy] += amount
        else:
            paid[exp.paidBy] = amount

        splits = db.query(models.EventExpenseSplit).filter(models.EventExpenseSplit.eventExpenseId == exp.id).all()
        split_total = sum(float(split.amountOwed or 0) for split in splits) if splits else 0
        if splits and split_total > 0:
            for split in splits:
                owed[split.userId] = owed.get(split.userId, 0) + float(split.amountOwed or 0)
        else:
            per_person = amount / member_count if member_count else 0
            for uid in user_ids:
                owed[uid] = owed.get(uid, 0) + per_person

    results = []
    for uid in user_ids:
        paid_amt = paid.get(uid, 0)
        owed_amt = owed.get(uid, 0)
        results.append({
            "userId": uid,
            "name": user_names.get(uid, f"User {uid}"),
            "paid": paid_amt,
            "owed": owed_amt,
            "net": paid_amt - owed_amt,
        })

    return results

def get_groups_for_user(db: Session, user_id: int):
    # simple implementation
    memberships = db.query(models.GroupMember).filter(models.GroupMember.userId == user_id).all()
    group_ids = [m.groupId for m in memberships]
    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    results = []
    for group in groups:
        member_count = db.query(models.GroupMember).filter(models.GroupMember.groupId == group.id).count()
        results.append({
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "currency": group.currency,
            "createdBy": group.createdBy,
            "createdAt": group.createdAt,
            "memberCount": member_count,
        })
    return results

def create_expense(db: Session, expense: schemas.ExpenseCreate):
    expense_data = expense.dict(exclude={"splits"})
    db_expense = models.Expense(**expense_data)
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)

    splits = getattr(expense, "splits", None)
    if splits:
        create_expense_splits(db, db_expense.id, splits)
    return db_expense

def get_group_details(db: Session, group_id: int):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group: return None
    
    memberships = db.query(models.GroupMember).filter(models.GroupMember.groupId == group_id).all()
    
    members_list = []
    for m in memberships:
        user_model = db.query(models.User).filter(models.User.id == m.userId).first()
        members_list.append({
            "id": m.id,
            "userId": m.userId,
            "role": getattr(m.role, "value", m.role) if m.role else "member",
            "user": {
                 "name": user_model.name if user_model else "Unknown",
                 "email": user_model.email if user_model else ""
            }
        })
        
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "currency": getattr(group, 'currency', "PKR"),
        "members": members_list,
        "memberLimits": get_member_limits_for_group(db, group_id)
    }

def get_expenses_for_group(db: Session, group_id: int):
    return db.query(models.Expense).filter(models.Expense.groupId == group_id).all()

def save_chat_message(db: Session, msg: schemas.ChatMessageCreate, user_id: int, ai_reply: str, action: str):
    try:
        enum_action = models.ActionEnum(action)
    except Exception:
        enum_action = models.ActionEnum.unknown

    db_msg = models.ChatMessage(
        userId=user_id,
        groupId=msg.groupId,
        messageContent=msg.messageContent,
        aiResponse=ai_reply,
        action=enum_action
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg


def create_expense_splits(db: Session, expense_id: int, splits: list):
    for split in splits:
        split_data = split.dict() if hasattr(split, "dict") else split
        if not isinstance(split_data, dict):
            continue

        amount_raw = (
            split_data.get("amount")
            or split_data.get("amountOwed")
            or split_data.get("owed")
            or split_data.get("share")
        )
        try:
            amount = float(amount_raw or 0)
        except Exception:
            amount = 0

        percentage = (
            split_data.get("percentage")
            or split_data.get("percent")
            or split_data.get("pct")
        )
        try:
            percentage_val = float(percentage) if percentage is not None else None
        except Exception:
            percentage_val = None

        user_id = split_data.get("userId")
        if user_id is None:
            continue

        db.add(models.ExpenseSplit(
            expenseId=expense_id,
            userId=int(user_id),
            amountOwed=amount,
            percentage=percentage_val,
        ))
    db.commit()


def is_group_admin(db: Session, group_id: int, user_id: int) -> bool:
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.groupId == group_id,
        models.GroupMember.userId == user_id,
    ).first()
    if not membership:
        return False
    return getattr(membership.role, "value", membership.role) == "admin"


def is_group_member(db: Session, group_id: int, user_id: int) -> bool:
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.groupId == group_id,
        models.GroupMember.userId == user_id,
    ).first()
    return membership is not None


def remove_group_member(db: Session, group_id: int, user_id: int):
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.groupId == group_id,
        models.GroupMember.userId == user_id,
    ).first()
    if not membership:
        return None
    db.delete(membership)
    db.query(models.MemberLimit).filter(
        models.MemberLimit.groupId == group_id,
        models.MemberLimit.userId == user_id,
    ).delete(synchronize_session=False)
    db.commit()
    return membership


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _expire_invitation_if_needed(db: Session, invitation: models.GroupInvitation) -> models.GroupInvitation:
    if invitation.status == models.InvitationStatusEnum.pending and invitation.expiresAt:
        expires_at = invitation.expiresAt
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            now = datetime.now()
        if expires_at <= now:
            invitation.status = models.InvitationStatusEnum.expired
            db.commit()
            db.refresh(invitation)
    return invitation


def create_group_invitation(db: Session, group_id: int, email: str, inviter_id: int):
    normalized_email = _normalize_email(email)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)

    user = get_user_by_email(db, normalized_email)
    if user and is_group_member(db, group_id, user.id):
        return None

    existing = db.query(models.GroupInvitation).filter(
        models.GroupInvitation.groupId == group_id,
        models.GroupInvitation.email == normalized_email,
        models.GroupInvitation.status == models.InvitationStatusEnum.pending,
    ).order_by(models.GroupInvitation.createdAt.desc()).first()

    if existing:
        existing = _expire_invitation_if_needed(db, existing)
        if existing.status == models.InvitationStatusEnum.pending:
            return existing

    token = uuid4().hex
    invitation = models.GroupInvitation(
        groupId=group_id,
        email=normalized_email,
        userId=user.id if user else None,
        token=token,
        status=models.InvitationStatusEnum.pending,
        inviterId=inviter_id,
        expiresAt=expires_at,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def get_invitation_by_token(db: Session, token: str) -> Optional[models.GroupInvitation]:
    invitation = db.query(models.GroupInvitation).filter(models.GroupInvitation.token == token).first()
    if not invitation:
        return None
    return _expire_invitation_if_needed(db, invitation)


def list_pending_invitations_for_user(db: Session, user: models.User):
    email = _normalize_email(user.email or "")
    query = db.query(models.GroupInvitation).filter(
        models.GroupInvitation.status == models.InvitationStatusEnum.pending,
    )
    if email:
        query = query.filter(
            (models.GroupInvitation.userId == user.id) | (models.GroupInvitation.email == email)
        )
    else:
        query = query.filter(models.GroupInvitation.userId == user.id)
    return query.order_by(models.GroupInvitation.createdAt.desc()).all()


def accept_invitation(db: Session, invitation: models.GroupInvitation, user: models.User):
    if invitation.status != models.InvitationStatusEnum.pending:
        return invitation

    invitation = _expire_invitation_if_needed(db, invitation)
    if invitation.status != models.InvitationStatusEnum.pending:
        return invitation

    existing = db.query(models.GroupMember).filter(
        models.GroupMember.groupId == invitation.groupId,
        models.GroupMember.userId == user.id,
    ).first()
    if not existing:
        db.add(models.GroupMember(
            groupId=invitation.groupId,
            userId=user.id,
            role=models.GroupRoleEnum.member,
        ))

    invitation.status = models.InvitationStatusEnum.accepted
    invitation.userId = user.id
    invitation.acceptedAt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(invitation)
    return invitation


def decline_invitation(db: Session, invitation: models.GroupInvitation, user: models.User):
    if invitation.status != models.InvitationStatusEnum.pending:
        return invitation

    invitation = _expire_invitation_if_needed(db, invitation)
    if invitation.status != models.InvitationStatusEnum.pending:
        return invitation

    invitation.status = models.InvitationStatusEnum.declined
    invitation.userId = user.id
    invitation.acceptedAt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(invitation)
    return invitation


def delete_group(db: Session, group_id: int):
    expense_ids = db.query(models.Expense.id).filter(models.Expense.groupId == group_id).subquery()
    db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expenseId.in_(expense_ids)).delete(synchronize_session=False)
    db.query(models.Expense).filter(models.Expense.groupId == group_id).delete(synchronize_session=False)
    db.query(models.ChatMessage).filter(models.ChatMessage.groupId == group_id).delete(synchronize_session=False)
    db.query(models.Notification).filter(models.Notification.groupId == group_id).delete(synchronize_session=False)
    db.query(models.Settlement).filter(models.Settlement.groupId == group_id).delete(synchronize_session=False)
    db.query(models.MemberLimit).filter(models.MemberLimit.groupId == group_id).delete(synchronize_session=False)
    db.query(models.GroupMember).filter(models.GroupMember.groupId == group_id).delete(synchronize_session=False)
    db.query(models.Group).filter(models.Group.id == group_id).delete(synchronize_session=False)
    db.commit()


def delete_expense(db: Session, expense_id: int):
    db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expenseId == expense_id).delete(synchronize_session=False)
    db.query(models.Notification).filter(models.Notification.relatedId == expense_id).delete(synchronize_session=False)
    db.query(models.Expense).filter(models.Expense.id == expense_id).delete(synchronize_session=False)
    db.commit()


def create_notification(
    db: Session,
    user_id: int,
    notif_type: models.NotificationTypeEnum,
    title: str,
    body: Optional[str] = None,
    group_id: Optional[int] = None,
    related_id: Optional[int] = None,
    auto_commit: bool = True,
):
    notif = models.Notification(
        userId=user_id,
        groupId=group_id,
        type=notif_type,
        title=title,
        body=body,
        relatedId=related_id,
    )
    db.add(notif)
    if auto_commit:
        db.commit()
        db.refresh(notif)
    else:
        db.flush()
    return notif


def list_notifications_for_user(db: Session, user_id: int, unread_only: bool = False):
    query = db.query(models.Notification).filter(models.Notification.userId == user_id)
    if unread_only:
        query = query.filter(models.Notification.isRead == False) # noqa: E712
    return query.order_by(models.Notification.createdAt.desc()).all()


def mark_notification_read(db: Session, user_id: int, notif_id: int):
    notif = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.userId == user_id,
    ).first()
    if not notif:
        return None
    notif.isRead = True
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_notifications_read(db: Session, user_id: int):
    db.query(models.Notification).filter(
        models.Notification.userId == user_id,
        models.Notification.isRead == False, # noqa: E712
    ).update({"isRead": True})
    db.commit()


def get_unread_notification_count(db: Session, user_id: int) -> int:
    return db.query(models.Notification).filter(
        models.Notification.userId == user_id,
        models.Notification.isRead == False, # noqa: E712
    ).count()


def get_member_limits_for_group(db: Session, group_id: int):
    limits = db.query(models.MemberLimit).filter(models.MemberLimit.groupId == group_id).all()
    return [
        {
            "id": l.id,
            "groupId": l.groupId,
            "userId": l.userId,
            "amount": l.amount,
            "createdBy": l.createdBy,
            "lastNotifiedTotal": l.lastNotifiedTotal,
            "lastNotifiedAt": l.lastNotifiedAt,
            "createdAt": l.createdAt,
            "updatedAt": l.updatedAt,
        }
        for l in limits
    ]


def calculate_group_balances(db: Session, group_id: int):
    members = db.query(models.GroupMember).filter(models.GroupMember.groupId == group_id).all()
    if not members:
        return []

    user_ids = [m.userId for m in members]
    users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
    user_names = {u.id: (u.name or u.email or "User") for u in users}

    paid: dict[int, float] = {uid: 0 for uid in user_ids}
    owed: dict[int, float] = {uid: 0 for uid in user_ids}

    expenses = db.query(models.Expense).filter(models.Expense.groupId == group_id).all()
    member_count = len(user_ids)

    for exp in expenses:
        amount = float(exp.amount or 0)
        if exp.paidBy in paid:
            paid[exp.paidBy] += amount
        else:
            paid[exp.paidBy] = amount

        splits = db.query(models.ExpenseSplit).filter(models.ExpenseSplit.expenseId == exp.id).all()
        split_total = sum(float(split.amountOwed or 0) for split in splits) if splits else 0
        if splits and split_total > 0:
            for split in splits:
                if split.userId in owed:
                    owed[split.userId] = owed.get(split.userId, 0) + float(split.amountOwed or 0)
        else:
            per_person = amount / member_count if member_count else 0
            for uid in user_ids:
                owed[uid] = owed.get(uid, 0) + per_person

    results = []
    for uid in user_ids:
        paid_amt = paid.get(uid, 0)
        owed_amt = owed.get(uid, 0)
        results.append({
            "userId": uid,
            "name": user_names.get(uid, f"User {uid}"),
            "paid": paid_amt,
            "owed": owed_amt,
            "net": paid_amt - owed_amt,
        })

    return results


def upsert_member_limit(db: Session, group_id: int, user_id: int, amount: Optional[float], created_by: Optional[int] = None):
    existing = db.query(models.MemberLimit).filter(
        models.MemberLimit.groupId == group_id,
        models.MemberLimit.userId == user_id,
    ).first()

    if amount is None or amount <= 0:
        if existing:
            db.delete(existing)
            db.commit()
        return None

    if existing:
        existing.amount = amount
        existing.createdBy = created_by
        db.commit()
        db.refresh(existing)
        return existing

    limit = models.MemberLimit(
        groupId=group_id,
        userId=user_id,
        amount=amount,
        createdBy=created_by,
    )
    db.add(limit)
    db.commit()
    db.refresh(limit)
    return limit


def get_member_limit(db: Session, group_id: int, user_id: int):
    return db.query(models.MemberLimit).filter(
        models.MemberLimit.groupId == group_id,
        models.MemberLimit.userId == user_id,
    ).first()


def get_total_paid_by_member(db: Session, group_id: int, user_id: int) -> float:
    total = db.query(func.sum(models.Expense.amount)).filter(
        models.Expense.groupId == group_id,
        models.Expense.paidBy == user_id,
    ).scalar()
    return float(total or 0)
