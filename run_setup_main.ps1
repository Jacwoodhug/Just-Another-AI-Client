# run_setup_main.ps1 - Create .venv and install backend requirements
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"

Write-Host "=== Main backend setup ===" -ForegroundColor Cyan

# Create .venv if it doesn't exist
$venv = Join-Path $backend ".venv"
if (!(Test-Path $venv)) {
    Write-Host "Creating .venv with Python 3.12 ..."
    py -3.12 -m venv $venv
} else {
    Write-Host ".venv already exists, skipping creation."
}

# Activate
$activate = Join-Path $venv "Scripts\Activate.ps1"
& $activate

# Upgrade pip
Write-Host "Upgrading pip ..."
python -m pip install --upgrade pip

# Install requirements
$reqs = Join-Path $backend "requirements.txt"
Write-Host "Installing requirements from $reqs ..."
pip install -r $reqs

Write-Host ""
Write-Host "Done!  Activate with:  backend\.venv\Scripts\Activate.ps1" -ForegroundColor Green
