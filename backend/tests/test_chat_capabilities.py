import random

from fastapi.testclient import TestClient  # type: ignore

import models  # type: ignore
from database import SessionLocal  # type: ignore
from main import app  # type: ignore

client = TestClient(app)


def _register(email: str, name: str, password: str):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "name": name, "password": password},
    )
    assert response.status_code == 200


def _login(email: str, password: str):
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _chat(headers, message: str, group_id: int | None = None):
    payload = {"messageContent": message}
    if group_id is not None:
        payload["groupId"] = group_id
    response = client.post("/api/chat/", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _accept_invitation(headers, group_id: int):
    pending = client.get("/api/groups/invitations/pending", headers=headers)
    assert pending.status_code == 200, pending.text
    invite = next((i for i in pending.json() if i.get("groupId") == group_id), None)
    assert invite is not None
    accept = client.post(f"/api/groups/invitations/{invite['token']}/accept", headers=headers)
    assert accept.status_code == 200, accept.text


def test_chatbot_can_handle_core_app_flows():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_chat_{rand_id}@example.com"
    member_email = f"member_chat_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Bob", password)

    owner_headers = _login(owner_email, password)

    group_response = client.post(
        "/api/groups/",
        json={"name": "Chat Power Group", "currency": "PKR"},
        headers=owner_headers,
    )
    assert group_response.status_code == 200, group_response.text
    group_id = group_response.json()["id"]

    add_member_response = client.post(
        f"/api/groups/{group_id}/members",
        json={"email": member_email},
        headers=owner_headers,
    )
    assert add_member_response.status_code == 200, add_member_response.text

    member_headers = _login(member_email, password)
    _accept_invitation(member_headers, group_id)

    groups_chat = _chat(owner_headers, "list groups")
    assert "Chat Power Group" in groups_chat.get("aiResponse", "")

    members_chat = _chat(owner_headers, "list members", group_id)
    members_text = members_chat.get("aiResponse", "")
    assert "Owner" in members_text
    assert member_email in members_text

    set_limit_chat = _chat(owner_headers, f"set limit 700 for {member_email}", group_id)
    assert "Set" in set_limit_chat.get("aiResponse", "")

    list_limits_chat = _chat(owner_headers, "list limits", group_id)
    limits_text = list_limits_chat.get("aiResponse", "")
    assert "700.00" in limits_text

    add_expense_chat = _chat(owner_headers, "add dinner 400 split between Bob", group_id)
    assert add_expense_chat.get("action") == "expense_created"

    with SessionLocal() as db:
        member_user = db.query(models.User).filter(models.User.email == member_email).first()
        assert member_user is not None

        latest_expense = (
            db.query(models.Expense)
            .filter(models.Expense.groupId == group_id)
            .order_by(models.Expense.expenseDate.desc(), models.Expense.id.desc())
            .first()
        )
        assert latest_expense is not None

        splits = (
            db.query(models.ExpenseSplit)
            .filter(models.ExpenseSplit.expenseId == latest_expense.id)
            .all()
        )
        assert len(splits) == 1
        assert int(splits[0].userId) == int(member_user.id)

    list_expenses_chat = _chat(owner_headers, "list expenses", group_id)
    expenses_text = list_expenses_chat.get("aiResponse", "").lower()
    assert "dinner" in expenses_text

    unread_chat = _chat(owner_headers, "unread notifications")
    assert "unread notifications" in unread_chat.get("aiResponse", "").lower()

    mark_read_chat = _chat(owner_headers, "mark all notifications")
    assert "marked all notifications as read" in mark_read_chat.get("aiResponse", "").lower()

    unread_count_response = client.get("/api/notifications/unread-count", headers=owner_headers)
    assert unread_count_response.status_code == 200
    assert unread_count_response.json().get("count") == 0

    delete_expense_chat = _chat(owner_headers, "delete last expense", group_id)
    assert "Deleted expense" in delete_expense_chat.get("aiResponse", "")

    remaining_expenses = client.get(
        "/api/expenses/",
        params={"groupId": group_id},
        headers=owner_headers,
    )
    assert remaining_expenses.status_code == 200
    assert len(remaining_expenses.json()) == 0


def test_chatbot_send_notification_command_creates_notification():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_notify_{rand_id}@example.com"
    member_email = f"member_notify_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Bob", password)

    owner_headers = _login(owner_email, password)

    group_response = client.post(
        "/api/groups/",
        json={"name": "Notify Group", "currency": "PKR"},
        headers=owner_headers,
    )
    assert group_response.status_code == 200, group_response.text
    group_id = group_response.json()["id"]

    add_member_response = client.post(
        f"/api/groups/{group_id}/members",
        json={"email": member_email},
        headers=owner_headers,
    )
    assert add_member_response.status_code == 200, add_member_response.text

    member_headers = _login(member_email, password)
    _accept_invitation(member_headers, group_id)

    chat_response = _chat(
        owner_headers,
        "send notification to Bob to please settle your share",
        group_id,
    )
    assert "notification sent" in chat_response.get("aiResponse", "").lower()

    with SessionLocal() as db:
        member_user = db.query(models.User).filter(models.User.email == member_email).first()
        assert member_user is not None

        latest_notification = (
            db.query(models.Notification)
            .filter(
                models.Notification.userId == member_user.id,
                models.Notification.groupId == group_id,
            )
            .order_by(models.Notification.createdAt.desc(), models.Notification.id.desc())
            .first()
        )
        assert latest_notification is not None
        assert "please settle your share" in (latest_notification.body or "").lower()


def test_settlement_endpoints_return_data_for_group():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_settle_{rand_id}@example.com"
    member_email = f"member_settle_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Member", password)
    owner_headers = _login(owner_email, password)

    group_response = client.post(
        "/api/groups/",
        json={"name": "Settlement Group", "currency": "PKR"},
        headers=owner_headers,
    )
    assert group_response.status_code == 200, group_response.text
    group_id = group_response.json()["id"]

    add_member_response = client.post(
        f"/api/groups/{group_id}/members",
        json={"email": member_email},
        headers=owner_headers,
    )
    assert add_member_response.status_code == 200, add_member_response.text

    member_headers = _login(member_email, password)
    _accept_invitation(member_headers, group_id)

    with SessionLocal() as db:
        member_user = db.query(models.User).filter(models.User.email == member_email).first()
        assert member_user is not None

    create_settlement_response = client.post(
        "/api/settlements/",
        json={
            "groupId": group_id,
            "paidTo": member_user.id,
            "amount": 250,
            "currency": "PKR",
        },
        headers=owner_headers,
    )
    assert create_settlement_response.status_code == 200, create_settlement_response.text

    balances_response = client.get(
        "/api/settlements/balances",
        params={"groupId": group_id},
        headers=owner_headers,
    )
    assert balances_response.status_code == 200, balances_response.text
    assert isinstance(balances_response.json(), list)

    plan_response = client.get(
        "/api/settlements/plan",
        params={"groupId": group_id},
        headers=owner_headers,
    )
    assert plan_response.status_code == 200, plan_response.text
    plan_json = plan_response.json()
    assert "balances" in plan_json
    assert "transactions" in plan_json

    history_response = client.get(
        "/api/settlements/",
        params={"groupId": group_id},
        headers=owner_headers,
    )
    assert history_response.status_code == 200, history_response.text
    history_json = history_response.json()
    assert len(history_json) >= 1
