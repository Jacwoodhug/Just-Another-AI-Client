# run_webui_dev.ps1

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

# Run the FastAPI app (with --reload for development)
# --host 127.0.0.1 binds only to loopback, avoiding WinError 10013 (Windows firewall blocks 0.0.0.0 on port 8000)
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
