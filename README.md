# Ollama Voice Chat

A local-first voice chat web UI that sends transcribed speech to an Ollama LLM (or OpenRouter), lets the model stay silent if it wants, and stores long-term RAG memory in SQLite.

## Requirements
- Python 3.12 (main backend)
- Python 3.11 (Kokoro TTS - only if using Kokoro)
- [Python Launcher for Windows](https://docs.python.org/3/using/windows.html) (`py`) with both versions installed
- Ollama running locally
- Git (for ComfyUI setup)
- A browser that supports the Web Speech API (Chrome works well)

## Setup

### 1. Main Backend (Python 3.12)
Creates `.venv` with Python 3.12, installs backend dependencies:
```powershell
.\run_setup_main.ps1
```

### 2. Kokoro TTS (Python 3.11, optional)
Creates `.venv-kokoro` with Python 3.11, installs PyTorch + Kokoro TTS:
```powershell
.\run_setup_kokoroTTS.ps1
```

### 3. ComfyUI Image Generation (optional)
If you already have ComfyUI installed elsewhere, skip this script and just set `COMFYUI_DIR` in `backend/.env` to your existing installation path:
```
COMFYUI_DIR=D:/path/to/your/ComfyUI
```

If not, this clones ComfyUI into a `ComfyUI/` folder and installs its requirements into the main `.venv`:
```powershell
.\run_setup_comfyui.ps1
```
After setup, place your checkpoint files (`.safetensors`) in `ComfyUI/models/checkpoints/`.

If you installed via the setup script, you can leave `COMFYUI_DIR=` blank in `.env` - the backend will automatically detect the `ComfyUI/` folder in the project root.

### 4. Pull Ollama models
```powershell
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

### 5. Configure
Copy `backend/.env.example` to `backend/.env` and edit as needed. See the Configuration section below.

## Basic Run Commands Post Setup

1. Main Service
```powershell
cd .\backend\
.\.venv\Scripts\activate
uvicorn app:app --reload
```
or
```powershell
.run_webui.ps1
```

2. Kokoro Service
```powershell
cd .\backend\
.\.venv-kokoro\Scripts\activate
uvicorn kokoro_service:app --host 127.0.0.1 --port 5005
```
or
```powershell
.run_kokoro.ps1
```

## Manual Setup (alternative)
If you prefer not to use the setup scripts:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## Configuration
You can set environment variables or create `backend/.env` for local config.

Example `backend/.env`:

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text
SEARXNG_RESULTS=5
LLM_PROVIDER=ollama
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
OPENROUTER_APP_NAME=Ollama Voice Chat
OPENROUTER_APP_URL=http://localhost:8000
OPENROUTER_FREE_ONLY=true
```

Available variables:
- `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `OLLAMA_MODEL` (default: `llama3.1:8b`)
- `OLLAMA_EMBED_MODEL` (default: `nomic-embed-text`)
- `SEARXNG_RESULTS` (default: `5`)
- `LLM_PROVIDER` (`ollama` or `openrouter`, default: `ollama`)
- `OPENROUTER_API_KEY` (required when `LLM_PROVIDER=openrouter`)
- `OPENROUTER_BASE_URL` (default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_MODEL` (default: `google/gemma-3-27b-it:free`)
- `OPENROUTER_APP_NAME` (optional header for OpenRouter)
- `OPENROUTER_APP_URL` (optional header for OpenRouter)
- `OPENROUTER_FREE_ONLY` (filter model list to free models, default: `true`)
- `KOKORO_BASE_URL` (Kokoro TTS service URL, default: `http://localhost:5005`)
- `COMFYUI_DIR` (path to ComfyUI installation, e.g. `D:/1Software/AI VC Test/ai-vc-test/ComfyUI`)
- `COMFYUI_MODELS_PATH` (optional override path to checkpoints folder; auto-detected from `COMFYUI_DIR/models/checkpoints` if blank)
- `COMFYUI_PORT` (ComfyUI listen port, default: `8188`)
- `COMFYUI_VRAM_THRESHOLD_GB` (free VRAM needed before skipping Ollama unload, default: `10`)

## Using OpenRouter
1. Set `LLM_PROVIDER=openrouter`.
2. Set `OPENROUTER_API_KEY` to your key.
3. Pick a model from the dropdown (free models are shown by default).

Note: embeddings for memory still use Ollama (`OLLAMA_EMBED_MODEL`), so Ollama needs to be available even when chat uses OpenRouter.

## Kokoro TTS (optional)
Run `.\run_setup_kokoroTTS.ps1` to set up the Kokoro venv, then start the service with `.\run_kokoro.ps1` or toggle it from the UI.
Set `KOKORO_BASE_URL` if you run the service on a different host/port.

## ComfyUI Image Generation (optional)
Run `.\run_setup_comfyui.ps1` to clone and install ComfyUI. Start/stop it from the UI or via the API (`POST /api/comfyui/start`).
The LLM can call the `generateImage` tool when a user asks to create an image. VRAM is managed automatically - Ollama models are unloaded if free VRAM is below the threshold.

## Behavior notes
- The mic stays on and only sends text when speech is finalized by the browser.
- The assistant can choose to stay silent. The UI shows a brief note when that happens.
- RAG memory persists in `backend/memory.sqlite3` across sessions.
- The model dropdown is populated from `GET /api/models`, which proxies Ollama's `/api/tags`.
- When using OpenRouter, the dropdown lists OpenRouter models (filtered to free models if enabled).
- If SearxNG is running, the server can call it for web search to enrich answers.

## Reset memory
Delete `backend/memory.sqlite3` to start fresh.
