# Ollama Voice Chat

A local-first voice chat web UI that sends transcribed speech to an Ollama LLM (or OpenRouter), lets the model stay silent if it wants, and stores long-term RAG memory in SQLite.

## Requirements
- Python 3.10+
- Ollama running locally
- A browser that supports the Web Speech API (Chrome works well)

## Basic Run Commands Post Setup

```powershelll
cd .\backend\
.\.venv\Scripts\activate
uvicorn app:app --reload
```

## Setup
1. Install dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

2. Pull models:

```powershell
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

3. Run the server:

```powershell
uvicorn app:app --reload
```

4. Open `http://localhost:8000` in your browser.

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

## Using OpenRouter
1. Set `LLM_PROVIDER=openrouter`.
2. Set `OPENROUTER_API_KEY` to your key.
3. Pick a model from the dropdown (free models are shown by default).

Note: embeddings for memory still use Ollama (`OLLAMA_EMBED_MODEL`), so Ollama needs to be available even when chat uses OpenRouter.

## Behavior notes
- The mic stays on and only sends text when speech is finalized by the browser.
- The assistant can choose to stay silent. The UI shows a brief note when that happens.
- RAG memory persists in `backend/memory.sqlite3` across sessions.
- The model dropdown is populated from `GET /api/models`, which proxies Ollama's `/api/tags`.
- When using OpenRouter, the dropdown lists OpenRouter models (filtered to free models if enabled).
- If SearxNG is running, the server can call it for web search to enrich answers.

## Reset memory
Delete `backend/memory.sqlite3` to start fresh.
