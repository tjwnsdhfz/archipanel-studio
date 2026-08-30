@echo off
setlocal
cd /d "%~dp0"
set "ARCHIPANEL_HOST=0.0.0.0"
set "ARCHIPANEL_PORT=8766"
set "AP_VENV=%~dp0.venv\Scripts\python.exe"
echo ArchiPanel Studio LAN mode
echo Local: http://127.0.0.1:8766/
echo LAN:   use http://YOUR-PC-IP:8766/
if exist "%AP_VENV%" (
  "%AP_VENV%" archipanel_studio.py --no-browser
) else (
  py -3 archipanel_studio.py --no-browser
)
if errorlevel 1 pause
