@echo off
setlocal
cd /d "%~dp0"
set "AP_VENV=%~dp0.venv\Scripts\python.exe"
if exist "%AP_VENV%" (
  "%AP_VENV%" archipanel_studio.py
) else (
  py -3 archipanel_studio.py
)
if errorlevel 1 pause
