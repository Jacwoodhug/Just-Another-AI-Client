# run-backend.ps1

Set-Location "$PSScriptRoot\backend"

# Activate the virtual environment
& ".\.venv\Scripts\Activate.ps1"

# Run the FastAPI app
uvicorn app:app --reload
