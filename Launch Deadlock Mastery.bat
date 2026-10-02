@echo off
title Deadlock Mastery
cd /d "%~dp0"
set PORT=8787

rem Already running? Just open the browser.
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1', %PORT%)).Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Deadlock Mastery is already running - opening http://127.0.0.1:%PORT%/
  start "" http://127.0.0.1:%PORT%/
  exit /b 0
)

set PY=
where py >nul 2>&1 && set PY=py
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (
  echo Python 3 is required: https://www.python.org/downloads/
  pause
  exit /b 1
)

echo Starting Deadlock Mastery on http://127.0.0.1:%PORT%/
echo Close this window to stop the server.
%PY% serve.py %PORT%
if errorlevel 1 pause
