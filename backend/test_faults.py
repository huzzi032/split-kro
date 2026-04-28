import pytest
import urllib.request
import json
import urllib.error # type: ignore

pytest.skip("Skipping integration fault test: requires a running API server on localhost:8001.", allow_module_level=True)

def req(url, method="GET", payload=None, token=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    if payload:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
    else:
        req = urllib.request.Request(url, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

base_url = "http://localhost:8001"

st, res = req(f"{base_url}/api/auth/register", "POST", {"email": "bugtest@ex.com", "name": "Bug", "password": "pass"})
if st != 200:
    st, res = req(f"{base_url}/api/auth/login", "POST", None)
    # wait, login is form data
    import urllib.parse
    data = urllib.parse.urlencode({"username": "bugtest@ex.com", "password": "pass"}).encode("utf-8")
    req_login = urllib.request.Request(f"{base_url}/api/auth/login", data=data, method="POST")
    with urllib.request.urlopen(req_login) as response:
        res = json.loads(response.read().decode())

token = res["access_token"]
st, g = req(f"{base_url}/api/groups/", "POST", {"name": "Test Group"}, token=token)
gid = g["id"]
print("Group ->", gid)

st, d = req(f"{base_url}/api/groups/{gid}", "GET", token=token)
print(f"Group Detail -> {st}: {d}")

st, c = req(f"{base_url}/api/chat/", "POST", {"messageContent": "hello", "groupId": gid}, token=token)
print(f"Chat Output -> {st}: {c}")
