import random

from fastapi.testclient import TestClient  # type: ignore

from main import app  # type: ignore

client = TestClient(app)


def _register(email: str, name: str, password: str):
    response = client.post(
        "/api/auth/register",
        json={"email": email, "name": name, "password": password},
    )
    assert response.status_code == 200, response.text


def _login(email: str, password: str):
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_group(headers, name: str = "Invite Test Group"):
    response = client.post("/api/groups/", json={"name": name, "currency": "PKR"}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _invite_member(headers, group_id: int, email: str):
    response = client.post(
        f"/api/groups/{group_id}/members",
        json={"email": email},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _get_pending_invite(headers, group_id: int):
    response = client.get("/api/groups/invitations/pending", headers=headers)
    assert response.status_code == 200, response.text
    return next((i for i in response.json() if i.get("groupId") == group_id), None)


def _accept_invite(headers, token: str):
    response = client.post(f"/api/groups/invitations/{token}/accept", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _decline_invite(headers, token: str):
    response = client.post(f"/api/groups/invitations/{token}/decline", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _group_members(headers, group_id: int):
    response = client.get(f"/api/groups/{group_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json().get("members", [])


def test_invitation_flow_existing_user_accepts():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_inv_{rand_id}@example.com"
    member_email = f"member_inv_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Member", password)

    owner_headers = _login(owner_email, password)
    group_id = _create_group(owner_headers)

    _invite_member(owner_headers, group_id, member_email)

    member_headers = _login(member_email, password)
    invite = _get_pending_invite(member_headers, group_id)
    assert invite is not None

    accept = _accept_invite(member_headers, invite["token"])
    assert accept.get("ok") is True

    balances = client.get(
        "/api/settlements/balances",
        params={"groupId": group_id},
        headers=member_headers,
    )
    assert balances.status_code == 200, balances.text


def test_invitation_flow_non_user_register_then_accept():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_non_{rand_id}@example.com"
    member_email = f"newmember_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    owner_headers = _login(owner_email, password)
    group_id = _create_group(owner_headers)

    _invite_member(owner_headers, group_id, member_email)

    _register(member_email, "New Member", password)
    member_headers = _login(member_email, password)

    invite = _get_pending_invite(member_headers, group_id)
    assert invite is not None
    accept = _accept_invite(member_headers, invite["token"])
    assert accept.get("ok") is True

    balances = client.get(
        "/api/settlements/balances",
        params={"groupId": group_id},
        headers=member_headers,
    )
    assert balances.status_code == 200, balances.text


def test_invitation_decline_blocks_membership():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_decl_{rand_id}@example.com"
    member_email = f"member_decl_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Member", password)

    owner_headers = _login(owner_email, password)
    group_id = _create_group(owner_headers)

    _invite_member(owner_headers, group_id, member_email)

    member_headers = _login(member_email, password)
    invite = _get_pending_invite(member_headers, group_id)
    assert invite is not None

    decline = _decline_invite(member_headers, invite["token"])
    assert decline.get("ok") is True

    pending_again = _get_pending_invite(member_headers, group_id)
    assert pending_again is None

    balances = client.get(
        "/api/settlements/balances",
        params={"groupId": group_id},
        headers=member_headers,
    )
    assert balances.status_code == 403


def test_balance_fallback_when_splits_zero():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_bal_{rand_id}@example.com"
    member_email = f"member_bal_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Member", password)

    owner_headers = _login(owner_email, password)
    group_id = _create_group(owner_headers)
    _invite_member(owner_headers, group_id, member_email)

    member_headers = _login(member_email, password)
    invite = _get_pending_invite(member_headers, group_id)
    assert invite is not None
    _accept_invite(member_headers, invite["token"])

    members = _group_members(owner_headers, group_id)
    owner_id = next((m["userId"] for m in members if (m.get("user", {}) or {}).get("email") == owner_email), None)
    member_id = next((m["userId"] for m in members if (m.get("user", {}) or {}).get("email") == member_email), None)
    assert owner_id is not None
    assert member_id is not None

    expense_payload = {
        "amount": 500.0,
        "groupId": group_id,
        "description": "Fallback test",
        "paidBy": owner_id,
        "splits": [
            {"userId": owner_id, "amount": 0},
            {"userId": member_id, "amount": 0},
        ],
    }
    expense_resp = client.post("/api/expenses/", json=expense_payload, headers=owner_headers)
    assert expense_resp.status_code == 200, expense_resp.text

    balances_resp = client.get(
        "/api/settlements/balances",
        params={"groupId": group_id},
        headers=owner_headers,
    )
    assert balances_resp.status_code == 200, balances_resp.text

    balances = balances_resp.json()
    owner_balance = next((b for b in balances if b["userId"] == owner_id), None)
    member_balance = next((b for b in balances if b["userId"] == member_id), None)
    assert owner_balance is not None
    assert member_balance is not None
    assert round(owner_balance["net"], 2) == 250.0
    assert round(member_balance["net"], 2) == -250.0


def test_chat_balance_audit_and_settlement_coach():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_chat_{rand_id}@example.com"
    member_email = f"member_chat_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    _register(member_email, "Member", password)

    owner_headers = _login(owner_email, password)
    group_id = _create_group(owner_headers)
    _invite_member(owner_headers, group_id, member_email)

    member_headers = _login(member_email, password)
    invite = _get_pending_invite(member_headers, group_id)
    assert invite is not None
    _accept_invite(member_headers, invite["token"])

    members = _group_members(owner_headers, group_id)
    owner_id = next((m["userId"] for m in members if (m.get("user", {}) or {}).get("email") == owner_email), None)
    member_id = next((m["userId"] for m in members if (m.get("user", {}) or {}).get("email") == member_email), None)
    assert owner_id is not None
    assert member_id is not None

    expense_payload = {
        "amount": 400.0,
        "groupId": group_id,
        "description": "Coach test",
        "paidBy": owner_id,
        "splits": [
            {"userId": owner_id, "amount": 200},
            {"userId": member_id, "amount": 200},
        ],
    }
    expense_resp = client.post("/api/expenses/", json=expense_payload, headers=owner_headers)
    assert expense_resp.status_code == 200, expense_resp.text

    audit_resp = client.post(
        "/api/chat/",
        json={"messageContent": "explain balance", "groupId": group_id},
        headers=owner_headers,
    )
    assert audit_resp.status_code == 200, audit_resp.text
    assert "Balance breakdown" in (audit_resp.json().get("aiResponse") or "")

    coach_resp = client.post(
        "/api/chat/",
        json={"messageContent": "settlement plan", "groupId": group_id},
        headers=owner_headers,
    )
    assert coach_resp.status_code == 200, coach_resp.text
    coach_text = coach_resp.json().get("aiResponse", "")
    assert "Recommended settlement plan" in coach_text or "pays" in coach_text


def test_chat_create_group_and_invite():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_combo_{rand_id}@example.com"
    invite_email = f"invite_combo_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    owner_headers = _login(owner_email, password)

    chat_resp = client.post(
        "/api/chat/",
        json={"messageContent": f"create a group dunify and add {invite_email}"},
        headers=owner_headers,
    )
    assert chat_resp.status_code == 200, chat_resp.text

    group_list = client.get("/api/groups/", headers=owner_headers)
    assert group_list.status_code == 200, group_list.text
    assert any(g.get("name", "").lower() == "dunify" for g in group_list.json())

    _register(invite_email, "Invite", password)
    invite_headers = _login(invite_email, password)
    pending = client.get("/api/groups/invitations/pending", headers=invite_headers)
    assert pending.status_code == 200, pending.text
    assert pending.json(), "Expected a pending invitation"
