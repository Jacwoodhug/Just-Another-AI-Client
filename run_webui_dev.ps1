# run_webui_dev.ps1
# Starts the FastAPI backend (--reload) and Vite watch build together.
# Vite watch opens in a new window; closing this window also closes the Vite window.

# --- Launch Vite watch in a new PowerShell window, capture the process ---
$frontendDir = Join-Path $PSScriptRoot "frontend"
$viteProc = Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev" -PassThru

# Register cleanup on session exit (covers window close / abrupt termination)
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -MessageData $viteProc -Action {
    $proc = $Event.MessageData
    if ($proc -and -not $proc.HasExited) {
        taskkill /F /T /PID $proc.Id 2>$null
    }
}

# --- Backend setup ---
Set-Location "$PSScriptRoot\backend"

# Kill any process already listening on port 8000
$existing = netstat -ano | Select-String ":8000\s" | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Sort-Object -Unique
foreach ($procId in $existing) {
    if ($procId -match '^\d+$' -and $procId -ne '0') {
        Write-Host "Killing existing process on port 8000 (PID $procId)..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

# Activate the virtual environment
& ".\.venv\Scripts\Activate.ps1"

# Run the FastAPI app; always kill the Vite window on exit (Ctrl+C or error)
try {
    # --host 127.0.0.1 binds only to loopback, avoiding WinError 10013 (Windows firewall blocks 0.0.0.0 on port 8000)
    uvicorn app:app --host 127.0.0.1 --port 8000 --reload
} finally {
    if ($viteProc -and -not $viteProc.HasExited) {
        Write-Host "Closing Vite watch window..."
        taskkill /F /T /PID $viteProc.Id 2>$null
    }
}
