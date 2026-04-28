# Split kro

A lightweight, self-hostable Splitwise-like app (Split kro) — backend in FastAPI + SQLAlchemy and frontend in React + Vite.

Key highlights
- Invite users by email (in-app + email)
- AI chat assistant for balances, settlement plans, and events/trips
- Events/trips module with expense tracking and budget
- Test suites for backend (pytest) and frontend (Vitest)

Getting started
1. Copy environment variables to `backend/.env` (this file is intentionally excluded from the repo).

Minimum required env vars (example):

```
NEON_DATABASE_URL=postgresql://...
GROQ_API_KEY=...
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=you@example.com
SMTP_PASSWORD=...
SMTP_FROM="Split kro <you@example.com>"
APP_URL=http://localhost:3000
APP_NAME=Split kro
```

Backend (Python)

1. Create a virtualenv and install dependencies:

```powershell
cd backend
C:/path/to/python.exe -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Run tests:

```powershell
python -m pytest
```

3. Run the API server:

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Frontend (Node + Vite)

1. Install and run:

```bash
cd frontend
npm install
npm run dev
```

2. Run UI tests:

```bash
npm test
```

Security & notes
- `backend/.env` is excluded from version control — never commit secrets. See `.gitignore`.
- The repo may include generated __pycache__ files from local runs; consider cleaning these and adding a more strict `.gitignore` if desired.

Contributing
- Open an issue or PR on the GitHub repo. Small, focused PRs are easiest to review.

License
- (Add your license here)

--
Made with care — contact the maintainer via the configured `SMTP_USERNAME` for questions.
