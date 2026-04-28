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


def test_event_endpoints_and_summary():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_event_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    headers = _login(owner_email, password)

    group_resp = client.post("/api/groups/", json={"name": "Event Group"}, headers=headers)
    assert group_resp.status_code == 200, group_resp.text
    group_id = group_resp.json()["id"]

    event_resp = client.post(
        "/api/events/",
        json={"groupId": group_id, "name": "Hunza Trip", "budget": 5000},
        headers=headers,
    )
    assert event_resp.status_code == 200, event_resp.text
    event_id = event_resp.json()["id"]

    list_resp = client.get("/api/events/", headers=headers)
    assert list_resp.status_code == 200, list_resp.text
    assert any(e.get("id") == event_id for e in list_resp.json())

    detail_resp = client.get(f"/api/events/{event_id}", headers=headers)
    assert detail_resp.status_code == 200, detail_resp.text
    detail_json = detail_resp.json()
    assert detail_json.get("event", {}).get("name") == "Hunza Trip"

    members = detail_json.get("members", [])
    assert len(members) >= 1
    owner_id = members[0]["userId"]

    expense_resp = client.post(
        f"/api/events/{event_id}/expenses",
        json={
            "eventId": event_id,
            "amount": 1200,
            "description": "Hotel",
            "paidBy": owner_id,
            "splits": [{"userId": owner_id, "amount": 1200}],
        },
        headers=headers,
    )
    assert expense_resp.status_code == 200, expense_resp.text

    balances_resp = client.get(f"/api/events/{event_id}/balances", headers=headers)
    assert balances_resp.status_code == 200, balances_resp.text
    assert isinstance(balances_resp.json(), list)

    summary_resp = client.get(f"/api/events/{event_id}/summary", headers=headers)
    assert summary_resp.status_code == 200, summary_resp.text
    summary_json = summary_resp.json()
    assert summary_json.get("spent") == 1200


def test_event_chat_commands():
    rand_id = random.randint(100000, 999999)
    owner_email = f"owner_event_chat_{rand_id}@example.com"
    password = "pass123"

    _register(owner_email, "Owner", password)
    headers = _login(owner_email, password)

    group_resp = client.post("/api/groups/", json={"name": "Chat Event Group"}, headers=headers)
    assert group_resp.status_code == 200, group_resp.text
    group_id = group_resp.json()["id"]

    create_chat = client.post(
        "/api/chat/",
        json={"messageContent": "create event hunza trip", "groupId": group_id},
        headers=headers,
    )
    assert create_chat.status_code == 200, create_chat.text

    add_chat = client.post(
        "/api/chat/",
        json={"messageContent": "add event expense 500 for hunza trip", "groupId": group_id},
        headers=headers,
    )
    assert add_chat.status_code == 200, add_chat.text

    summary_chat = client.post(
        "/api/chat/",
        json={"messageContent": "event summary hunza trip", "groupId": group_id},
        headers=headers,
    )
    assert summary_chat.status_code == 200, summary_chat.text
    assert "summary" in (summary_chat.json().get("aiResponse", "").lower())
