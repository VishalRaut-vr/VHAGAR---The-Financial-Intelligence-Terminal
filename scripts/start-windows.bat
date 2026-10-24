@echo off
setlocal
cd /d "%~dp0\.."
if not exist backend\.env (echo Missing backend\.env. Run scripts\setup-windows.bat first. & exit /b 1)
if not exist frontend\.env (echo Missing frontend\.env. Run scripts\setup-windows.bat first. & exit /b 1)
if not exist services\finbert-service\.venv\Scripts\python.exe (echo FinBERT Python environment is missing. Run scripts\setup-windows.bat first. & exit /b 1)
echo Starting VHAGAR services in separate terminal windows.
echo Ensure MongoDB is running and backend\.env has a valid MONGODB_URI and SESSION_SECRET.
start "VHAGAR Backend" /D "%CD%" cmd /k "npm run dev:backend"
start "VHAGAR Frontend" /D "%CD%" cmd /k "npm run dev:frontend"
start "VHAGAR FinBERT" /D "%CD%\services\finbert-service" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001"
echo.
echo Frontend: http://localhost:5173
echo Backend health: http://localhost:4000/api/v1/health
echo FinBERT health: http://127.0.0.1:8001/health
echo The first FinBERT start downloads ProsusAI/finbert and may take several minutes.
