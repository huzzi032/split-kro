import json
import os
import re
import unicodedata
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends  # type: ignore
from groq import Groq  # type: ignore
from sqlalchemy.orm import Session  # type: ignore

import crud  # type: ignore
import models  # type: ignore
import schemas  # type: ignore
from database import get_db  # type: ignore
from email_service import send_group_notification_email, send_email_invite  # type: ignore
from security import get_current_user  # type: ignore

router = APIRouter()
groq_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None


def _detect_language(text: str) -> str:
    """Detect if text is in Urdu, Hindi, or English"""
    # Urdu script ranges
    urdu_chars = set(range(0x0600, 0x06FF))  # Arabic/Urdu block
    # Devanagari script ranges (Hindi)
    hindi_chars = set(range(0x0900, 0x097F))  # Devanagari block
    
    char_count = len(text)
    urdu_count = sum(1 for char in text if ord(char) in urdu_chars)
    hindi_count = sum(1 for char in text if ord(char) in hindi_chars)
    
    threshold = char_count * 0.3  # 30% of chars need to be in script
    
    if urdu_count > threshold:
        return "urdu"
    elif hindi_count > threshold:
        return "hindi"
    return "english"


def _translate_urdu_hindi_to_english(text: str, language: str) -> str:
    """Translate Urdu/Hindi text to English using Groq"""
    if language == "english":
        return text
    
    if not client:
        return text
    
    lang_name = "Urdu" if language == "urdu" else "Hindi"
    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": f"You are a translator. Translate the following {lang_name} text to English. Preserve all names and amounts. Reply with ONLY the English translation, nothing else.",
                },
                {"role": "user", "content": text},
            ],
            model="llama3-8b-8192",
            temperature=0.1,
            max_tokens=200,
        )
        translated = str(completion.choices[0].message.content or text).strip()
        return translated if translated else text
    except Exception:
        return text


def _extract_all_amounts(text: str) -> list:
    """Extract all numeric amounts from text (e.g., 500, 300, 200)"""
    amounts = re.findall(r"(\d+(?:\.\d+)?)", text)
    return [float(a) for a in amounts]


def _extract_amount(text: str) -> Optional[float]:
    """Extract first numeric amount from text"""
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except Exception:
        return None


def _extract_narrative_expense(text: str, members: list) -> Optional[dict]:
    """
    Parse complex narrative expense queries like:
    "hum na aj 500 ka lunch khaya 300 ma na dia 200 easy na passa equally distribute hon ga"
    Returns: {total_amount, participants, description} or None if can't parse
    """
    amounts = _extract_all_amounts(text)
    if not amounts:
        return None
    
    # Total amount is usually the first or largest amount
    total_amount = amounts[0] if amounts else 0
    
    # Extract participant names
    participant_names = _extract_participant_names_advanced(text, members)
    
    # If no explicit participants mentioned, use all members
    if not participant_names:
        participant_names = [m.get("name") or m.get("email") for m in members]
    
    # Description from text
    description = "lunch" if "lunch" in text.lower() else "expense"
    if "khaya" in text.lower() or "kha" in text.lower():
        description = "lunch/meal"
    elif "dinner" in text.lower():
        description = "dinner"
    elif "breakfast" in text.lower():
        description = "breakfast"
    
    return {
        "total_amount": total_amount,
        "participant_names": participant_names,
        "description": description,
        "amounts": amounts,
    }


def _extract_email(text: str) -> Optional[str]:
    match = re.search(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", text)
    return match.group(1) if match else None


def _extract_group_name(text: str) -> Optional[str]:
    match = re.search(r"(?:make|create|new)\s+(?:a\s+)?group(?:\s+(?:named|called))?\s+(.+)", text, re.IGNORECASE)
    if not match:
        return None
    name = match.group(1).strip().strip('"\'')
    return name or None


def _extract_event_name(text: str) -> Optional[str]:
    match = re.search(
        r"(?:make|create|plan|new|start)\s+(?:an?\s+)?(?:event|trip)(?:\s+(?:named|called|for))?\s+(.+)",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    name = match.group(1).strip().strip('"\'')
    return name or None


def _clean_group_name(raw: str, email: Optional[str] = None) -> str:
    name = raw
    if email and email in name:
        name = name.replace(email, "").strip()
    name = re.split(r"\s+(?:and|with|then)\s+", name, maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return name.strip('"\'')


def _resolve_group_id_from_text(text: str, current_user: models.User, db: Session) -> Optional[int]:
    groups = crud.get_groups_for_user(db, current_user.id)
    if not groups:
        return None

    lower = text.lower()
    matches = [g for g in groups if str(g.get("name", "")).lower() in lower]
    if not matches:
        return None
    matches.sort(key=lambda g: len(str(g.get("name", ""))), reverse=True)
    return int(matches[0]["id"])


def _resolve_event_from_text(
    text: str,
    current_user: models.User,
    db: Session,
    group_id: Optional[int] = None,
):
    events = crud.get_events_for_user(db, current_user.id, group_id=group_id)
    if not events:
        return None

    lower = text.lower()
    matches = [e for e in events if str(getattr(e, "name", "")).lower() in lower]
    if not matches:
        return None
    matches.sort(key=lambda e: len(str(getattr(e, "name", ""))), reverse=True)
    return matches[0]


def _extract_first_int(text: str) -> Optional[int]:
    match = re.search(r"\b(\d+)\b", text)
    if not match:
        return None
    try:
        return int(match.group(1))
    except Exception:
        return None


def _extract_requested_limit(text: str, default: int = 5, min_val: int = 1, max_val: int = 50) -> int:
    value = _extract_first_int(text)
    if value is None:
        return default
    return max(min_val, min(max_val, value))


def _extract_expense_description(text: str, lower: str) -> str:
    desc = "expense"
    if " on " in lower:
        desc = text.split(" on ", 1)[1].strip() or "expense"
    elif " for " in lower:
        desc = text.split(" for ", 1)[1].strip() or "expense"
    else:
        # Handle commands like "add dinner 400" where no explicit "for/on" is present.
        match = re.search(
            r"(?:add|spent|pay|paid)\s+([a-zA-Z][a-zA-Z0-9\s\-]{1,80}?)(?:\s+\d|$)",
            text,
            re.IGNORECASE,
        )
        if match:
            candidate = match.group(1).strip()
            if candidate:
                desc = candidate
    return desc[:500]


def _extract_participant_names(text: str):
    split_match = re.search(r"(?:split\s+(?:between|among)|between|among)\s+(.+)", text, re.IGNORECASE)
    if not split_match:
        return []

    raw_segment = split_match.group(1)
    segment = re.split(
        r"\s+(?:for|on|in|of)\s+",
        raw_segment,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]

    lowered = segment.lower().strip()
    if any(token in lowered for token in ["all", "everyone", "equal", "equally"]):
        return []

    parts = re.split(r",|\band\b|&|\+", segment, flags=re.IGNORECASE)
    cleaned = []
    for part in parts:
        token = part.strip().strip('."')
        if token and token.lower() not in {"me", "myself", "i"}:
            cleaned.append(token)
    return cleaned


def _extract_participant_names_advanced(text: str, members: list) -> list:
    """Enhanced participant extraction that handles more patterns"""
    # Pattern 1: "between X, Y, Z"
    # Pattern 2: "X and Y"
    # Pattern 3: Names mentioned in narrative
    # Pattern 4: "everyone" / "all"
    
    lower = text.lower()
    extracted = []
    
    # Check for "everyone/all" pattern
    if any(word in lower for word in ["everyone", "all members", "all", "equally"]):
        return []
    
    # Check for common splitting patterns
    split_patterns = [
        r"(?:split|divide|share)\s+(?:between|among|with)\s+(.+?)(?:\s+(?:for|on|in)|\s*$)",
        r"between\s+(.+?)(?:\s+(?:for|on|in)|\s*$)",
        r"split with\s+(.+?)(?:\s+(?:for|on|in)|\s*$)",
    ]
    
    for pattern in split_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            participant_text = match.group(1).strip()
            # Split by common delimiters
            parts = re.split(r",|and|&|\+", participant_text, flags=re.IGNORECASE)
            for part in parts:
                name = part.strip().strip('."\'')
                if name and name.lower() not in {"me", "myself", "i", "you", "he", "she"}:
                    extracted.append(name)
            if extracted:
                return extracted
    
    # Pattern: Look for member names anywhere in the text
    for member in members:
        member_name = (member.get("name") or "").lower().strip()
        member_email = (member.get("email") or "").lower().strip()
        
        if member_name and (member_name in lower or re.search(rf"\b{re.escape(member_name)}\b", lower, re.IGNORECASE)):
            extracted.append(member.get("name"))
        elif member_email and member_email in lower:
            extracted.append(member_email)
    
    return list(dict.fromkeys(extracted))  # Remove duplicates while preserving order


def _get_group_members(db: Session, group_id: int):
    group = crud.get_group_details(db, group_id)
    if not group:
        return []

    members = []
    for member in group.get("members", []):
        user = member.get("user", {})
        members.append(
            {
                "id": int(member.get("userId")),
                "name": str(user.get("name") or "").strip(),
                "email": str(user.get("email") or "").strip(),
            }
        )
    return members


def _resolve_participant_user_ids(participant_names, members):
    if not participant_names:
        return []

    resolved = []
    for candidate in participant_names:
        c = candidate.strip().lower()
        if not c:
            continue
        for member in members:
            name = str(member.get("name") or "").lower()
            email = str(member.get("email") or "").lower()
            if c == name or c == email or c in name or (name and name in c) or c in email:
                member_id = int(member.get("id"))
                if member_id not in resolved:
                    resolved.append(member_id)
                break
    return resolved


def _build_equal_splits(user_ids, total_amount: float):
    if not user_ids:
        return []
    per_person = total_amount / len(user_ids)
    return [{"userId": uid, "amount": f"{per_person:.2f}"} for uid in user_ids]


def _minimize_transactions_from_balances(balances):
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


def _resolve_group_context(group_id: Optional[int], current_user: models.User, db: Session, text: Optional[str] = None):
    resolved_group_id = group_id
    if not resolved_group_id and text:
        resolved_group_id = _resolve_group_id_from_text(text, current_user, db)
    if not resolved_group_id:
        return None, "Pick a group first."

    group = db.query(models.Group).filter(models.Group.id == resolved_group_id).first()
    if not group:
        return None, "Group not found."

    if not crud.is_group_member(db, group.id, current_user.id):
        return None, "You are not a member of this group."

    return group, None


def _get_category_from_text(lower: str) -> Optional[str]:
    for category in models.CategoryEnum:
        if category.value.lower() in lower:
            return category.value
    return None


def _create_expense_via_endpoint(
    amount: float,
    description: str,
    group_id: int,
    paid_by: int,
    splits,
    current_user: models.User,
    db: Session,
    background_tasks: BackgroundTasks,
):
    from routers.expenses import create_expense as create_expense_endpoint  # type: ignore

    payload = schemas.ExpenseCreate(
        amount=amount,
        description=description,
        groupId=group_id,
        paidBy=paid_by,
        splits=splits,
    )
    return create_expense_endpoint(payload, background_tasks, current_user, db)


def _try_create_expense_from_text(
    content: str,
    group_id: Optional[int],
    current_user: models.User,
    db: Session,
    background_tasks: BackgroundTasks,
):
    lower = content.lower()
    
    group, group_error = _resolve_group_context(group_id, current_user, db, content)
    if group_error:
        return group_error, "info"

    members = _get_group_members(db, int(group.id))
    member_ids = [int(m["id"]) for m in members]
    if not member_ids:
        return "This group has no members yet.", "info"

    # Try narrative parsing first (for complex queries)
    narrative_expense = _extract_narrative_expense(content, members)
    if narrative_expense:
        amount = narrative_expense["total_amount"]
        description = narrative_expense["description"]
        participant_names = narrative_expense["participant_names"]
        
        # Resolve participant IDs
        participant_ids = _resolve_participant_user_ids(participant_names, members)
        if participant_names and not participant_ids:
            participant_ids = member_ids  # Fallback to all members
        
        split_ids = participant_ids if participant_ids else member_ids
        splits = _build_equal_splits(split_ids, amount)
        
        _create_expense_via_endpoint(
            amount=amount,
            description=description,
            group_id=int(group.id),
            paid_by=current_user.id,
            splits=splits,
            current_user=current_user,
            db=db,
            background_tasks=background_tasks,
        )
        
        if participant_ids and len(participant_ids) > 0:
            participant_label = ", ".join([m["name"] or m["email"] for m in members if int(m["id"]) in participant_ids])
            return f"✓ Recorded {amount:.2f} split equally between {participant_label}.", "expense_created"
        
        return f"✓ Recorded {amount:.2f} for '{description}' split equally among all members.", "expense_created"
    
    # Fallback to simple amount parsing
    amount = _extract_amount(content)
    if amount is None:
        return None

    # Use advanced participant extraction
    participant_names = _extract_participant_names_advanced(content, members)
    participant_ids = _resolve_participant_user_ids(participant_names, members)
    if participant_names and not participant_ids:
        return "I could not match the split members. Try names exactly as shown in group members.", "info"

    split_ids = participant_ids if participant_ids else member_ids
    splits = _build_equal_splits(split_ids, amount)

    description = _extract_expense_description(content, lower)
    _create_expense_via_endpoint(
        amount=amount,
        description=description,
        group_id=int(group.id),
        paid_by=current_user.id,
        splits=splits,
        current_user=current_user,
        db=db,
        background_tasks=background_tasks,
    )

    if participant_ids:
        participant_label = ", ".join([m["name"] or m["email"] for m in members if int(m["id"]) in participant_ids])
        return f"I've recorded an expense of {amount:.2f} split between {participant_label}.", "expense_created"

    return f"I've recorded an expense of {amount:.2f} for '{description}'.", "expense_created"


def _try_local_command(
    content: str,
    group_id: Optional[int],
    current_user: models.User,
    db: Session,
    background_tasks: BackgroundTasks,
):
    text = content.strip()
    lower = text.lower()
    email_in_text = _extract_email(text)
    amount_in_text = _extract_amount(text)
    expense_keywords = ["spent", "expense", "paid", "split", "owe", "bill", "cost", "price"]

    if any(
        k in lower
        for k in [
            "create group",
            "create a group",
            "create new group",
            "create a new group",
            "make group",
            "make a group",
            "make new group",
            "make a new group",
            "new group",
        ]
    ) and email_in_text:
        raw_name = _extract_group_name(text)
        if not raw_name:
            return "Tell me the group name.", "info"

        group_name = _clean_group_name(raw_name, email_in_text)
        if not group_name:
            return "Tell me the group name.", "info"

        payload = schemas.GroupCreate(name=group_name, currency="PKR")
        group = crud.create_group(db, payload, current_user.id)

        invitation = crud.create_group_invitation(db, group.id, email_in_text, current_user.id)
        if invitation:
            inviter_name = current_user.name or current_user.email or "Someone"
            send_email_invite(email_in_text, group.name, inviter_name, invitation.token)

        return f"Created group {group.name} and sent an invite to {email_in_text}.", "info"

    if email_in_text and any(k in lower for k in ["invite", "add member", "add user", "add"]) and (
        amount_in_text is None or any(k in lower for k in ["member", "invite", "user"])
    ) and not any(k in lower for k in expense_keywords):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        invitation = crud.create_group_invitation(db, int(group.id), email_in_text, current_user.id)
        if not invitation:
            return f"{email_in_text} is already a member of {group.name}.", "info"

        inviter_name = current_user.name or current_user.email or "Someone"
        send_email_invite(email_in_text, group.name, inviter_name, invitation.token)
        if invitation.userId:
            title = f"Invitation to join {group.name}"
            body = f"{inviter_name} invited you to join {group.name}."
            crud.create_notification(
                db,
                user_id=invitation.userId,
                group_id=group.id,
                notif_type=models.NotificationTypeEnum.system,
                title=title,
                body=body,
                related_id=invitation.id,
            )

        return f"I've sent an invitation to {email_in_text} for {group.name}.", "info"

    if any(k in lower for k in ["help", "what can you do", "commands", "capabilities"]):
        return (
            "I can manage most app actions by chat:\n"
            "- create/list groups\n"
            "- list/add/remove members\n"
            "- add/list/delete expenses\n"
            "- show balance and summaries\n"
            "- explain balance (audit trail)\n"
            "- settlement coach (who should pay whom)\n"
            "- create/list events or trips\n"
            "- add event expenses and check budget\n"
            "- set/list member limits\n"
            "- show unread notifications, list notifications, mark all read\n"
            "- send notification to [name]\n"
            "- test smtp (check email service)\n"
            "- member emails (show member email mappings)\n"
            "Try: 'add dinner 1200 split between Ali and Sara' or 'list members'.",
            "info",
        )

    if any(k in lower for k in ["test smtp", "check smtp", "test email", "smtp test"]):
        from email_service import test_smtp_connection
        result = test_smtp_connection()
        status_msg = f"SMTP Status:\n"
        status_msg += f"Server: {result['smtp_server']}:{result['smtp_port']}\n"
        status_msg += f"TLS: {result['use_tls']}, SSL: {result['use_ssl']}\n"
        status_msg += f"From: {result['from_email']}\n"
        status_msg += f"Connection: {result['message']}"
        return status_msg, "info"

    if any(k in lower for k in ["member emails", "members emails", "show emails", "email mapping"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"
        
        members = _get_group_members(db, int(group.id))
        if not members:
            return "No members in this group.", "info"
        
        lines = []
        for m in members:
            name = m.get("name") or "Unknown"
            email = m.get("email") or "no-email"
            lines.append(f"- {name}: {email}")
        return "Member Email Mapping:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["my groups", "list groups", "show groups", "all groups"]):
        groups = crud.get_groups_for_user(db, current_user.id)
        if not groups:
            return "You are not in any groups yet.", "info"
        lines = [f"- {g['name']} (id: {g['id']}, members: {g.get('memberCount', 0)})" for g in groups]
        return "Your groups:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["mark all notifications", "clear notifications", "read all notifications"]):
        crud.mark_all_notifications_read(db, current_user.id)
        return "Done. I marked all notifications as read.", "info"

    if any(k in lower for k in ["unread notifications", "notification count", "how many notifications"]):
        unread = crud.get_unread_notification_count(db, current_user.id)
        return f"You have {unread} unread notifications.", "info"

    if any(k in lower for k in ["list notifications", "show notifications", "my notifications"]):
        unread_only = "unread" in lower
        limit = _extract_requested_limit(text, default=5, max_val=20)
        notifications = crud.list_notifications_for_user(db, current_user.id, unread_only=unread_only)
        if not notifications:
            return "No notifications found.", "info"
        lines = []
        for notif in notifications[:limit]:
            state = "unread" if not notif.isRead else "read"
            body = notif.body or ""
            lines.append(f"- [{state}] {notif.title}: {body}".strip())
        return "Notifications:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["send notification", "notify", "message to"]):
        # Accept both "notify ali to pay me" and "message to ali pay me" styles.
        recipient_match = re.search(
            r"(?:send notification to|notify|message to)\s+(.+?)\s+(?:to|that|message:?)\s+(.+)",
            text,
            re.IGNORECASE,
        )
        if not recipient_match:
            recipient_match = re.search(
                r"(?:send notification to|notify|message to)\s+(.+?)\s+(.+)",
                text,
                re.IGNORECASE,
            )

        if not recipient_match:
            return "Please specify recipient and message. Example: 'send notification to ali to give me my money back'", "info"

        recipient_name = recipient_match.group(1).strip().strip("'\"")
        message_text = recipient_match.group(2).strip() if len(recipient_match.groups()) > 1 else "Please settle up"
        
        # Find recipient user
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"
        
        members = _get_group_members(db, int(group.id))
        recipient = None
        recipient_lower = recipient_name.lower()
        
        # Matching strategy:
        # 1. Exact match on name
        # 2. Exact match on email
        # 3. Recipient is substring of member name
        # 4. Member name contains recipient as substring (partial match)
        # 5. Email starts with recipient
        
        for member in members:
            member_name = (member.get("name") or "").lower().strip()
            member_email = (member.get("email") or "").lower().strip()
            
            # Exact matches
            if recipient_lower == member_name or recipient_lower == member_email:
                recipient = db.query(models.User).filter(models.User.id == int(member["id"])).first()
                break
            
            # Substring matches
            if recipient_lower in member_email or member_name in recipient_lower or recipient_lower in member_name:
                recipient = db.query(models.User).filter(models.User.id == int(member["id"])).first()
                break
            
            # Check if email starts with recipient
            if member_email.startswith(recipient_lower):
                recipient = db.query(models.User).filter(models.User.id == int(member["id"])).first()
                break
        
        if not recipient:
            # List available members in error message
            available = ", ".join([m.get("name") or m.get("email") for m in members])
            return f"I could not find user '{recipient_name}'. Available members: {available}", "info"
        
        if recipient.id == current_user.id:
            return "You cannot send a notification to yourself.", "info"

        # Create in-app notification and optional email.
        sender_name = current_user.name or current_user.email
        title = f"Message from {sender_name}"
        body = message_text
        
        crud.create_notification(
            db,
            user_id=recipient.id,
            group_id=int(group.id),
            title=title,
            body=body,
            notif_type=models.NotificationTypeEnum.system,
            related_id=None,
            auto_commit=True
        )

        if recipient.email:
            background_tasks.add_task(
                send_group_notification_email,
                recipient.email,
                title,
                body,
            )
        
        return f"✓ Notification sent to {recipient.name or recipient.email}: '{message_text}'", "info"

    if any(
        k in lower
        for k in [
            "create group",
            "create a group",
            "create new group",
            "create a new group",
            "make group",
            "make a group",
            "make new group",
            "make a new group",
            "new group",
        ]
    ):
        name = _extract_group_name(text)
        if not name:
            return "Tell me the group name.", "info"
        payload = schemas.GroupCreate(name=_clean_group_name(name, email_in_text), currency="PKR")
        group = crud.create_group(db, payload, current_user.id)
        return f"Created group {group.name}.", "info"

    if any(k in lower for k in ["create event", "plan event", "new event", "create trip", "plan trip", "new trip"]):
        raw_name = _extract_event_name(text)
        if not raw_name:
            return "Tell me the event or trip name.", "info"

        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        budget = amount_in_text if any(k in lower for k in ["budget", "limit"]) else None
        payload = schemas.EventCreate(
            groupId=int(group.id),
            name=_clean_group_name(raw_name, None),
            description=None,
            budget=budget,
            currency=getattr(group, "currency", "PKR"),
        )
        event = crud.create_event(db, payload, current_user.id)
        return f"Created event {event.name} in {group.name}.", "info"

    if any(k in lower for k in ["list events", "show events", "my events", "trip list", "events list"]):
        group_match_id = _resolve_group_id_from_text(text, current_user, db)
        events = crud.get_events_for_user(db, current_user.id, group_id=group_match_id)
        if not events:
            return "No events found yet.", "info"
        lines = [f"- {e.name} (id: {e.id})" for e in events]
        return "Your events:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["event summary", "event budget", "trip summary", "trip budget", "event status"]):
        group_match_id = _resolve_group_id_from_text(text, current_user, db)
        event = _resolve_event_from_text(text, current_user, db, group_match_id)
        if not event:
            events = crud.get_events_for_user(db, current_user.id, group_id=group_match_id)
            event = events[0] if events else None
        if not event:
            return "Tell me which event you want to summarize.", "info"

        expenses = db.query(models.EventExpense).filter(models.EventExpense.eventId == event.id).all()
        spent_total = sum(float(exp.amount or 0) for exp in expenses)
        budget = float(event.budget or 0) if event.budget is not None else None
        remaining = budget - spent_total if budget is not None else None

        response = [f"{event.name} summary:"]
        response.append(f"- Spent: {spent_total:.2f} {event.currency}")
        if budget is not None:
            response.append(f"- Budget: {budget:.2f} {event.currency}")
            response.append(f"- Remaining: {remaining:.2f} {event.currency}")
        return "\n".join(response), "info"

    if any(k in lower for k in ["event expense", "trip expense", "add event expense", "add trip expense", "event spend"]):
        amount = amount_in_text
        if amount is None:
            return "Tell me the amount for the event expense.", "info"

        group_match_id = _resolve_group_id_from_text(text, current_user, db)
        event = _resolve_event_from_text(text, current_user, db, group_match_id)
        if not event:
            return "Tell me which event to add this expense to.", "info"

        members = db.query(models.EventMember).filter(models.EventMember.eventId == event.id).all()
        user_ids = [m.userId for m in members]
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        member_payloads = [
            {"id": u.id, "name": u.name or u.email or "User", "email": u.email or ""}
            for u in users
        ]

        participant_names = _extract_participant_names_advanced(text, member_payloads)
        participant_ids = _resolve_participant_user_ids(participant_names, member_payloads)
        split_ids = participant_ids if participant_ids else user_ids
        splits = _build_equal_splits(split_ids, float(amount))

        payload = schemas.EventExpenseCreate(
            eventId=event.id,
            amount=float(amount),
            currency=event.currency,
            description=_extract_expense_description(text, lower),
            paidBy=current_user.id,
            splits=splits,
        )
        created = crud.create_event_expense(db, payload)
        return f"Added {created.amount:.2f} {created.currency} to {event.name}.", "info"

    if "estimate" in lower and any(k in lower for k in ["trip", "event"]):
        days_match = re.search(r"(\d+)\s*(?:days|day)", lower)
        people_match = re.search(r"(\d+)\s*(?:people|persons|members|guys|log)", lower)
        per_day_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:per\s*day|/day)", lower)

        days = int(days_match.group(1)) if days_match else None
        people = int(people_match.group(1)) if people_match else None
        per_day = float(per_day_match.group(1)) if per_day_match else None

        if days and per_day:
            total = per_day * days * (people or 1)
            if people:
                return f"Estimated total cost: {total:.2f} (for {people} people over {days} days).", "info"
            return f"Estimated total cost: {total:.2f} (for {days} days).", "info"

        if amount_in_text:
            return "Tell me the number of days and people, or a per-day cost, to estimate a total.", "info"
        return "Tell me the number of days, people, and a per-day cost to estimate the trip.", "info"

    if any(k in lower for k in ["delete group", "remove group"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"
        from routers.groups import delete_group as delete_group_endpoint  # type: ignore

        payload = schemas.GroupDeleteRequest(notifyMembers=True, notifyByEmail=True)
        delete_group_endpoint(int(group.id), payload, current_user, db)
        return "The group has been deleted.", "info"

    if any(k in lower for k in ["remove member", "kick", "delete member"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        email = _extract_email(text)
        if not email:
            return "Provide the member email to remove.", "info"

        user = crud.get_user_by_email(db, email=email)
        if not user:
            return "I couldn't find that user.", "info"

        from routers.groups import remove_member as remove_member_endpoint  # type: ignore

        payload = schemas.GroupMemberRemove(
            userId=user.id,
            notifyRemoved=True,
            notifyRemaining=True,
            notifyByEmail=True,
        )
        remove_member_endpoint(int(group.id), payload, current_user, db)
        return f"{user.email} has been removed from the group.", "info"

    if any(k in lower for k in ["invite", "add member", "add user"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        email = _extract_email(text)
        if not email:
            return "Provide the email to invite.", "info"

        from routers.groups import add_member as add_member_endpoint  # type: ignore

        add_member_endpoint(int(group.id), schemas.GroupMemberAdd(email=email), current_user, db)
        return f"I've sent an invitation to {email}!", "info"

    if any(k in lower for k in ["list members", "show members", "group members", "who is in this group", "who's in this group"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        members = _get_group_members(db, int(group.id))
        if not members:
            return "No members found in this group.", "info"

        lines = [f"- {m['name'] or 'User'} ({m['email']})" for m in members]
        return "Group members:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["list limits", "show limits", "member limits", "what are limits"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        limits = crud.get_member_limits_for_group(db, int(group.id))
        if not limits:
            return "No member limits are set in this group.", "info"

        members = _get_group_members(db, int(group.id))
        name_by_user_id = {int(m["id"]): (m["name"] or m["email"] or f"User {m['id']}") for m in members}
        lines = []
        for limit in limits:
            uid = int(limit["userId"])
            display_name = name_by_user_id.get(uid, f"User {uid}")
            lines.append(f"- {display_name}: {float(limit['amount']):.2f}")
        return "Member limits:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["limit", "spending cap"]):
        amount = _extract_amount(text)
        if amount is None:
            return "Tell me the limit amount you want to set. Use 0 to remove a limit.", "info"

        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        members = _get_group_members(db, int(group.id))
        email = _extract_email(text)

        user = None
        if email:
            user = crud.get_user_by_email(db, email=email)
        elif " my " in f" {lower} " or " me " in f" {lower} ":
            user = current_user
        else:
            for member in members:
                member_name = (member.get("name") or "").strip().lower()
                if member_name and member_name in lower:
                    user = db.query(models.User).filter(models.User.id == int(member["id"])).first()
                    break
            if not user:
                user = current_user

        if not user:
            return "I could not find that user.", "info"

        if user.id != current_user.id and not crud.is_group_admin(db, int(group.id), current_user.id):
            return "Only group admins can set limits for other members.", "info"

        limit = crud.upsert_member_limit(db, int(group.id), user.id, amount, created_by=current_user.id)
        if limit:
            return f"Set {user.email}'s limit to {limit.amount:.2f}.", "info"
        return f"Removed the limit for {user.email}.", "info"

    if any(k in lower for k in ["delete last expense", "remove last expense", "undo last expense", "delete expense", "remove expense"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        expense = None
        if "last" in lower:
            expense = (
                db.query(models.Expense)
                .filter(models.Expense.groupId == int(group.id))
                .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
                .first()
            )
        else:
            expense_id_match = re.search(r"(?:expense\s*#?\s*|id\s*)(\d+)", lower)
            if not expense_id_match:
                return "Tell me which expense to delete (e.g., 'delete expense 42') or say 'delete last expense'.", "info"
            expense_id = int(expense_id_match.group(1))
            expense = (
                db.query(models.Expense)
                .filter(models.Expense.id == expense_id, models.Expense.groupId == int(group.id))
                .first()
            )

        if not expense:
            return "I could not find that expense.", "info"

        if expense.paidBy != current_user.id and not crud.is_group_admin(db, int(group.id), current_user.id):
            return "Only the payer or a group admin can delete this expense.", "info"

        detail = f"{float(expense.amount):.2f} {expense.currency} for {expense.description or 'expense'}"
        deleted_id = expense.id
        crud.delete_expense(db, expense.id)
        return f"Deleted expense #{deleted_id}: {detail}.", "info"

    if any(k in lower for k in ["list expenses", "show expenses", "all expenses"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        limit = _extract_requested_limit(text, default=10, max_val=100)
        category = _get_category_from_text(lower)

        query = db.query(models.Expense).filter(models.Expense.groupId == int(group.id))
        if category:
            try:
                query = query.filter(models.Expense.category == models.CategoryEnum(category))
            except Exception:
                pass

        exps = query.order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc()).limit(limit).all()
        if not exps:
            return "No expenses found yet.", "info"

        lines = []
        for exp in exps:
            payer_name = exp.payer.name if exp.payer and exp.payer.name else "Unknown"
            lines.append(
                f"- #{exp.id}: {float(exp.amount):.2f} {exp.currency} | {exp.description or 'expense'} | paid by {payer_name}"
            )
        heading = f"Expenses ({category})" if category else "Expenses"
        return heading + ":\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["top spender", "who spent most", "highest spender"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        expenses = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).all()
        if not expenses:
            return "No expenses found yet.", "info"

        totals = {}
        for exp in expenses:
            totals[exp.paidBy] = totals.get(exp.paidBy, 0.0) + float(exp.amount or 0)

        top_user_id, top_amount = max(totals.items(), key=lambda x: x[1])
        top_user = db.query(models.User).filter(models.User.id == top_user_id).first()
        top_name = top_user.name if top_user and top_user.name else (top_user.email if top_user else f"User {top_user_id}")
        return f"Top spender is {top_name} with {top_amount:.2f}.", "info"

    if any(k in lower for k in ["top category", "most spent category", "highest category"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        expenses = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).all()
        if not expenses:
            return "No expenses found yet.", "info"

        category_totals = {}
        for exp in expenses:
            cat = getattr(exp.category, "value", str(exp.category))
            category_totals[cat] = category_totals.get(cat, 0.0) + float(exp.amount or 0)

        top_category, top_amount = max(category_totals.items(), key=lambda x: x[1])
        return f"Top category is {top_category} with {top_amount:.2f}.", "info"

    if any(k in lower for k in ["total spent", "total spending", "group spending"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        expenses = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).all()
        total_amount = sum(float(exp.amount or 0) for exp in expenses)
        return f"Total spending in this group is {total_amount:.2f}.", "info"

    if any(k in lower for k in ["explain balance", "balance breakdown", "why do i owe", "why is my balance", "audit", "dispute"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        group_data = crud.get_group_details(db, int(group.id))
        currency = group_data.get("currency") if group_data else "PKR"

        split_rows = (
            db.query(models.ExpenseSplit, models.Expense)
            .join(models.Expense, models.ExpenseSplit.expenseId == models.Expense.id)
            .filter(
                models.Expense.groupId == int(group.id),
                models.ExpenseSplit.userId == current_user.id,
            )
            .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
            .all()
        )

        paid_rows = (
            db.query(models.Expense)
            .filter(models.Expense.groupId == int(group.id), models.Expense.paidBy == current_user.id)
            .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
            .all()
        )

        owed_total = sum(float(split.amountOwed or 0) for split, _ in split_rows)
        paid_total = sum(float(exp.amount or 0) for exp in paid_rows)
        net = paid_total - owed_total

        if not split_rows and not paid_rows:
            return "No expenses found yet in this group.", "info"

        lines = [
            f"Balance breakdown ({currency}):",
            f"- Paid by you: {paid_total:.2f}",
            f"- Owed by you: {owed_total:.2f}",
            f"- Net: {net:.2f}",
        ]

        if split_rows:
            lines.append("Recent owed items:")
            for split, exp in split_rows[:5]:
                payer_name = exp.payer.name if exp.payer and exp.payer.name else "Unknown"
                desc = exp.description or getattr(exp.category, "value", str(exp.category))
                lines.append(
                    f"- {desc}: {float(split.amountOwed or 0):.2f} (paid by {payer_name})"
                )
            if len(split_rows) > 5:
                lines.append(f"- ...and {len(split_rows) - 5} more")

        return "\n".join(lines), "info"

    if any(k in lower for k in ["settlement plan", "settlement coach", "who should pay", "best way to settle", "optimize settlement", "settle plan"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        balances = crud.calculate_group_balances(db, int(group.id))
        transactions = _minimize_transactions_from_balances(balances)
        if not transactions:
            return "Everyone is settled up already.", "info"

        lines = ["Recommended settlement plan:"]
        for tx in transactions[:6]:
            lines.append(
                f"- {tx['fromName']} pays {tx['toName']}: {tx['amount']:.2f}"
            )
        if len(transactions) > 6:
            lines.append(f"- ...and {len(transactions) - 6} more")
        return "\n".join(lines), "info"

    if any(k in lower for k in ["balance", "owe", "owed", "due"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        balances = crud.calculate_group_balances(db, int(group.id))
        current = next((b for b in balances if b["userId"] == current_user.id), None)
        group_data = crud.get_group_details(db, int(group.id))
        currency = group_data.get("currency") if group_data else "PKR"
        if not current:
            return "No balance data yet.", "info"
        if current["net"] > 0:
            return f"You are owed {current['net']:.2f} {currency}.", "info"
        if current["net"] < 0:
            return f"You owe {abs(current['net']):.2f} {currency}.", "info"
        return "You're settled up.", "info"

    if any(k in lower for k in ["summary", "summarize", "overview"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        total_count = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).count()
        members = _get_group_members(db, int(group.id))
        total_amount = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).with_entities(models.Expense.amount).all()
        spent_total = sum(float(row[0] or 0) for row in total_amount)
        return (
            f"{group.name} has {len(members)} members, {total_count} expenses, and total spending {spent_total:.2f} {group.currency}.",
            "info",
        )

    if any(k in lower for k in ["recent", "latest", "last"]):
        group, group_error = _resolve_group_context(group_id, current_user, db, text)
        if group_error:
            return group_error, "info"

        limit = _extract_requested_limit(text, default=5, max_val=20)
        exps = (
            db.query(models.Expense)
            .filter(models.Expense.groupId == int(group.id))
            .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
            .limit(limit)
            .all()
        )
        if not exps:
            return "No expenses found yet.", "info"

        lines = [f"- #{exp.id}: {float(exp.amount):.2f} {exp.currency} for {exp.description or 'expense'}" for exp in exps]
        return "Recent expenses:\n" + "\n".join(lines), "info"

    if any(k in lower for k in ["spent", "expense", "add", "paid", "split"]):
        return _try_create_expense_from_text(text, group_id, current_user, db, background_tasks)

    return None


def fallback_ai_response(
    content: str,
    group_id: Optional[int],
    current_user: models.User,
    db: Session,
    background_tasks: BackgroundTasks,
):
    handled = _try_local_command(content, group_id, current_user, db, background_tasks)
    if handled:
        return handled
    return "I can help with groups, members, expenses, limits, balances, and notifications. Try 'help' for examples.", "info"


def _handle_structured_tool_call(
    tool_name: str,
    args: dict[str, Any],
    group_id: Optional[int],
    current_user: models.User,
    db: Session,
    background_tasks: BackgroundTasks,
):
    if tool_name == "create_expense":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"

        amount = float(args.get("amount") or 0)
        description = str(args.get("description") or "expense")
        if amount <= 0:
            return "Please provide a valid amount greater than 0.", "info"

        members = _get_group_members(db, int(group.id))
        split_between = args.get("split_between")
        participant_ids = []
        if isinstance(split_between, list):
            participant_ids = _resolve_participant_user_ids(split_between, members)
            if split_between and not participant_ids:
                return "I could not match the split members. Try exact names or emails.", "info"

        split_ids = participant_ids if participant_ids else [int(m["id"]) for m in members]
        splits = _build_equal_splits(split_ids, amount)
        _create_expense_via_endpoint(
            amount=amount,
            description=description,
            group_id=int(group.id),
            paid_by=current_user.id,
            splits=splits if splits else None,
            current_user=current_user,
            db=db,
            background_tasks=background_tasks,
        )

        if participant_ids:
            participant_label = ", ".join([m["name"] or m["email"] for m in members if int(m["id"]) in participant_ids])
            return f"I've recorded an expense of {amount:.2f} split between {participant_label}.", "expense_created"
        return f"I've recorded an expense of {amount:.2f} for '{description}'.", "expense_created"

    if tool_name == "add_member":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        email = str(args.get("email") or "").strip()
        if not email:
            return "Please provide a valid email.", "info"
        from routers.groups import add_member as add_member_endpoint  # type: ignore

        add_member_endpoint(int(group.id), schemas.GroupMemberAdd(email=email), current_user, db)
        return f"I've sent an invitation to {email}!", "info"

    if tool_name == "remove_member":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        email = str(args.get("email") or "").strip()
        if not email:
            return "Please provide the member email to remove.", "info"
        user = crud.get_user_by_email(db, email=email)
        if not user:
            return "I couldn't find that user.", "info"
        from routers.groups import remove_member as remove_member_endpoint  # type: ignore

        payload = schemas.GroupMemberRemove(
            userId=user.id,
            notifyRemoved=bool(args.get("notify_removed", True)),
            notifyRemaining=bool(args.get("notify_remaining", True)),
            notifyByEmail=True,
        )
        remove_member_endpoint(int(group.id), payload, current_user, db)
        return f"{user.email} has been removed from the group.", "info"

    if tool_name == "delete_group":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        from routers.groups import delete_group as delete_group_endpoint  # type: ignore

        payload = schemas.GroupDeleteRequest(
            notifyMembers=bool(args.get("notify_members", True)),
            notifyByEmail=True,
        )
        delete_group_endpoint(int(group.id), payload, current_user, db)
        return "The group has been deleted.", "info"

    if tool_name == "set_member_limit":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"

        email = str(args.get("email") or "").strip()
        amount = args.get("amount")
        if not email or amount is None:
            return "Please provide both member email and limit amount.", "info"

        user = crud.get_user_by_email(db, email=email)
        if not user:
            return "I couldn't find that user.", "info"

        if user.id != current_user.id and not crud.is_group_admin(db, int(group.id), current_user.id):
            return "Only group admins can set limits for other members.", "info"

        limit = crud.upsert_member_limit(db, int(group.id), user.id, float(amount), created_by=current_user.id)
        if limit:
            return f"Set {user.email}'s limit to {limit.amount:.2f}.", "info"
        return f"Removed the limit for {user.email}.", "info"

    if tool_name == "list_recent_expenses":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        limit = int(args.get("limit") or 5)
        limit = max(1, min(20, limit))
        exps = (
            db.query(models.Expense)
            .filter(models.Expense.groupId == int(group.id))
            .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
            .limit(limit)
            .all()
        )
        if not exps:
            return "No expenses found yet.", "info"
        lines = [f"- #{exp.id}: {float(exp.amount):.2f} {exp.currency} for {exp.description or 'expense'}" for exp in exps]
        return "Recent expenses:\n" + "\n".join(lines), "info"

    if tool_name == "group_summary":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        total_count = db.query(models.Expense).filter(models.Expense.groupId == int(group.id)).count()
        members = _get_group_members(db, int(group.id))
        return f"{group.name} has {len(members)} members and {total_count} expenses.", "info"

    if tool_name == "get_balance":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        balances = crud.calculate_group_balances(db, int(group.id))
        current = next((b for b in balances if b["userId"] == current_user.id), None)
        if not current:
            return "No balance data yet.", "info"
        if current["net"] > 0:
            return f"You are owed {current['net']:.2f} {group.currency}.", "info"
        if current["net"] < 0:
            return f"You owe {abs(current['net']):.2f} {group.currency}.", "info"
        return "You're settled up.", "info"

    if tool_name == "create_group":
        payload = schemas.GroupCreate(
            name=str(args.get("name") or "").strip(),
            description=args.get("description"),
            currency=str(args.get("currency") or "PKR"),
        )
        if not payload.name:
            return "Please provide a group name.", "info"
        group = crud.create_group(db, payload, current_user.id)
        return f"Created group {group.name}.", "info"

    if tool_name == "create_event":
        group = None
        if group_id:
            group = db.query(models.Group).filter(models.Group.id == int(group_id)).first()

        group_name = str(args.get("group_name") or "").strip()
        if not group and group_name:
            groups = crud.get_groups_for_user(db, current_user.id)
            match = next((g for g in groups if str(g.get("name", "")).lower() == group_name.lower()), None)
            if match:
                group = db.query(models.Group).filter(models.Group.id == int(match["id"])).first()

        if not group:
            return "Pick a group first to create an event.", "info"

        name = str(args.get("name") or "").strip()
        if not name:
            return "Please provide an event name.", "info"

        payload = schemas.EventCreate(
            groupId=int(group.id),
            name=name,
            budget=args.get("budget"),
            currency=getattr(group, "currency", "PKR"),
        )
        event = crud.create_event(db, payload, current_user.id)
        return f"Created event {event.name} in {group.name}.", "info"

    if tool_name == "list_events":
        group_name = str(args.get("group_name") or "").strip()
        group_match_id = None
        if group_name:
            groups = crud.get_groups_for_user(db, current_user.id)
            match = next((g for g in groups if str(g.get("name", "")).lower() == group_name.lower()), None)
            if match:
                group_match_id = int(match["id"])

        events = crud.get_events_for_user(db, current_user.id, group_id=group_match_id)
        if not events:
            return "No events found yet.", "info"
        lines = [f"- {e.name} (id: {e.id})" for e in events]
        return "Your events:\n" + "\n".join(lines), "info"

    if tool_name == "event_summary":
        event_name = str(args.get("event_name") or "").strip()
        events = crud.get_events_for_user(db, current_user.id)
        event = next((e for e in events if str(getattr(e, "name", "")).lower() == event_name.lower()), None)
        if not event:
            return "Tell me which event you want to summarize.", "info"

        expenses = db.query(models.EventExpense).filter(models.EventExpense.eventId == event.id).all()
        spent_total = sum(float(exp.amount or 0) for exp in expenses)
        budget = float(event.budget or 0) if event.budget is not None else None
        remaining = budget - spent_total if budget is not None else None

        response = [f"{event.name} summary:"]
        response.append(f"- Spent: {spent_total:.2f} {event.currency}")
        if budget is not None:
            response.append(f"- Budget: {budget:.2f} {event.currency}")
            response.append(f"- Remaining: {remaining:.2f} {event.currency}")
        return "\n".join(response), "info"

    if tool_name == "add_event_expense":
        event_name = str(args.get("event_name") or "").strip()
        amount = args.get("amount")
        if not event_name or amount is None:
            return "Please provide the event name and amount.", "info"

        events = crud.get_events_for_user(db, current_user.id)
        event = next((e for e in events if str(getattr(e, "name", "")).lower() == event_name.lower()), None)
        if not event:
            return "I could not find that event.", "info"

        members = db.query(models.EventMember).filter(models.EventMember.eventId == event.id).all()
        user_ids = [m.userId for m in members]
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        member_payloads = [
            {"id": u.id, "name": u.name or u.email or "User", "email": u.email or ""}
            for u in users
        ]

        split_between = args.get("split_between") if isinstance(args.get("split_between"), list) else None
        participant_ids = _resolve_participant_user_ids(split_between or [], member_payloads)
        split_ids = participant_ids if participant_ids else user_ids
        splits = _build_equal_splits(split_ids, float(amount))

        payload = schemas.EventExpenseCreate(
            eventId=event.id,
            amount=float(amount),
            currency=event.currency,
            description=str(args.get("description") or "event expense"),
            paidBy=current_user.id,
            splits=splits,
        )
        created = crud.create_event_expense(db, payload)
        return f"Added {created.amount:.2f} {created.currency} to {event.name}.", "info"

    if tool_name == "list_groups":
        groups = crud.get_groups_for_user(db, current_user.id)
        if not groups:
            return "You are not in any groups yet.", "info"
        lines = [f"- {g['name']} (id: {g['id']})" for g in groups]
        return "Your groups:\n" + "\n".join(lines), "info"

    if tool_name == "list_members":
        group, group_error = _resolve_group_context(group_id, current_user, db, None)
        if group_error:
            return group_error, "info"
        members = _get_group_members(db, int(group.id))
        if not members:
            return "No members found in this group.", "info"
        lines = [f"- {m['name'] or 'User'} ({m['email']})" for m in members]
        return "Group members:\n" + "\n".join(lines), "info"

    if tool_name == "list_notifications":
        unread_only = bool(args.get("unread_only", False))
        limit = int(args.get("limit") or 5)
        limit = max(1, min(20, limit))
        notifications = crud.list_notifications_for_user(db, current_user.id, unread_only=unread_only)
        if not notifications:
            return "No notifications found.", "info"
        lines = []
        for notif in notifications[:limit]:
            state = "unread" if not notif.isRead else "read"
            lines.append(f"- [{state}] {notif.title}: {notif.body or ''}".strip())
        return "Notifications:\n" + "\n".join(lines), "info"

    if tool_name == "mark_all_notifications_read":
        crud.mark_all_notifications_read(db, current_user.id)
        return "Done. I marked all notifications as read.", "info"

    if tool_name == "delete_expense":
        group, group_error = _resolve_group_context(group_id, current_user, db)
        if group_error:
            return group_error, "info"

        expense = None
        if bool(args.get("last", False)):
            expense = (
                db.query(models.Expense)
                .filter(models.Expense.groupId == int(group.id))
                .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
                .first()
            )
        else:
            expense_id = args.get("id")
            if expense_id is None:
                return "Please provide an expense id or use last=true.", "info"
            expense = (
                db.query(models.Expense)
                .filter(models.Expense.id == int(expense_id), models.Expense.groupId == int(group.id))
                .first()
            )

        if not expense:
            return "I could not find that expense.", "info"

        if expense.paidBy != current_user.id and not crud.is_group_admin(db, int(group.id), current_user.id):
            return "Only the payer or a group admin can delete this expense.", "info"

        detail = f"{float(expense.amount):.2f} {expense.currency} for {expense.description or 'expense'}"
        deleted_id = expense.id
        crud.delete_expense(db, expense.id)
        return f"Deleted expense #{deleted_id}: {detail}.", "info"

    return "I could not execute that action.", "info"


@router.post("/", response_model=schemas.ChatMessageResponse)
def chat_with_ai(
    msg: schemas.ChatMessageCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = msg.messageContent
    group_id = msg.groupId
    
    # Detect language and translate if needed
    detected_language = _detect_language(content)
    if detected_language != "english":
        translated_content = _translate_urdu_hindi_to_english(content, detected_language)
        # Use translated content for processing, but keep original for logging
        processing_content = translated_content
    else:
        processing_content = content

    local_handled = _try_local_command(processing_content, group_id, current_user, db, background_tasks)
    if local_handled:
        reply, action = local_handled
        return crud.save_chat_message(db, msg, current_user.id, reply, action)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "create_expense",
                "description": "Create a new shared bill or expense for the group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": {"type": "number", "description": "The total amount of the expense"},
                        "description": {"type": "string", "description": "What the expense was for"},
                        "split_between": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional member names or emails to split this expense between",
                        },
                    },
                    "required": ["amount", "description"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_member",
                "description": "Invite a new member to the group via email",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "The email address of the person to invite"},
                    },
                    "required": ["email"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "remove_member",
                "description": "Remove a member from the group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "Email of the member to remove"},
                        "notify_removed": {"type": "boolean", "description": "Notify removed member"},
                        "notify_remaining": {"type": "boolean", "description": "Notify remaining members"},
                    },
                    "required": ["email"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_group",
                "description": "Delete the current group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "notify_members": {"type": "boolean", "description": "Notify group members"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "set_member_limit",
                "description": "Set a spending limit for a member in the group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "Member email to set limit for"},
                        "amount": {"type": "number", "description": "Limit amount"},
                    },
                    "required": ["email", "amount"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_recent_expenses",
                "description": "List recent expenses for the group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "number", "description": "Number of expenses to list"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "group_summary",
                "description": "Get a short summary of the group",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_balance",
                "description": "Get the current user's balance for the group",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_group",
                "description": "Create a new group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Group name"},
                        "description": {"type": "string", "description": "Group description"},
                        "currency": {"type": "string", "description": "Currency code"},
                    },
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_event",
                "description": "Create a new event or trip inside a group",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Event name"},
                        "group_name": {"type": "string", "description": "Group name (optional)"},
                        "budget": {"type": "number", "description": "Event budget"},
                    },
                    "required": ["name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_event_expense",
                "description": "Add an expense to an event",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "event_name": {"type": "string", "description": "Event name"},
                        "amount": {"type": "number", "description": "Expense amount"},
                        "description": {"type": "string", "description": "Expense description"},
                        "split_between": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional member names or emails to split with",
                        },
                    },
                    "required": ["event_name", "amount"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_events",
                "description": "List events for the current user",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "group_name": {"type": "string", "description": "Optional group name"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "event_summary",
                "description": "Get an event budget summary",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "event_name": {"type": "string", "description": "Event name"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_groups",
                "description": "List all groups for the current user",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_members",
                "description": "List members of the current group",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_notifications",
                "description": "List notifications for the current user",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "unread_only": {"type": "boolean", "description": "Only unread notifications"},
                        "limit": {"type": "number", "description": "Max notifications to return"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mark_all_notifications_read",
                "description": "Mark all notifications as read",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_expense",
                "description": "Delete one expense by id or the last expense",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "number", "description": "Expense id"},
                        "last": {"type": "boolean", "description": "Delete last expense in group"},
                    },
                },
            },
        },
    ]

    if not client:
        reply, action = fallback_ai_response(content, group_id, current_user, db, background_tasks)
        return crud.save_chat_message(db, msg, current_user.id, reply, action)

    try:
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                        "content": (
                        "You are Split kro's helpful AI assistant. Help the user manage groups, members, expenses, "
                        "events/trips, budgets, limits, balances, and notifications by invoking tools when appropriate."
                    ),
                },
                {"role": "user", "content": processing_content},
            ],
            model="llama3-8b-8192",
            temperature=0.2,
            tools=tools,
            tool_choice="auto",
        )

        response_message = completion.choices[0].message
        ai_reply = str(response_message.content or "")
        action = "info"

        if response_message.tool_calls:
            for tool_call in response_message.tool_calls:
                tool_name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments or "{}")
                except Exception:
                    args = {}

                tool_reply, tool_action = _handle_structured_tool_call(
                    tool_name,
                    args,
                    group_id,
                    current_user,
                    db,
                    background_tasks,
                )

                if tool_reply:
                    ai_reply = (ai_reply + "\n" + tool_reply).strip() if ai_reply else tool_reply
                if tool_action == "expense_created":
                    action = "expense_created"

    except Exception:
        reply, action = fallback_ai_response(content, group_id, current_user, db, background_tasks)
        return crud.save_chat_message(db, msg, current_user.id, reply, action)

    saved_msg = crud.save_chat_message(db, msg, current_user.id, ai_reply or "Done.", action)
    return saved_msg
