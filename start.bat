@echo off
REM Start both backend (FastAPI) and frontend (Vite) in two new windows.
setlocal
set ROOT=%~dp0

start "audit-ontology backend" cmd /k "cd /d %ROOT%backend && (if not exist .venv (python -m venv .venv)) && .venv\Scripts\python -m pip install -q -r requirements.txt && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"
start "audit-ontology frontend" cmd /k "cd /d %ROOT%frontend && (if not exist node_modules (npm install)) && npm run dev"

echo Backend:  http://127.0.0.1:8000/api/health
echo Frontend: http://127.0.0.1:5173
endlocal
