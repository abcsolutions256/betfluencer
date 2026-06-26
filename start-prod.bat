@echo off
setlocal EnableExtensions
title Betfluencer - Production (Docker)

REM ============================================================
REM  Betfluencer - start the PRODUCTION docker compose stack.
REM  1) starts the Docker engine (service + Docker Desktop)
REM  2) waits until the engine is actually available
REM  3) cd to the project directory
REM  4) builds + runs docker-compose.prod.yml (detached)
REM
REM  Edit the two paths below if your install differs.
REM ============================================================

set "PROJECT_DIR=C:\Users\Administrator\Desktop\bet fluencer"
set "DOCKER_DESKTOP=C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo ============================================================
echo  Betfluencer - starting PRODUCTION stack
echo ============================================================

REM --- 1. Already running? then skip straight to compose ---
docker info >nul 2>&1
if %errorlevel%==0 (
    echo [docker] Engine already running.
    goto compose
)

REM --- 2. Start the Docker service (needs admin) + Docker Desktop ---
echo [docker] Starting Docker service / Docker Desktop...
net start com.docker.service >nul 2>&1
if exist "%DOCKER_DESKTOP%" (
    start "" "%DOCKER_DESKTOP%"
) else (
    echo [docker] WARNING: "%DOCKER_DESKTOP%" not found - relying on the service.
)

REM --- 3. Wait for the engine to answer (up to ~5 minutes) ---
set /a tries=0
:waitloop
docker info >nul 2>&1
if %errorlevel%==0 goto ready
set /a tries+=1
if %tries% geq 60 (
    echo [docker] ERROR: Docker did not become ready in time.
    echo          Open Docker Desktop manually, then re-run this script.
    pause
    exit /b 1
)
echo [docker] Waiting for Docker engine... (%tries%/60^)
timeout /t 5 /nobreak >nul
goto waitloop

:ready
echo [docker] Engine is ready.

:compose
REM --- 4. Go to the project directory ---
if not exist "%PROJECT_DIR%" (
    echo [compose] ERROR: project directory not found: "%PROJECT_DIR%"
    pause
    exit /b 1
)
cd /d "%PROJECT_DIR%"
echo [compose] Directory: %cd%

REM --- 5. Build + run the production stack (detached) ---
echo [compose] docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml up --build -d
if %errorlevel% neq 0 (
    echo [compose] ERROR: compose failed (exit %errorlevel%^).
    pause
    exit /b %errorlevel%
)

echo.
echo [compose] Production stack is up. Services:
docker compose -f docker-compose.prod.yml ps
echo.
echo Done. ^(web is internal - put it behind your reverse proxy; worker is internal-only.^)
pause
endlocal
