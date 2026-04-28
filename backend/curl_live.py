import urllib.request
import urllib.error # type: ignore
import json
import random

def test_live():
    em = f"live{random.randint(0,9999)}@example.com"
    data = json.dumps({"email": em, "name": "Livetest", "password": "pass"}).encode('utf-8')
    req = urllib.request.Request(
        "http://127.0.0.1:8001/api/auth/register", 
        data=data, 
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req) as res:
            pass
    except urllib.error.HTTPError as e:
        with open("live_trace.json", "w") as f:
            f.write(e.read().decode('utf-8'))

if __name__ == "__main__":
    test_live()
