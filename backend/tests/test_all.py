import pytest
from fastapi.testclient import TestClient
from main import app
import random

client = TestClient(app)

def test_ping():
    response = client.get("/api/ping")
    assert response.status_code == 200

def test_full_flow():
    rand_id = random.randint(10000, 99999)
    email = f"tester{rand_id}@example.com"
    
    # 1. Register
    reg_data = {"email": email, "name": "Test User", "password": "password123"}
    resp = client.post("/api/auth/register", json=reg_data)
    assert resp.status_code == 200
    
    # 2. Login
    login_data = {"username": email, "password": "password123"}
    resp = client.post("/api/auth/login", data=login_data)
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create Group
    group_data = {"name": "Test Trip"}
    resp = client.post("/api/groups/", json=group_data, headers=headers)
    assert resp.status_code == 200
    group = resp.json()
    group_id = group["id"]

    # 4. Add Expense
    expense_data = {"amount": 50.0, "groupId": group_id, "description": "Dinner"}
    resp = client.post("/api/expenses/", json=expense_data, headers=headers)
    assert resp.status_code == 200

    # 5. Chat with AI
    chat_data = {"messageContent": "I spent 20 on coffee for the group", "groupId": group_id}
    resp = client.post("/api/chat/", json=chat_data, headers=headers)
    assert resp.status_code == 200
    chat = resp.json()
    assert "aiResponse" in chat
