
@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

echo.
echo VHAGAR setup - Windows
echo =====================

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not available in PATH.
    echo Install Node.js 20+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Read Node.js major version
set "NODE_MAJOR="
for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%V"

if not defined NODE_MAJOR (
    echo ERROR: Could not determine the Node.js version.
    pause
    exit /b 1
)

echo Detected Node.js major version: %NODE_MAJOR%

if %NODE_MAJOR% LSS 20 (
    echo ERROR: Node.js 20+ is required. Current major: %NODE_MAJOR%
    pause
    exit /b 1
)

echo Node.js check passed.

REM Check npm
call npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found. Repair your Node.js installation.
    pause
    exit /b 1
)

echo npm check passed.

REM Check Python Launcher and Python 3.11
py -3.11 --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3.11 was not found through the Python Launcher.
    echo Install Python 3.11 from https://www.python.org/downloads/
    echo Enable the Python Launcher during installation.
    pause
    exit /b 1
)

echo Python 3.11 check passed.

REM Create environment files if missing
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    if errorlevel 1 (
        echo ERROR: Could not create backend\.env
        pause
        exit /b 1
    )
)

if not exist "frontend\.env" (
    copy "frontend\.env.example" "frontend\.env" >nul
    if errorlevel 1 (
        echo ERROR: Could not create frontend\.env
        pause
        exit /b 1
    )
)

REM Install JavaScript dependencies
echo.
echo Installing JavaScript dependencies.
echo This requires internet access.
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    echo Check internet access and the npm error above.
    pause
    exit /b 1
)

REM Create Python virtual environment
if not exist "services\finbert-service\.venv\Scripts\python.exe" (
    echo.
    echo Creating FinBERT Python environment.
    py -3.11 -m venv "services\finbert-service\.venv"
    if errorlevel 1 (
        echo ERROR: Could not create the Python virtual environment.
        pause
        exit /b 1
    )
)

REM Install Python dependencies
echo.
echo Upgrading pip.
echo PyTorch and Transformers may take time to download.

"services\finbert-service\.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
    echo ERROR: pip upgrade failed.
    pause
    exit /b 1
)

echo.
echo Installing FinBERT dependencies.
"services\finbert-service\.venv\Scripts\python.exe" -m pip install -r "services\finbert-service\requirements.txt"
if errorlevel 1 (
    echo ERROR: Python dependency installation failed.
    echo Check internet access, disk space, and Python architecture.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo VHAGAR setup packages installed successfully.
echo ==========================================
echo.
echo NEXT STEPS:
echo 1. Edit backend\.env
echo 2. Configure MONGODB_URI and a unique SESSION_SECRET.
echo 3. For live market data and news, configure your Finnhub settings.
echo 4. For AI research, configure LLM_PROVIDER, LLM_API_KEY and LLM_MODEL.
echo 5. Ensure MongoDB is running locally or configure MongoDB Atlas.
echo 6. Start services using scripts\start-windows.bat.
echo.
pause
