@echo off
echo Starting dev mode: Vite watch (new window) + FastAPI --reload (this window)...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0run_webui_dev.ps1"
pause
