$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptRoot

$venvPath = Join-Path $scriptRoot ".venv-kokoro"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonPath)) {
  Write-Host "Kokoro venv not found at $venvPath."
  Write-Host "Create it first: py -3.11 -m venv backend\\.venv-kokoro"
  exit 1
}

& $pythonPath -m uvicorn kokoro_service:app --host 127.0.0.1 --port 5005
