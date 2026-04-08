# Deployment (Render + Railway)

This project is deployment-ready as 3 services:

- Python AI service (FastAPI)
- Node backend (Express)
- React frontend (Vite static build)
- Managed PostgreSQL

## Option A: Render (recommended for this stack)

### 1) PostgreSQL

- Create a new Render PostgreSQL instance.
- Copy the External Database URL.

### 2) Python AI Service

- New Web Service -> connect repo -> Root Directory: `ai-service`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 3) Node Backend

- New Web Service -> connect repo -> Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `DATABASE_URL` = Render PostgreSQL External URL
  - `AI_SERVICE_URL` = Python service public URL (for example `https://your-ai-service.onrender.com`)
  - `JWT_SECRET` = long random string
  - `PORT` = `10000` (or Render default)

### 4) React Frontend

- New Static Site -> Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment Variables:
  - `VITE_API_BASE_URL` = Node backend public URL (for example `https://your-backend.onrender.com`)

## Option B: Railway

### 1) PostgreSQL

- Add PostgreSQL plugin.
- Copy `DATABASE_URL` from Railway variables.

### 2) Deploy services

- Deploy `ai-service` as Python service:
  - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Deploy `backend` as Node service:
  - Start: `npm start`
  - Set `DATABASE_URL`, `AI_SERVICE_URL`, `JWT_SECRET`
- Deploy `frontend` as static app:
  - Build: `npm run build`
  - Set `VITE_API_BASE_URL`

## Fast sanity checklist before submit

- `seed_db.py` exists at repository root.
- No hardcoded secrets in code.
- `backend/.env.example` and `frontend/.env.example` are placeholders only.
- `GET /api/matches` returns dynamic model-generated odds.
- `POST /api/agent/query` returns reasoning text.

## 60-second demo fallback

If deployment time is tight, include a short walkthrough video in README that shows:

- Login/Register
- Match odds loading
- Favorites
- Agent query response
