from fastapi.testclient import TestClient
from main import app
import random
import traceback

client = TestClient(app)

def test_fault():
    try:
        em = f"fault{random.randint(0,9999)}@example.com"
        client.post("/api/auth/register", json={"email": em, "name": "Faulttest", "password": "pass"})
        
        login = client.post("/api/auth/login", data={"username": em, "password": "pass"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        with open("fault.txt", "w") as f:
            try:
                res1 = client.get("/api/auth/me", headers=headers)
                f.write(f"ME: {res1.status_code} - {res1.text}\n")
            except Exception as e:
                f.write("ME ERROR:\n" + traceback.format_exc() + "\n")
            
            try:
                res2 = client.get("/api/groups/", headers=headers)
                f.write(f"GROUPS: {res2.status_code} - {res2.text}\n")
            except Exception as e:
                f.write("GROUPS ERROR:\n" + traceback.format_exc() + "\n")

    except Exception as e:
        with open("fault.txt", "w") as f:
            f.write("FATAL:\n" + traceback.format_exc())

test_fault()
