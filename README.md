# Sports Odds Intelligence Platform

A full-stack simulation of a real-world sports odds engine:

Data → Model → API → UI

---

## 🏗️ Architecture

- **Backend:** Node.js (Express)
- **AI Service:** Python (FastAPI)
- **Frontend:** React (Vite)
- **Database:** PostgreSQL

---

## 🚀 Features

- 🔐 JWT Authentication (Register/Login)
- 📊 Match listing system (sport, league, teams, start time)
- 🤖 AI-generated odds (NOT hardcoded)
- 🔗 Node.js ↔ Python service integration
- ⭐ Favorites system (save matches)
- 📈 Probability-based odds calculation
- 💬 Simple AI Agent for match insights

---

## 🧠 AI Odds Logic

- Higher team rating → higher win probability
- Probabilities are normalized
- Odds are derived from probabilities

Example:


Team A Win: 55%
Team B Win: 30%
Draw: 15%


---

## 📁 Project Structure


backend/ → Express API (auth, matches, favorites, agent)
python-service/ → FastAPI odds generator
frontend/ → React UI


---

## ⚙️ Setup Instructions

### 1. Clone Repository

```bash
git clone https://github.com/jyothir-369/ai-sports-odds-platform.git
cd ai-sports-odds-platform
2. Backend Setup
cd backend
npm install
npm run dev

Runs on: http://localhost:4000

3. Python AI Service
cd python-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

Runs on: http://localhost:8000

4. Frontend Setup
cd frontend
npm install
npm run dev

Runs on: http://localhost:5173

🔌 API Endpoints
Auth
POST /api/auth/register
POST /api/auth/login
Matches
GET /api/matches
GET /api/matches/:id
AI Odds
POST /generate-odds (Python service)
Agent
POST /api/agent/query
Favorites
GET /api/favorites
POST /api/favorites
DELETE /api/favorites/:id
💬 Example AI Response

"Team A has a higher win probability (55%), making them the favorite."

📌 Notes
Odds are dynamically generated using the Python model
No hardcoded values are used
Focus is on clean architecture and service integration
👨‍💻 Author
GitHub: https://github.com/jyothir-369

---

## 🔥 What I changed (important)

- ❌ Removed overly complex stuff (auction, war room, etc.)
- ✅ Aligned exactly with assignment requirements  
- ✅ Made it clean & recruiter-friendly  
- ✅ Easy to understand in 30 seconds  

---

## 🎯 Why this version is better

Recruiters at :contentReference[oaicite:1]{index=1} will:
- Quickly understand your project ✅  
- See you followed instructions ✅  
- Not get confused by extra features ✅  

---

## 🚀 Next Step

1. Replace your README with this  
2. Commit:

```bash
git add README.md
git commit -m "Updated README for clarity and alignment with assessment"
git push