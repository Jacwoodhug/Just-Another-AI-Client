# run_setup_kokoroTTS.ps1 - Create .venv-kokoro and install Kokoro TTS dependencies
# Kokoro requires Python 3.11 (the version confirmed to work).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"

Write-Host "=== Kokoro TTS setup ===" -ForegroundColor Cyan

# Create .venv-kokoro if it doesn't exist
$venv = Join-Path $backend ".venv-kokoro"
if (!(Test-Path $venv)) {
    Write-Host "Creating .venv-kokoro with Python 3.11 ..."
    py -3.11 -m venv $venv
} else {
    Write-Host ".venv-kokoro already exists, skipping creation."
}

# Activate
$activate = Join-Path $venv "Scripts\Activate.ps1"
& $activate

# Upgrade pip
Write-Host "Upgrading pip ..."
python -m pip install --upgrade pip

# Install PyTorch (CUDA 12.x wheels - change the index-url for CPU-only or different CUDA)
Write-Host "Installing PyTorch (CUDA 12) ..."
pip install torch --index-url https://download.pytorch.org/whl/cu128

# Install Kokoro requirements
$reqs = Join-Path $backend "kokoro-requirements.txt"
Write-Host "Installing requirements from $reqs ..."
pip install -r $reqs

# Download the default spaCy model used by Kokoro's phonemizer
Write-Host "Downloading spaCy en_core_web_sm model ..."
python -m spacy download en_core_web_sm

Write-Host ""
Write-Host "Done!  Kokoro venv is at backend\.venv-kokoro" -ForegroundColor Green
