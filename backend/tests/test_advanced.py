import pytest # type: ignore
from fastapi.testclient import TestClient # type: ignore
from main import app # type: ignore
import random

client = TestClient(app)

def test_advanced_queries():
    # Setup random users
    rand_id = random.randint(100000, 999999)
    email1 = f"userA_{rand_id}@example.com"
    email2 = f"userB_{rand_id}@example.com"
    
    # 1. Register User A and User B
    resp_a = client.post("/api/auth/register", json={"email": email1, "name": "Alice", "password": "pass"})
    assert resp_a.status_code == 200
    resp_b = client.post("/api/auth/register", json={"email": email2, "name": "Bob", "password": "pass"})
    assert resp_b.status_code == 200

    # 2. Login User A to get token
    login_a = client.post("/api/auth/login", data={"username": email1, "password": "pass"})
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 3. Create a Group
    group_resp = client.post("/api/groups/", json={"name": "Vacation Funds"}, headers=headers_a)
    group_id = group_resp.json()["id"]

    # 4. Add Member (User B) to Group (This triggers SMTP email natively)
    member_resp = client.post(f"/api/groups/{group_id}/members", json={"email": email2}, headers=headers_a)
    assert member_resp.status_code == 200

    # 5. User A stores values via explicit CRUD queries
    exp_a = client.post("/api/expenses/", json={"amount": 120.0, "groupId": group_id, "description": "AirBnB"}, headers=headers_a)
    assert exp_a.status_code == 200

    # 6. User B logs in
    login_b = client.post("/api/auth/login", data={"username": email2, "password": "pass"})
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Accept invitation as User B
    pending_resp = client.get("/api/groups/invitations/pending", headers=headers_b)
    assert pending_resp.status_code == 200
    invite = next((i for i in pending_resp.json() if i.get("groupId") == group_id), None)
    assert invite is not None
    accept_resp = client.post(
        f"/api/groups/invitations/{invite['token']}/accept",
        headers=headers_b,
    )
    assert accept_resp.status_code == 200

    # 7. User B adds expense

    exp_b = client.post("/api/expenses/", json={"amount": 45.0, "groupId": group_id, "description": "Taxi"}, headers=headers_b)
    assert exp_b.status_code == 200

    # 8. Ask Chat Queries (LLaMA Agent tool utilization)
    # The agent should see the text and call the 'create_expense' tool autonomously
    chat_resp = client.post("/api/chat/", json={"messageContent": "I spent 30 on breakfast, split it", "groupId": group_id}, headers=headers_b)
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["action"] == "expense_created"

    # Query the database indirectly by asking the agent a natural query
    # (Assuming the LLM agent handles conversational feedback gracefully)
    generic_chat = client.post("/api/chat/", json={"messageContent": "Hello AI!", "groupId": group_id}, headers=headers_a)
    assert generic_chat.status_code == 200
    assert generic_chat.json()["action"] == "info"
