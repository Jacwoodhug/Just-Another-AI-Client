# run_setup_comfyui.ps1 - Clone ComfyUI and install its requirements into the main .venv
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$comfyDir = Join-Path $root "ComfyUI"

Write-Host "=== ComfyUI setup ===" -ForegroundColor Cyan

# Clone ComfyUI if the folder doesn't exist
if (!(Test-Path $comfyDir)) {
    Write-Host "Cloning ComfyUI ..."
    git clone https://github.com/comfy-org/ComfyUI $comfyDir
} else {
    Write-Host "ComfyUI folder already exists, skipping clone."
}

# Activate the main .venv (ComfyUI runs under the same venv)
$venv = Join-Path $backend ".venv"
if (!(Test-Path $venv)) {
    Write-Host "Main .venv not found - run run_setup_main.ps1 first." -ForegroundColor Red
    exit 1
}
$activate = Join-Path $venv "Scripts\Activate.ps1"
& $activate

# Install PyTorch (CUDA 12.x wheels - change the index-url for CPU-only or different CUDA)
Write-Host "Installing PyTorch (CUDA 12) into main .venv ..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128

# Install ComfyUI requirements
$reqs = Join-Path $comfyDir "requirements.txt"
if (Test-Path $reqs) {
    Write-Host "Installing ComfyUI requirements from $reqs ..."
    pip install -r $reqs
} else {
    Write-Host "Warning: ComfyUI requirements.txt not found at $reqs" -ForegroundColor Yellow
}

# Update .env with the ComfyUI path if it still has the placeholder
$envFile = Join-Path $backend ".env"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    if ($content -match "COMFYUI_DIR=C:/path/to/ComfyUI") {
        $escaped = $comfyDir -replace '\\', '/'
        $content = $content -replace "COMFYUI_DIR=C:/path/to/ComfyUI", "COMFYUI_DIR=$escaped"
        Set-Content $envFile $content -NoNewline
        Write-Host "Updated COMFYUI_DIR in .env to $escaped"
    }
}

Write-Host ""
Write-Host "Done!  ComfyUI is at $comfyDir" -ForegroundColor Green
Write-Host "Place checkpoint files in: $comfyDir\models\checkpoints\" -ForegroundColor Green
