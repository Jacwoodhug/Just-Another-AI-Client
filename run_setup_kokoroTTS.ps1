# run_setup_kokoroTTS.ps1 - Create .venv-kokoro and install Kokoro TTS dependencies
# Kokoro requires Python 3.11 (the version confirmed to work).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"

Write-Host "=== Kokoro TTS setup ===" -ForegroundColor Cyan

$pythonVersion = "3.11.9"
$venv        = Join-Path $backend ".venv-kokoro"
$venvPython  = Join-Path $venv "Scripts\python.exe"
# Base Python lives inside .venv-kokoro so there is only one folder to manage
$baseDir     = Join-Path $venv ".base"
$basePython  = Join-Path $baseDir "python.exe"

# Check if .venv-kokoro exists and is working
$needsRebuild = $false
if (!(Test-Path $venvPython)) {
    $needsRebuild = $true
} else {
    & $venvPython --version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $needsRebuild = $true }
}

if ($needsRebuild) {
    if (Test-Path $venv) {
        Write-Host "Existing .venv-kokoro is broken, recreating ..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $venv
    }

    # Download Python embeddable zip — no installer, no spaces-in-path issues
    Write-Host "Downloading Python $pythonVersion embeddable package ..." -ForegroundColor Yellow
    $zipUrl  = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
    $zipPath = Join-Path $env:TEMP "python-$pythonVersion-embed-amd64.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

    Write-Host "Extracting Python $pythonVersion to $baseDir ..."
    New-Item -ItemType Directory -Force $baseDir | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $baseDir -Force
    Remove-Item $zipPath -Force

    # Enable site-packages in the ._pth file (use .NET API to avoid BOM corruption)
    $pthFile = Get-ChildItem $baseDir -Filter "*._pth" | Select-Object -First 1
    if (!$pthFile) { throw "Could not find ._pth file in $baseDir" }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $pthContent = [System.IO.File]::ReadAllText($pthFile.FullName)
    $pthContent = $pthContent -replace '#import site', 'import site'
    [System.IO.File]::WriteAllText($pthFile.FullName, $pthContent, $utf8NoBom)

    # Bootstrap pip onto the embeddable Python
    Write-Host "Bootstrapping pip ..."
    $getPipPath = Join-Path $env:TEMP "get-pip.py"
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPipPath -UseBasicParsing
    & $basePython $getPipPath --no-warn-script-location
    Remove-Item $getPipPath -Force

    # Install virtualenv (embeddable has no venv module)
    Write-Host "Installing virtualenv ..."
    & $basePython -m pip install virtualenv --no-warn-script-location

    # Create the actual venv using virtualenv
    Write-Host "Creating .venv-kokoro ..."
    & $basePython -m virtualenv $venv

    if (!(Test-Path $venvPython)) {
        Write-Host "ERROR: .venv-kokoro was not created successfully." -ForegroundColor Red
        exit 1
    }

    Write-Host ".venv-kokoro created (base Python is self-contained inside .venv-kokoro\.base\)." -ForegroundColor Green
} else {
    Write-Host ".venv-kokoro already exists and works, skipping creation."
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
