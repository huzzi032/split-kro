import pytest
import requests
import json

pytest.skip("Skipping integration endpoint test: requires a running API server on localhost:8000.", allow_module_level=True)

base = "http://localhost:8000"

# Register or login
try:
    res = requests.post(f"{base}/api/auth/register", json={"email": "bot@test.com", "name": "Bot", "password": "pass"})
    if res.status_code != 200:
        res = requests.post(f"{base}/api/auth/login", data={"username": "bot@test.com", "password": "pass"})
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create group
    gr = requests.post(f"{base}/api/groups/", json={"name": "BotGroup", "description": "Test"}, headers=headers)
    assert gr.status_code == 200, f"Failed to create group: {gr.text}"
    gid = gr.json()["id"]
    print(f"Created group ID: {gid}")
    
    # Detail
    gdet = requests.get(f"{base}/api/groups/{gid}", headers=headers)
    print(f"GET /groups/{gid} -> {gdet.status_code}: {gdet.text[:200]}")
    
    # Chat
    chat = requests.post(f"{base}/api/chat/", json={"messageContent": "hi", "groupId": gid}, headers=headers)
    print(f"POST /chat/ -> {chat.status_code}: {chat.text[:200]}")
    
except Exception as e:
    import traceback
    traceback.print_exc()
