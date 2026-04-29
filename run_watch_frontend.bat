@echo off
echo Starting Vite watch build for Code Workspace...
echo Rebuilds frontend-dist/ automatically when React source files change.
echo Keep this window open while developing. Refresh the browser after each rebuild.
echo.
cd /d "%~dp0frontend"
npm run dev
pause
