# run_webui_dev.ps1

Set-Location "$PSScriptRoot\backend"

# Activate the virtual environment
& ".\.venv\Scripts\Activate.ps1"

# Run the FastAPI app (with --reload for development)
uvicorn app:app --reload
