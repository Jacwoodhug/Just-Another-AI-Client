import json
import logging
import os
import re
import signal
import subprocess
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from memory_store import MemoryStore
from yaml_memory_store import YamlMemoryStore

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
DB_PATH = BASE_DIR / "memory.sqlite3"

load_dotenv(BASE_DIR / ".env")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://localhost:8080").rstrip("/")
SEARXNG_RESULTS = int(os.getenv("SEARXNG_RESULTS", "5"))
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free"
)
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "Ollama Voice Chat")
OPENROUTER_APP_URL = os.getenv("OPENROUTER_APP_URL", "http://localhost:8000")
OPENROUTER_FREE_ONLY = os.getenv("OPENROUTER_FREE_ONLY", "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
KOKORO_BASE_URL = os.getenv("KOKORO_BASE_URL", "http://localhost:5005").rstrip("/")
KOKORO_PORT = os.getenv("KOKORO_PORT", "5005")

COMFYUI_BASE_URL = os.getenv("COMFYUI_BASE_URL", "http://localhost:8188").rstrip("/")
COMFYUI_PORT = os.getenv("COMFYUI_PORT", "8188")
_comfyui_dir_env = os.getenv("COMFYUI_DIR", "").strip()
if _comfyui_dir_env:
    COMFYUI_DIR = _comfyui_dir_env
else:
    _default_comfyui = BASE_DIR.parent / "ComfyUI"
    COMFYUI_DIR = str(_default_comfyui) if _default_comfyui.is_dir() else ""
COMFYUI_MODELS_PATH = os.getenv("COMFYUI_MODELS_PATH", "").strip()
COMFYUI_VRAM_THRESHOLD_GB = float(os.getenv("COMFYUI_VRAM_THRESHOLD_GB", "10"))
COMFYUI_OUTPUT_DIR = BASE_DIR / "generated_images"

CHAT_MAX_HISTORY = int(os.getenv("CHAT_MAX_HISTORY", "20"))
CONTEXT_MAX_TOKENS = int(os.getenv("CONTEXT_MAX_TOKENS", "4096"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
COMFYUI_SETTINGS_FILE = BASE_DIR / "comfyui_settings.json"

# Load active checkpoint from persisted settings (fallback to default)
def _load_active_checkpoint() -> str:
    if COMFYUI_SETTINGS_FILE.exists():
        try:
            data = json.loads(COMFYUI_SETTINGS_FILE.read_text(encoding="utf-8"))
            ckpt = data.get("_active_checkpoint", "").strip()
            if ckpt:
                return ckpt
        except Exception:
            pass
    return "sd_xl_base_1.0.safetensors"

COMFYUI_CHECKPOINT: str = _load_active_checkpoint()

# ---------------------------------------------------------------------------
# Kokoro subprocess management
# ---------------------------------------------------------------------------
_DETACH_FLAGS = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

_kokoro_process: Optional[subprocess.Popen] = None


def _kokoro_venv_python() -> Optional[str]:
    """Return the path to the Kokoro venv Python executable, or None."""
    if sys.platform == "win32":
        candidate = BASE_DIR / ".venv-kokoro" / "Scripts" / "python.exe"
    else:
        candidate = BASE_DIR / ".venv-kokoro" / "bin" / "python"
    return str(candidate) if candidate.exists() else None


def _kokoro_health_check() -> bool:
    """Return True if the Kokoro service responds to a health check."""
    try:
        r = requests.get(f"{KOKORO_BASE_URL}/health", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def _is_kokoro_running() -> bool:
    """Check whether the Kokoro service is reachable."""
    global _kokoro_process
    if _kokoro_process is not None and _kokoro_process.poll() is not None:
        _kokoro_process = None
    return _kokoro_health_check()


def _stop_kokoro() -> None:
    """Terminate the managed Kokoro subprocess if running."""
    global _kokoro_process
    if _kokoro_process is not None:
        try:
            _kokoro_process.terminate()
            try:
                _kokoro_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _kokoro_process.kill()
                _kokoro_process.wait(timeout=3)
        except Exception:
            pass
        _kokoro_process = None


# ---------------------------------------------------------------------------
# ComfyUI subprocess management
# ---------------------------------------------------------------------------
_comfyui_process: Optional[subprocess.Popen] = None


def _main_venv_python() -> Optional[str]:
    """Return the path to the main .venv Python executable, or None."""
    if sys.platform == "win32":
        candidate = BASE_DIR / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = BASE_DIR / ".venv" / "bin" / "python"
    return str(candidate) if candidate.exists() else None


def _comfyui_health_check() -> bool:
    """Return True if ComfyUI responds to a health check."""
    try:
        r = requests.get(f"{COMFYUI_BASE_URL}/system_stats", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def _is_comfyui_running() -> bool:
    """Check whether the ComfyUI service is reachable."""
    global _comfyui_process
    if _comfyui_process is not None and _comfyui_process.poll() is not None:
        _comfyui_process = None
    return _comfyui_health_check()


def _stop_comfyui() -> None:
    """Terminate the managed ComfyUI subprocess if running."""
    global _comfyui_process
    if _comfyui_process is not None:
        try:
            _comfyui_process.terminate()
            try:
                _comfyui_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _comfyui_process.kill()
                _comfyui_process.wait(timeout=3)
        except Exception:
            pass
        _comfyui_process = None


_SYSTEM_PROMPT_PRE_TONE = (
    "You are a voice chat assistant in a web GUI. "
    "You can choose to respond or stay silent.\n"
    "\n"
    "RESPONSE FORMAT:\n"
    "Structure your response with these section markers on their own line:\n"
    "[SPOKEN]\n"
    "The spoken response text here.\n"
    "[SILENT]\n"
    "The silent/thinking text here (shown in Thinking panel, never spoken).\n"
    "Always put each marker on its own line before the content for that section.\n"
    "\n"
    "TOOLS:\n"
    "You have access to tools. Use them when appropriate:\n"
    "- webSearch: search the web when you need current information, facts, or anything you're unsure about.\n"
    "- requestScreenshot: request a screenshot when you need to see what's on the user's screen.\n"
    "- generateImage: generate an image using AI. Use when the user asks to create, draw, or generate a picture. After it runs, always reply in [SPOKEN] confirming the image is ready.\n"
    "- memoryStore: store a durable fact about the user (preferences, habits, long-term info). Not for transient moods.\n"
    "  When the user says 'remember this', 'remember that', 'don't forget', 'keep in mind', or similar, ALWAYS use memoryStore to save the relevant fact.\n"
    "  Also use memoryStore proactively when the user reveals a preference, habit, or important personal detail worth retaining.\n"
    "- memoryEdit: update an existing memory entry by id.\n"
    "- memoryDelete: remove a memory entry by id.\n"
    "If web search results are provided via tool response, use them to answer. Do not cite URLs unless explicitly asked.\n"
    "\n"
    "BEHAVIORAL GUIDELINES:\n"
    "You are an ambient, voice-first companion with visual awareness of the user's screen and access to memory. Your primary interaction channel is spoken conversation. Screenshots provide passive context, not obligations to respond.\n"
    "\n"
    "Core interaction rule (very important):\n"
    "- When the user speaks, you should almost always respond.\n"
    "- Silence after user speech should be rare and intentional (e.g., explicit request for quiet, rhetorical statements).\n"
    "- When no user speech is present, you may choose whether or not to respond to screenshots.\n"
    "- Voice implies engagement. Screenshots imply awareness only.\n"
    "\n"
    "Voice interactions:\n"
    "When the user speaks:\n"
    "- Assume they want engagement, acknowledgement, or response.\n"
    "- Populate [SPOKEN] in most cases.\n"
    "- It is acceptable to respond even if the user did not ask a direct question.\n"
    "- You may answer, reflect, react socially, ask a follow-up, or comment briefly.\n"
    "- If speech is ambiguous, respond lightly rather than staying silent. Acknowledge or mirror rather than analyze.\n"
    "\n"
    "Screenshots:\n"
    "- Screenshots arrive automatically and frequently. Most are normal activity (YouTube, browsing, idle).\n"
    "- Screenshots do not require a response.\n"
    "- Use them to: provide background context, notice interests, inform tone/timing, occasionally spark curiosity.\n"
    "- Do not feel obligated to speak just because a screenshot arrived.\n"
    "\n"
    "Deciding whether to respond to screenshots:\n"
    "Populate [SPOKEN] only when at least one feels true:\n"
    "- User appears idle or passively consuming content for a while.\n"
    "- Something novel/interesting appears compared to recent context.\n"
    "- A natural, human comment comes to mind (not forced).\n"
    "- A gentle question would feel welcome and easy to ignore.\n"
    "- You haven't spoken recently and a brief interaction would feel companionable.\n"
    "- Otherwise, remain silent.\n"
    "\n"
    "Asking questions:\n"
    "- You are allowed and encouraged to ask questions, especially following user speech.\n"
    "- Ask one question at a time. Keep it low-pressure and conversational.\n"
    "- Curiosity, not interrogation. Easy to ignore.\n"
    "\n"
)

DEFAULT_TONE_CONTEXT = (
    "Tone & personality:\n"
    "- Conversational, relaxed, human. Mild humor/opinions welcome.\n"
    "- Avoid “assistant voice.” Avoid narrating the screen.\n"
    "- Spoken responses should usually be 1-2 sentences, sometimes 3."
)

_SYSTEM_PROMPT_POST_TONE = (
    "\n"
    "\n"
    "Silence rules:\n"
    "Leave [SPOKEN] empty primarily when:\n"
    "- no user speech occurred\n"
    "- you already spoke recently and nothing meaningfully changed\n"
    "- the user appears focused or actively typing\n"
    "- you would be guessing details you can't see clearly\n"
    "- Silence should feel intentional and comfortable, not hesitant.\n"
    "\n"
    "Internal thoughts (use [SILENT]):\n"
    "- Private observations, tentative interpretations, contextual notes.\n"
    "- Do not leak reasoning into [SPOKEN].\n"
    "\n"
    "Self-regulation:\n"
    "- If you spoke very recently, raise the bar before speaking again unless the user speaks.\n"
    "- User speech always lowers the bar to respond."
)


def build_system_prompt(tone_context=None):
    tone = (tone_context or "").strip() or DEFAULT_TONE_CONTEXT
    return _SYSTEM_PROMPT_PRE_TONE + tone + _SYSTEM_PROMPT_POST_TONE


# ── Tool definitions (Ollama / OpenAI function-calling format) ────────────

TOOL_DEFINITIONS_BASE = [
    {
        "type": "function",
        "function": {
            "name": "webSearch",
            "description": "Search the web for current information. Use when you need facts, news, or anything you are unsure about.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "requestScreenshot",
            "description": "Request a screenshot of the user's screen. Use when you need to see what the user is looking at.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memoryStore",
            "description": "Store a durable fact about the user (preferences, habits, long-term info). Not for transient moods.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The fact to remember.",
                    },
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memoryEdit",
            "description": "Edit an existing memory entry by its id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "The memory entry id.",
                    },
                    "content": {
                        "type": "string",
                        "description": "The updated content.",
                    },
                },
                "required": ["id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memoryDelete",
            "description": "Delete a memory entry by its id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "The memory entry id to delete.",
                    },
                },
                "required": ["id"],
            },
        },
    },
]


def _build_tool_definitions(checkpoint: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return tool definitions including a dynamic generateImage tool."""
    tools = list(TOOL_DEFINITIONS_BASE)
    cp = checkpoint or COMFYUI_CHECKPOINT
    settings = _get_model_settings(cp)
    res_enum = _derive_resolution_enum(settings.get("resolutions", ["1024x1024"]))
    tools.append({
        "type": "function",
        "function": {
            "name": "generateImage",
            "description": "Generate an image using AI. Use when the user asks to create, draw, or generate a picture or image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Detailed positive image description.",
                    },
                    "negative_prompt": {
                        "type": "string",
                        "description": "What to exclude from the image.",
                    },
                    "resolution": {
                        "type": "string",
                        "enum": res_enum,
                        "description": f"Output resolution as WxH. Options: {', '.join(res_enum)}.",
                    },
                },
                "required": ["prompt"],
            },
        },
    })
    return tools


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    text: Optional[str] = None
    model: Optional[str] = None
    image_base64: Optional[str] = None
    provider: Optional[str] = None
    hidden: Optional[bool] = False
    screenshot_followup: Optional[bool] = False
    search_method: Optional[str] = "searxng"
    personality_id: Optional[str] = "default"
    tone_context: Optional[str] = None
    max_history: Optional[int] = None
    max_context_tokens: Optional[int] = None
    max_rag_results: Optional[int] = None


class ChatResponse(BaseModel):
    session_id: str
    assistant_text: str
    silent_text: str
    speak: bool
    tool_calls_made: List[Dict[str, Any]] = Field(default_factory=list)
    provider: str = ""
    request_screenshot: bool = False
    request_reason: str = ""
    context_debug: str = ""


class ModelListResponse(BaseModel):
    models: List[str]
    default_model: str
    provider: str


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = None


class TTSVoicesResponse(BaseModel):
    voices: List[str] = Field(default_factory=list)
    default_voice: str = ""


app = FastAPI(title="Ollama Voice Chat")



store = MemoryStore(str(DB_PATH))
_personality_stores: Dict[str, MemoryStore] = {}

yaml_store = YamlMemoryStore(BASE_DIR / "memories.yaml")
_personality_yaml_stores: Dict[str, YamlMemoryStore] = {}


def _get_store(personality_id: Optional[str]) -> MemoryStore:
    if not personality_id or personality_id == "default":
        return store
    if personality_id not in _personality_stores:
        db_path = BASE_DIR / f"memory_{personality_id}.sqlite3"
        _personality_stores[personality_id] = MemoryStore(str(db_path))
    return _personality_stores[personality_id]


def _get_yaml_store(personality_id: Optional[str]) -> YamlMemoryStore:
    if not personality_id or personality_id == "default":
        return yaml_store
    if personality_id not in _personality_yaml_stores:
        yaml_path = BASE_DIR / f"memories_{personality_id}.yaml"
        _personality_yaml_stores[personality_id] = YamlMemoryStore(yaml_path)
    return _personality_yaml_stores[personality_id]


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# Suppress /api/vram from uvicorn access log (high-frequency polling)
class _NoVramFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/vram" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_NoVramFilter())

# Serve generated images statically
COMFYUI_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/generated_images", StaticFiles(directory=str(COMFYUI_OUTPUT_DIR)), name="generated_images")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


def _extract_embedding(data: Dict[str, Any]) -> List[float]:
    embedding = data.get("embedding")
    if isinstance(embedding, list):
        return embedding

    embeddings = data.get("embeddings")
    if isinstance(embeddings, list):
        if embeddings and isinstance(embeddings[0], list):
            return embeddings[0]
        if embeddings and isinstance(embeddings[0], (int, float)):
            return embeddings

    data_items = data.get("data")
    if isinstance(data_items, list) and data_items:
        candidate = data_items[0].get("embedding")
        if isinstance(candidate, list):
            return candidate

    return []


def _ollama_embeddings(text: str) -> List[float]:
    endpoints = [
        ("/api/embeddings", {"model": OLLAMA_EMBED_MODEL, "prompt": text}),
        ("/api/embed", {"model": OLLAMA_EMBED_MODEL, "input": text}),
        ("/v1/embeddings", {"model": OLLAMA_EMBED_MODEL, "input": text}),
    ]
    last_error: Optional[requests.RequestException] = None

    for path, payload in endpoints:
        url = f"{OLLAMA_BASE_URL}{path}"
        try:
            response = requests.post(url, json=payload, timeout=60)
            if response.status_code == 404:
                continue
            response.raise_for_status()
            data = response.json()
            embedding = _extract_embedding(data)
            if embedding:
                return embedding
        except requests.RequestException as exc:
            last_error = exc

    if last_error:
        raise last_error
    return []


def _ollama_chat(messages: List[Dict[str, str]], model: str) -> str:
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    response = requests.post(url, json=payload, timeout=120)
    response.raise_for_status()
    data = response.json()
    return data.get("message", {}).get("content", "")


def _openrouter_headers() -> Dict[str, str]:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    if OPENROUTER_APP_URL:
        headers["HTTP-Referer"] = OPENROUTER_APP_URL
    if OPENROUTER_APP_NAME:
        headers["X-Title"] = OPENROUTER_APP_NAME
    return headers


def _openrouter_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    converted = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content", "")
        images = message.get("images") or []
        if images:
            parts: List[Dict[str, Any]] = []
            if content:
                parts.append({"type": "text", "text": content})
            for image in images:
                if not image:
                    continue
                parts.append(
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image}"
                        },
                    }
                )
            converted.append({"role": role, "content": parts})
        else:
            converted.append({"role": role, "content": content})
    return converted


def _openrouter_chat(messages: List[Dict[str, Any]], model: str) -> str:
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": _openrouter_messages(messages),
    }
    response = requests.post(
        url,
        headers=_openrouter_headers(),
        json=payload,
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    return choices[0].get("message", {}).get("content", "") or ""


def _openrouter_is_free(item: Dict[str, Any]) -> bool:
    model_id = str(item.get("id", "")).strip()
    if model_id.endswith(":free"):
        return True
    pricing = item.get("pricing")
    if not isinstance(pricing, dict):
        return False
    has_value = False
    for key in ("prompt", "completion", "request", "image", "audio"):
        if key not in pricing:
            continue
        has_value = True
        value = pricing.get(key)
        if value is None:
            continue
        try:
            if float(value) > 0:
                return False
        except (TypeError, ValueError):
            if str(value).strip().lower() not in (
                "0",
                "0.0",
                "0.00",
                "0.000000",
                "free",
            ):
                return False
    return has_value


def _openrouter_list_models() -> List[str]:
    url = f"{OPENROUTER_BASE_URL}/models"
    response = requests.get(url, headers=_openrouter_headers(), timeout=60)
    response.raise_for_status()
    data = response.json()
    items = data.get("data") or data.get("models") or []
    models = []
    for item in items:
        model_id = item.get("id") or item.get("name")
        if not model_id:
            continue
        if OPENROUTER_FREE_ONLY and not _openrouter_is_free(item):
            continue
        models.append(model_id)
    return models


def _openrouter_chat_stream(
    messages: List[Dict[str, Any]], model: str
) -> Iterable[str]:
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": _openrouter_messages(messages),
        "stream": True,
    }
    with requests.post(
        url,
        headers=_openrouter_headers(),
        json=payload,
        stream=True,
        timeout=120,
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            if not line.startswith("data:"):
                continue
            data = line[len("data:") :].strip()
            if data == "[DONE]":
                break
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = payload.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta", {})
            content = delta.get("content")
            if content:
                yield content


def _llm_provider() -> str:
    if LLM_PROVIDER in ("openrouter", "ollama"):
        return LLM_PROVIDER
    return "ollama"


def _normalize_provider(provider: Optional[str]) -> str:
    candidate = (provider or "").strip().lower()
    if candidate in ("openrouter", "ollama"):
        return candidate
    return _llm_provider()


def _default_model(provider: Optional[str] = None) -> str:
    if _normalize_provider(provider) == "openrouter":
        return OPENROUTER_MODEL
    return OLLAMA_MODEL


def _llm_chat(
    messages: List[Dict[str, Any]],
    model: str,
    provider: Optional[str] = None,
) -> str:
    if _normalize_provider(provider) == "openrouter":
        return _openrouter_chat(messages, model)
    return _ollama_chat(messages, model)


def _llm_chat_stream(
    messages: List[Dict[str, Any]],
    model: str,
    provider: Optional[str] = None,
) -> Iterable[str]:
    if _normalize_provider(provider) == "openrouter":
        return _openrouter_chat_stream(messages, model)
    return _ollama_chat_stream(messages, model)


def _searxng_search(query: str, top_k: int) -> List[Dict[str, str]]:
    if not query:
        return []
    url = f"{SEARXNG_BASE_URL}/search"
    params = {
        "q": query,
        "format": "json",
        "language": "en",
        "safesearch": 1,
    }
    try:
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
    except requests.RequestException:
        return []
    data = response.json()
    results = []
    for item in data.get("results", [])[:top_k]:
        title = str(item.get("title", "")).strip()
        link = str(item.get("url", "")).strip()
        snippet = str(item.get("content", "")).strip()
        if not title and not link and not snippet:
            continue
        results.append({"title": title, "url": link, "snippet": snippet})
    return results


def _brave_search(query: str, top_k: int) -> List[Dict[str, str]]:
    if not query or not BRAVE_API_KEY:
        return []
    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
    }
    params = {"q": query, "count": min(top_k, 20)}
    try:
        response = requests.get(url, headers=headers, params=params, timeout=20)
        response.raise_for_status()
    except requests.RequestException:
        return []
    data = response.json()
    results = []
    for item in data.get("web", {}).get("results", [])[:top_k]:
        title = str(item.get("title", "")).strip()
        link = str(item.get("url", "")).strip()
        snippet = str(item.get("description", "")).strip()
        if not title and not link and not snippet:
            continue
        results.append({"title": title, "url": link, "snippet": snippet})
    return results


def _run_search(query: str, method: str, top_k: int) -> List[Dict[str, str]]:
    if not query or method == "none":
        return []
    if method == "brave":
        return _brave_search(query, top_k)
    return _searxng_search(query, top_k)


def _format_search_results(query: str, results: List[Dict[str, str]]) -> str:
    if not results:
        return ""
    lines = [f"Web search results for: {query}"]
    for idx, item in enumerate(results, start=1):
        title = item.get("title") or "Untitled"
        url = item.get("url") or ""
        snippet = item.get("snippet") or ""
        lines.append(f"{idx}. {title}")
        if url:
            lines.append(f"   URL: {url}")
        if snippet:
            lines.append(f"   Snippet: {snippet}")
    return "\n".join(lines)


def _current_time_context() -> str:
    now = datetime.now().astimezone()
    iso = now.isoformat(timespec="seconds")
    return f"Current date/time: {iso}"


def _format_recent_messages(
    recent: List[Dict[str, Any]],
) -> List[Dict[str, str]]:
    formatted: List[Dict[str, str]] = []
    for item in recent:
        role = item.get("role") or "user"
        content = item.get("content") or ""
        formatted.append({"role": role, "content": content})
    return formatted


def _build_context_debug(messages: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for message in messages:
        role = (message.get("role") or "user").upper()
        content = message.get("content") or ""
        images = message.get("images") or []
        if images:
            if content:
                content = f"{content}\n[image attached]"
            else:
                content = "[image attached]"
        entry = f"{role}:\n{content}".strip()
        lines.append(entry)
    return "\n\n".join(lines).strip()


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return max(1, len(text) // 4)


def _trim_recent_to_token_budget(
    recent: List[Dict[str, Any]],
    fixed_context: str,
    max_tokens: int,
) -> List[Dict[str, Any]]:
    """
    Drop oldest messages from `recent` until the estimated total token count
    (fixed_context + all recent messages) fits within max_tokens.
    Always keeps at least the most recent 2 messages if any exist.
    """
    used = _estimate_tokens(fixed_context)
    if used >= max_tokens:
        return recent[-2:] if len(recent) >= 2 else list(recent)

    kept: List[Dict[str, Any]] = []
    budget = max_tokens - used
    # Walk from newest to oldest
    for item in reversed(recent):
        cost = _estimate_tokens(item.get("content") or "")
        if budget - cost < 0 and len(kept) >= 2:
            break
        kept.insert(0, item)
        budget -= cost

    return kept


def _time_since_last_message_context(recent: List[Dict[str, Any]]) -> str:
    if not recent:
        return ""
    import time as _time
    last = recent[-1]
    created_at = last.get("created_at")
    if not created_at:
        return ""
    delta_seconds = _time.time() - created_at
    if delta_seconds < 60:
        return f"Time since last message: {int(delta_seconds)} seconds"
    minutes = int(delta_seconds / 60)
    if minutes < 60:
        return f"Time since last message: {minutes} minute{'s' if minutes != 1 else ''}"
    hours = minutes // 60
    remaining = minutes % 60
    return f"Time since last message: {hours}h {remaining}m"


# ── Tool execution ────────────────────────────────────────────────────────

def _execute_tool(
    name: str,
    args: Dict[str, Any],
    active_yaml_store: YamlMemoryStore,
    search_method: str,
) -> Tuple[str, bool]:
    """Execute a tool call. Returns (result_string, is_screenshot_request)."""
    if name == "webSearch":
        query = str(args.get("query", "")).strip()
        if not query:
            return "Error: missing query parameter.", False
        results = _run_search(query, search_method, SEARXNG_RESULTS)
        formatted = _format_search_results(query, results)
        return formatted or f"No results found for: {query}", False

    if name == "requestScreenshot":
        return "__SCREENSHOT_REQUESTED__", True

    if name == "memoryStore":
        content = str(args.get("content", "")).strip()
        if not content:
            return "Error: missing content parameter.", False
        entry_id = active_yaml_store.store(content)
        return f"Stored memory (id: {entry_id}): {content}", False

    if name == "memoryEdit":
        entry_id = str(args.get("id", "")).strip()
        content = str(args.get("content", "")).strip()
        if not entry_id or not content:
            return "Error: missing id or content parameter.", False
        if active_yaml_store.edit(entry_id, content):
            return f"Updated memory {entry_id}.", False
        return f"Memory {entry_id} not found.", False

    if name == "memoryDelete":
        entry_id = str(args.get("id", "")).strip()
        if not entry_id:
            return "Error: missing id parameter.", False
        if active_yaml_store.delete(entry_id):
            return f"Deleted memory {entry_id}.", False
        return f"Memory {entry_id} not found.", False

    if name == "generateImage":
        if not _is_comfyui_running():
            return "Error: ComfyUI is not running.", False
        prompt = str(args.get("prompt", "")).strip()
        if not prompt:
            return "Error: missing prompt parameter.", False
        negative_prompt = str(args.get("negative_prompt", ""))
        resolution = str(args.get("resolution", "1024x1024"))
        try:
            w, h = map(int, resolution.split("x"))
        except ValueError:
            w, h = 1024, 1024

        settings = _get_model_settings(COMFYUI_CHECKPOINT)
        COMFYUI_OUTPUT_DIR.mkdir(exist_ok=True)
        try:
            from comfyui_service import generate as _comfyui_generate
            file_path = _comfyui_generate(
                prompt=prompt, negative_prompt=negative_prompt,
                checkpoint=COMFYUI_CHECKPOINT, width=w, height=h,
                steps=settings["steps"], cfg=settings["cfg"],
                sampler=settings["sampler"], scheduler=settings["scheduler"],
                output_dir=COMFYUI_OUTPUT_DIR, base_url=COMFYUI_BASE_URL,
                workflow_json=settings.get("workflow_json"),
            )
            return f"__IMAGE_GENERATED__:{file_path}", False
        except Exception as exc:
            return f"Image generation failed: {exc}", False

    return f"Unknown tool: {name}", False


def _extract_tool_calls_ollama(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract tool calls from an Ollama chat response."""
    message = data.get("message", {})
    return message.get("tool_calls") or []


def _extract_tool_calls_openrouter(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract tool calls from an OpenRouter/OpenAI chat response."""
    choices = data.get("choices") or []
    if not choices:
        return []
    message = choices[0].get("message", {})
    return message.get("tool_calls") or []


def _ollama_chat_with_tools(
    messages: List[Dict[str, Any]], model: str, tools: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Ollama chat with tool support — returns the full response dict."""
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {"model": model, "messages": messages, "stream": False, "tools": tools}
    response = requests.post(url, json=payload, timeout=120)
    response.raise_for_status()
    return response.json()


def _openrouter_chat_with_tools(
    messages: List[Dict[str, Any]], model: str, tools: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """OpenRouter chat with tool support — returns the full response dict."""
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": _openrouter_messages(messages),
        "tools": tools,
    }
    response = requests.post(
        url, headers=_openrouter_headers(), json=payload, timeout=120
    )
    response.raise_for_status()
    return response.json()


def _llm_chat_with_tools(
    messages: List[Dict[str, Any]],
    model: str,
    tools: List[Dict[str, Any]],
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    if _normalize_provider(provider) == "openrouter":
        return _openrouter_chat_with_tools(messages, model, tools)
    return _ollama_chat_with_tools(messages, model, tools)


def _get_content_from_response(data: Dict[str, Any], provider: Optional[str] = None) -> str:
    if _normalize_provider(provider) == "openrouter":
        choices = data.get("choices") or []
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""
    return data.get("message", {}).get("content", "") or ""


def _get_tool_calls_from_response(
    data: Dict[str, Any], provider: Optional[str] = None
) -> List[Dict[str, Any]]:
    if _normalize_provider(provider) == "openrouter":
        return _extract_tool_calls_openrouter(data)
    return _extract_tool_calls_ollama(data)


def _normalize_tool_call(tc: Dict[str, Any], provider: Optional[str] = None) -> Tuple[str, Dict[str, Any], str]:
    """Normalize a tool call from either provider into (name, args, call_id)."""
    if _normalize_provider(provider) == "openrouter":
        func = tc.get("function", {})
        name = func.get("name", "")
        args_raw = func.get("arguments", "{}")
        if isinstance(args_raw, str):
            try:
                args = json.loads(args_raw)
            except json.JSONDecodeError:
                args = {}
        else:
            args = args_raw if isinstance(args_raw, dict) else {}
        call_id = tc.get("id", "")
        return name, args, call_id
    else:
        func = tc.get("function", {})
        name = func.get("name", "")
        args = func.get("arguments", {})
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        return name, args, ""


def _append_tool_result_messages(
    messages: List[Dict[str, Any]],
    assistant_response: Dict[str, Any],
    tool_calls: List[Dict[str, Any]],
    results: List[Tuple[str, str, str]],
    provider: Optional[str] = None,
) -> None:
    """Append the assistant message with tool_calls and the tool result messages."""
    if _normalize_provider(provider) == "openrouter":
        msg = (assistant_response.get("choices") or [{}])[0].get("message", {})
        messages.append(msg)
        for call_id, name, result_text in results:
            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "name": name,
                "content": result_text,
            })
    else:
        msg = assistant_response.get("message", {})
        messages.append(msg)
        for _call_id, name, result_text in results:
            messages.append({
                "role": "tool",
                "content": result_text,
            })


def _run_tool_loop(
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    model: str,
    provider: Optional[str],
    active_yaml_store: YamlMemoryStore,
    search_method: str,
    max_iterations: int = 6,
) -> Tuple[str, List[Dict[str, Any]], bool, str]:
    """
    Agentic tool loop.
    Returns (final_content, tool_calls_made, screenshot_requested, screenshot_reason).
    """
    tool_calls_made: List[Dict[str, Any]] = []
    screenshot_requested = False
    screenshot_reason = ""

    for _ in range(max_iterations):
        data = _llm_chat_with_tools(messages, model, tools, provider)
        raw_tool_calls = _get_tool_calls_from_response(data, provider)

        if not raw_tool_calls:
            content = _get_content_from_response(data, provider)
            return content, tool_calls_made, screenshot_requested, screenshot_reason

        results: List[Tuple[str, str, str]] = []
        image_path_for_injection: Optional[str] = None
        for tc in raw_tool_calls:
            name, args, call_id = _normalize_tool_call(tc, provider)
            result_text, is_screenshot = _execute_tool(
                name, args, active_yaml_store, search_method
            )

            if result_text.startswith("__IMAGE_GENERATED__:"):
                image_path_for_injection = result_text[len("__IMAGE_GENERATED__:"):]
                result_text = f"Image generated: {image_path_for_injection}"

            tool_calls_made.append({
                "name": name,
                "args": args,
                "result_summary": result_text[:200] if len(result_text) > 200 else result_text,
            })

            if is_screenshot:
                screenshot_requested = True
                screenshot_reason = str(args.get("reason", "Model requested a screenshot"))
                result_text = "Screenshot has been requested from the user. It will be provided in a follow-up message."

            results.append((call_id, name, result_text))

        _append_tool_result_messages(messages, data, raw_tool_calls, results, provider)

        if image_path_for_injection and _ollama_model_is_multimodal(model):
            import base64 as _b64
            img_bytes = Path(image_path_for_injection).read_bytes()
            b64 = _b64.b64encode(img_bytes).decode()
            messages.append({
                "role": "user",
                "content": "Here is the generated image:",
                "images": [b64],
            })

        if screenshot_requested:
            return "", tool_calls_made, True, screenshot_reason

    content = _get_content_from_response(data, provider)
    return content, tool_calls_made, screenshot_requested, screenshot_reason


# ---------------------------------------------------------------------------
# VRAM and model helpers
# ---------------------------------------------------------------------------

def _get_free_vram_gb() -> Optional[float]:
    """Return free GPU VRAM in GB via nvidia-smi, or None if unavailable."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None
        line = result.stdout.strip().split("\n")[0]
        return float(line) / 1024.0
    except Exception:
        return None


def _comfyui_free_memory() -> None:
    """Ask ComfyUI to unload models and free memory."""
    try:
        requests.post(
            f"{COMFYUI_BASE_URL}/free",
            json={"unload_models": True, "free_memory": True},
            timeout=10,
        )
    except Exception:
        pass


def _ollama_warm_model(model: str) -> None:
    """Pre-load an Ollama model into VRAM without generating output."""
    try:
        requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": model, "prompt": "", "keep_alive": "10m"},
            timeout=60,
        )
    except Exception:
        pass


def _ollama_model_is_multimodal(model: str) -> bool:
    """Return True if the Ollama model has 'clip' in its families (i.e. is multimodal)."""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/show",
            json={"model": model},
            timeout=10,
        )
        resp.raise_for_status()
        details = resp.json().get("details", {})
        families = details.get("families") or []
        return "clip" in families
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Per-model ComfyUI settings
# ---------------------------------------------------------------------------

_COMFYUI_DEFAULT_SETTINGS = {
    "steps": 20,
    "cfg": 7.0,
    "sampler": "euler",
    "scheduler": "normal",
    "resolutions": ["1024x1024"],
    "workflow_json": None,
}


def _get_model_files() -> List[str]:
    """Return sorted list of checkpoint filenames from all known model dirs."""
    if COMFYUI_MODELS_PATH:
        # Explicit override: scan only that directory
        dirs = [Path(COMFYUI_MODELS_PATH)]
    elif COMFYUI_DIR:
        # Scan both the classic and Flux-era locations
        base = Path(COMFYUI_DIR) / "models"
        dirs = [base / "checkpoints", base / "diffusion_models"]
    else:
        return []

    extensions = {".safetensors", ".ckpt", ".pt"}
    seen: set = set()
    results = []
    for d in dirs:
        if d.is_dir():
            for p in d.iterdir():
                if p.suffix.lower() in extensions and p.name not in seen:
                    seen.add(p.name)
                    results.append(p.name)
    return sorted(results)


def _load_comfyui_settings() -> Dict[str, Any]:
    """Read the ComfyUI per-model settings file (or return empty dict)."""
    if COMFYUI_SETTINGS_FILE.exists():
        return json.loads(COMFYUI_SETTINGS_FILE.read_text(encoding="utf-8"))
    return {}


def _save_comfyui_settings(data: Dict[str, Any]) -> None:
    """Write the ComfyUI per-model settings file."""
    COMFYUI_SETTINGS_FILE.write_text(
        json.dumps(data, indent=2), encoding="utf-8"
    )


def _get_model_settings(checkpoint: str) -> Dict[str, Any]:
    """Return merged defaults + stored settings for *checkpoint*."""
    all_settings = _load_comfyui_settings()
    stored = all_settings.get(checkpoint, {})
    merged = dict(_COMFYUI_DEFAULT_SETTINGS)
    merged.update(stored)
    return merged


def _derive_resolution_enum(resolutions: List[str]) -> List[str]:
    """Expand resolutions so non-square entries get both orientations."""
    result: List[str] = []
    for res in resolutions:
        if res not in result:
            result.append(res)
        try:
            w, h = res.split("x")
            if w != h:
                flipped = f"{h}x{w}"
                if flipped not in result:
                    result.append(flipped)
        except ValueError:
            pass
    return result


def _ollama_running_models() -> List[str]:
    url = f"{OLLAMA_BASE_URL}/api/ps"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except requests.RequestException:
        return []
    data = response.json()
    models = [
        item.get("name")
        for item in data.get("models", [])
        if item.get("name")
    ]
    return models


def _ollama_stop_model(name: str) -> None:
    """Unload a model from VRAM via keep_alive=0 (Ollama's documented unload mechanism)."""
    try:
        requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": name, "keep_alive": 0},
            timeout=30,
        )
    except requests.RequestException:
        return


@app.on_event("shutdown")
def shutdown_cleanup() -> None:
    _stop_kokoro()
    _stop_comfyui()
    for model_name in _ollama_running_models():
        _ollama_stop_model(model_name)


def _ollama_chat_stream(messages: List[Dict[str, str]], model: str) -> Iterable[str]:
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {"model": model, "messages": messages, "stream": True}
    with requests.post(url, json=payload, stream=True, timeout=120) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if data.get("done"):
                break
            content = data.get("message", {}).get("content")
            if content:
                yield content


class _SectionStreamState:
    """Route streaming tokens into spoken/silent channels based on [SPOKEN]/[SILENT] markers."""

    _MARKERS = {"[SPOKEN]": "spoken", "[SILENT]": "silent"}

    def __init__(self) -> None:
        self._channel: Optional[str] = None
        self._buf: str = ""

    def feed(self, token: str) -> Tuple[str, str]:
        """Feed a token; returns (spoken_out, silent_out) ready to emit."""
        self._buf += token
        spoken: List[str] = []
        silent: List[str] = []

        while self._buf:
            best: Optional[Tuple[int, str, str]] = None
            for marker, ch in self._MARKERS.items():
                pos = self._buf.find(marker)
                if pos >= 0 and (best is None or pos < best[0]):
                    best = (pos, marker, ch)

            if best is not None:
                pos, marker, new_ch = best
                pre = self._buf[:pos]
                if pre:
                    out_ch = self._channel or "spoken"
                    (spoken if out_ch == "spoken" else silent).append(pre)
                self._channel = new_ch
                self._buf = self._buf[pos + len(marker):]
                if self._buf.startswith("\n"):
                    self._buf = self._buf[1:]
                continue

            # No complete marker — hold back any partial marker suffix.
            hold = 0
            for marker in self._MARKERS:
                for length in range(1, len(marker)):
                    if self._buf.endswith(marker[:length]):
                        hold = max(hold, length)
            safe_end = len(self._buf) - hold
            if safe_end > 0:
                emit = self._buf[:safe_end]
                out_ch = self._channel or "spoken"
                (spoken if out_ch == "spoken" else silent).append(emit)
                self._buf = self._buf[safe_end:]
            break

        return "".join(spoken), "".join(silent)

    def flush(self) -> Tuple[str, str]:
        """Flush remaining buffer at end of stream."""
        remaining, self._buf = self._buf, ""
        if not remaining:
            return "", ""
        ch = self._channel or "spoken"
        return (remaining, "") if ch == "spoken" else ("", remaining)


def _ollama_stream_first_call(
    messages: List[Dict[str, Any]], model: str, tools: List[Dict[str, Any]]
) -> Iterable[Tuple[str, Any]]:
    """Stream Ollama first call. Yields ("token", text) per chunk then ("final", data_dict)."""
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {"model": model, "messages": messages, "stream": True, "tools": tools}
    with requests.post(url, json=payload, stream=True, timeout=120) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if data.get("done"):
                yield ("final", data)
                return
            content = data.get("message", {}).get("content") or ""
            if content:
                yield ("token", content)


def _openrouter_stream_first_call(
    messages: List[Dict[str, Any]], model: str, tools: List[Dict[str, Any]]
) -> Iterable[Tuple[str, Any]]:
    """Stream OpenRouter first call. Yields ("token", text) per chunk then ("final", data_dict)."""
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    payload = {
        "model": model,
        "messages": _openrouter_messages(messages),
        "stream": True,
        "tools": tools if tools else None,
    }
    accumulated_tool_calls: Dict[int, Dict[str, Any]] = {}
    full_content = ""
    with requests.post(
        url, headers=_openrouter_headers(), json=payload, stream=True, timeout=120
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta", {})
            content = delta.get("content") or ""
            if content:
                full_content += content
                yield ("token", content)
            for tc_delta in (delta.get("tool_calls") or []):
                idx = tc_delta.get("index", 0)
                if idx not in accumulated_tool_calls:
                    accumulated_tool_calls[idx] = {
                        "id": tc_delta.get("id", ""),
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    }
                tc = accumulated_tool_calls[idx]
                func = tc_delta.get("function", {})
                if func.get("name"):
                    tc["function"]["name"] += func["name"]
                if func.get("arguments"):
                    tc["function"]["arguments"] += func["arguments"]
                if tc_delta.get("id"):
                    tc["id"] = tc_delta["id"]

    tool_calls_list = [accumulated_tool_calls[i] for i in sorted(accumulated_tool_calls)]
    yield ("final", {
        "choices": [{
            "message": {
                "role": "assistant",
                "content": full_content,
                "tool_calls": tool_calls_list or None,
            }
        }]
    })


def _llm_stream_first_call(
    messages: List[Dict[str, Any]],
    model: str,
    tools: List[Dict[str, Any]],
    provider: Optional[str] = None,
) -> Iterable[Tuple[str, Any]]:
    if _normalize_provider(provider) == "openrouter":
        return _openrouter_stream_first_call(messages, model, tools)
    return _ollama_stream_first_call(messages, model, tools)




def _parse_sections(body: str) -> Tuple[str, str]:
    """Parse [SPOKEN] and [SILENT] sections from the model response."""
    if not body:
        return "", ""

    spoken_lines: List[str] = []
    silent_lines: List[str] = []
    section: Optional[str] = None

    for line in body.splitlines():
        stripped = line.strip()
        # Check for marker at start of line (with optional text after)
        if stripped.startswith("[SPOKEN]"):
            section = "spoken"
            remainder = stripped[len("[SPOKEN]"):].strip()
            if remainder:
                spoken_lines.append(remainder)
            continue
        if stripped.startswith("[SILENT]"):
            section = "silent"
            remainder = stripped[len("[SILENT]"):].strip()
            if remainder:
                silent_lines.append(remainder)
            continue
        if section == "spoken":
            spoken_lines.append(line)
        elif section == "silent":
            silent_lines.append(line)

    spoken_text = "\n".join(spoken_lines).strip()
    silent_text = "\n".join(silent_lines).strip()

    # Fallback: strip any remaining markers from raw text
    if not spoken_text and not silent_text:
        cleaned = body.replace("[SPOKEN]", "").replace("[SILENT]", "").strip()
        return cleaned, ""

    return spoken_text, silent_text


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    screenshot_followup = bool(request.screenshot_followup)
    search_method = (request.search_method or "searxng").lower()
    personality_id = (request.personality_id or "default").strip()
    tone_context = (request.tone_context or "").strip() or None
    active_store = _get_store(personality_id)
    if not user_text and not has_image:
        raise HTTPException(status_code=400, detail="Text or image is required")
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model
    active_yaml_store = _get_yaml_store(personality_id)
    eff_max_history = request.max_history if request.max_history is not None else CHAT_MAX_HISTORY
    eff_max_tokens = request.max_context_tokens if request.max_context_tokens is not None else CONTEXT_MAX_TOKENS
    eff_rag_top_k = request.max_rag_results if request.max_rag_results is not None else RAG_TOP_K

    recent = active_store.get_recent(session_id, limit=eff_max_history)

    try:
        user_embedding = _ollama_embeddings(user_text) if user_text else []
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt(tone_context)},
        {"role": "system", "content": _current_time_context()},
    ]
    time_since = _time_since_last_message_context(recent)
    if time_since:
        messages.append({"role": "system", "content": time_since})
    memory_context = active_yaml_store.format_for_context()
    if memory_context:
        messages.append({"role": "system", "content": memory_context})
    if user_embedding:
        rag_results = active_store.search(user_embedding, top_k=eff_rag_top_k)
        if rag_results:
            base_used = _estimate_tokens(" ".join(m["content"] for m in messages))
            rag_budget = max(0, eff_max_tokens - base_used)
            trimmed_rag = []
            for item in rag_results:
                cost = _estimate_tokens(item.get("content") or "")
                if rag_budget - cost < 0:
                    break
                trimmed_rag.append(item)
                rag_budget -= cost
            if trimmed_rag:
                rag_lines = ["Relevant past conversations:"]
                for item in trimmed_rag:
                    role = item.get("role", "user").capitalize()
                    content = item.get("content", "")
                    rag_lines.append(f"{role}: {content}")
                messages.append({"role": "system", "content": "\n".join(rag_lines)})
    # Trim recent messages to fit within token budget
    fixed_context = " ".join(m["content"] for m in messages)
    recent = _trim_recent_to_token_budget(recent, fixed_context, eff_max_tokens)
    if screenshot_followup:
        messages.append(
            {
                "role": "system",
                "content": (
                    "A fresh screenshot is attached. "
                    "Use it to answer the user's request directly."
                ),
            }
        )

    messages.extend(_format_recent_messages(recent))
    prompt_text = user_text or "Please describe the image."
    user_message: Dict[str, Any] = {"role": "user", "content": prompt_text}
    if has_image:
        user_message["images"] = [image_base64]
    messages.append(user_message)

    try:
        raw_content, tool_calls_made, screenshot_requested, screenshot_reason = (
            _run_tool_loop(
                messages, _build_tool_definitions(COMFYUI_CHECKPOINT), selected_model, provider,
                active_yaml_store, search_method,
            )
        )
    except (requests.RequestException, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")

    context_debug = _build_context_debug(messages)

    if screenshot_requested:
        if not hidden and user_text != "[Thinking Tick]":
            active_store.add_message(
                session_id, "user", user_text or "[Image]", None,
            )
        return ChatResponse(
            session_id=session_id,
            assistant_text="",
            silent_text="",
            speak=False,
            tool_calls_made=tool_calls_made,
            provider=provider,
            request_screenshot=True,
            request_reason=screenshot_reason,
            context_debug=context_debug,
        )

    spoken_text, silent_text = _parse_sections(raw_content)

    if not hidden and user_text != "[Thinking Tick]":
        active_store.add_message(
            session_id,
            "user",
            user_text or "[Image]",
            user_embedding if user_embedding else None,
        )

    is_thinking_tick = user_text == "[Thinking Tick]"

    if spoken_text and not is_thinking_tick:
        try:
            assistant_embedding = _ollama_embeddings(spoken_text)
        except requests.RequestException:
            assistant_embedding = []
        active_store.add_message(session_id, "assistant", spoken_text, assistant_embedding)

    return ChatResponse(
        session_id=session_id,
        assistant_text=spoken_text,
        silent_text=silent_text,
        speak=bool(spoken_text),
        tool_calls_made=tool_calls_made,
        provider=provider,
        context_debug=context_debug,
    )


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    screenshot_followup = bool(request.screenshot_followup)
    search_method = (request.search_method or "searxng").lower()
    personality_id = (request.personality_id or "default").strip()
    tone_context = (request.tone_context or "").strip() or None
    active_store = _get_store(personality_id)
    active_yaml_store = _get_yaml_store(personality_id)
    eff_max_history = request.max_history if request.max_history is not None else CHAT_MAX_HISTORY
    eff_max_tokens = request.max_context_tokens if request.max_context_tokens is not None else CONTEXT_MAX_TOKENS
    eff_rag_top_k = request.max_rag_results if request.max_rag_results is not None else RAG_TOP_K
    if not user_text and not has_image:
        raise HTTPException(status_code=400, detail="Text or image is required")
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model

    try:
        user_embedding = _ollama_embeddings(user_text) if user_text else []
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

    recent = active_store.get_recent(session_id, limit=eff_max_history)

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt(tone_context)},
        {"role": "system", "content": _current_time_context()},
    ]
    time_since = _time_since_last_message_context(recent)
    if time_since:
        messages.append({"role": "system", "content": time_since})
    memory_context = active_yaml_store.format_for_context()
    if memory_context:
        messages.append({"role": "system", "content": memory_context})
    if user_embedding:
        rag_results = active_store.search(user_embedding, top_k=eff_rag_top_k)
        if rag_results:
            base_used = _estimate_tokens(" ".join(m["content"] for m in messages))
            rag_budget = max(0, eff_max_tokens - base_used)
            trimmed_rag = []
            for item in rag_results:
                cost = _estimate_tokens(item.get("content") or "")
                if rag_budget - cost < 0:
                    break
                trimmed_rag.append(item)
                rag_budget -= cost
            if trimmed_rag:
                rag_lines = ["Relevant past conversations:"]
                for item in trimmed_rag:
                    role = item.get("role", "user").capitalize()
                    content = item.get("content", "")
                    rag_lines.append(f"{role}: {content}")
                messages.append({"role": "system", "content": "\n".join(rag_lines)})
    # Trim recent messages to fit within token budget
    fixed_context = " ".join(m["content"] for m in messages)
    recent = _trim_recent_to_token_budget(recent, fixed_context, eff_max_tokens)
    if screenshot_followup:
        messages.append(
            {
                "role": "system",
                "content": (
                    "A fresh screenshot is attached. "
                    "Use it to answer the user's request directly."
                ),
            }
        )

    messages.extend(_format_recent_messages(recent))
    prompt_text = user_text or "Please describe the image."
    user_message: Dict[str, Any] = {"role": "user", "content": prompt_text}
    if has_image:
        user_message["images"] = [image_base64]
    messages.append(user_message)

    tools = _build_tool_definitions(COMFYUI_CHECKPOINT)

    def generate() -> Iterable[str]:
        tool_calls_made: List[Dict[str, Any]] = []
        screenshot_requested = False
        screenshot_reason = ""
        image_already_generated = False
        spoken_text = ""
        silent_text = ""

        # Yield preliminary meta immediately so the frontend starts accepting tokens.
        yield json.dumps({
            "type": "meta",
            "session_id": session_id,
            "tool_calls_made": [],
            "provider": provider,
            "context_debug": "",
        }) + "\n"

        try:
            # ── First call: streaming so tokens appear progressively ──
            section_state = _SectionStreamState()
            first_data: Optional[Dict[str, Any]] = None

            for event_type, value in _llm_stream_first_call(messages, selected_model, tools, provider):
                if event_type == "token":
                    sp, si = section_state.feed(value)
                    if sp:
                        spoken_text += sp
                        yield json.dumps({"type": "token", "channel": "spoken", "text": sp}) + "\n"
                    if si:
                        silent_text += si
                        yield json.dumps({"type": "token", "channel": "silent", "text": si}) + "\n"
                elif event_type == "final":
                    first_data = value

            sp, si = section_state.flush()
            if sp:
                spoken_text += sp
                yield json.dumps({"type": "token", "channel": "spoken", "text": sp}) + "\n"
            if si:
                silent_text += si
                yield json.dumps({"type": "token", "channel": "silent", "text": si}) + "\n"

            if first_data is None:
                yield json.dumps({"type": "error", "detail": "No response from LLM"}) + "\n"
                return

            data = first_data
            raw_tool_calls = _get_tool_calls_from_response(data, provider)

            # Fallback: if streaming produced no text and no tool calls, the LLM likely
            # intended a tool call but the streaming done message didn't include tool_calls
            # (a known limitation of some Ollama/OpenRouter streaming responses).
            # Re-run the first call non-streaming to reliably detect tool calls.
            if not raw_tool_calls and not spoken_text.strip() and not silent_text.strip():
                data = _llm_chat_with_tools(messages, selected_model, tools, provider)
                raw_tool_calls = _get_tool_calls_from_response(data, provider)
                if not raw_tool_calls:
                    # Genuinely no tool calls — yield whatever text the model produced.
                    raw_content = _get_content_from_response(data, provider)
                    spoken_text, silent_text = _parse_sections(raw_content)
                    if spoken_text:
                        yield json.dumps({"type": "token", "channel": "spoken", "text": spoken_text}) + "\n"
                    if silent_text:
                        yield json.dumps({"type": "token", "channel": "silent", "text": silent_text}) + "\n"

            # ── Tool loop ──
            # iteration_count 0 uses first_data (already streamed).
            # Subsequent iterations use non-streaming _llm_chat_with_tools.
            for iteration_count in range(6):
                if not raw_tool_calls:
                    if iteration_count > 0:
                        # Final response from a post-tool non-streaming call.
                        raw_content = _get_content_from_response(data, provider)
                        spoken_text, silent_text = _parse_sections(raw_content)
                        if spoken_text:
                            yield json.dumps({"type": "token", "channel": "spoken", "text": spoken_text}) + "\n"
                        if silent_text:
                            yield json.dumps({"type": "token", "channel": "silent", "text": silent_text}) + "\n"
                    break

                results: List[Tuple[str, str, str]] = []
                image_path_for_injection: Optional[str] = None

                for tc in raw_tool_calls:
                    name, args, call_id = _normalize_tool_call(tc, provider)
                    is_screenshot = False

                    if name == "generateImage":
                        if image_already_generated:
                            result_text = "Image was already generated. Please respond with a confirmation."
                        elif not _is_comfyui_running():
                            result_text = "Error: ComfyUI is not running."
                        else:
                            prompt_arg = str(args.get("prompt", "")).strip()
                            if not prompt_arg:
                                result_text = "Error: missing prompt parameter."
                            else:
                                negative_prompt_arg = str(args.get("negative_prompt", ""))
                                resolution_arg = str(args.get("resolution", "1024x1024"))
                                try:
                                    w, h = map(int, resolution_arg.split("x"))
                                except ValueError:
                                    w, h = 1024, 1024

                                settings = _get_model_settings(COMFYUI_CHECKPOINT)

                                ollama_models_unloaded: List[str] = []
                                if provider != "openrouter":
                                    free_vram = _get_free_vram_gb()
                                    if free_vram is not None and free_vram < COMFYUI_VRAM_THRESHOLD_GB:
                                        yield json.dumps({
                                            "type": "status",
                                            "text": f"Low VRAM ({free_vram:.1f} GB free) — unloading language model…",
                                        }) + "\n"
                                        ollama_models_unloaded = _ollama_running_models()
                                        for m in ollama_models_unloaded:
                                            _ollama_stop_model(m)
                                        _comfyui_free_memory()
                                        time.sleep(1)

                                yield json.dumps({"type": "status", "text": "Generating image…"}) + "\n"
                                COMFYUI_OUTPUT_DIR.mkdir(exist_ok=True)
                                try:
                                    from comfyui_service import generate as _comfyui_generate
                                    file_path = _comfyui_generate(
                                        prompt=prompt_arg, negative_prompt=negative_prompt_arg,
                                        checkpoint=COMFYUI_CHECKPOINT, width=w, height=h,
                                        steps=settings["steps"], cfg=settings["cfg"],
                                        sampler=settings["sampler"], scheduler=settings["scheduler"],
                                        output_dir=COMFYUI_OUTPUT_DIR, base_url=COMFYUI_BASE_URL,
                                        workflow_json=settings.get("workflow_json"),
                                    )
                                    result_text = f"__IMAGE_GENERATED__:{file_path}"
                                    image_already_generated = True
                                except Exception as exc:
                                    result_text = f"Image generation failed: {exc}"
                                finally:
                                    if ollama_models_unloaded:
                                        yield json.dumps({
                                            "type": "status",
                                            "text": "Reloading language model…",
                                        }) + "\n"
                                        _comfyui_free_memory()
                                        _ollama_warm_model(selected_model)
                    else:
                        result_text, is_screenshot = _execute_tool(
                            name, args, active_yaml_store, search_method
                        )

                    if result_text.startswith("__IMAGE_GENERATED__:"):
                        image_path_for_injection = result_text[len("__IMAGE_GENERATED__:"):]
                        filename = Path(image_path_for_injection).name
                        image_url = f"/generated_images/{filename}"
                        result_text = (
                            "Image successfully generated and is now displayed to the user in the chat. "
                            "Respond with a [SPOKEN] message confirming the image is ready and briefly "
                            "describing or commenting on what was generated."
                        )
                        yield json.dumps({"type": "image_ready", "url": image_url}) + "\n"

                    tool_calls_made.append({
                        "name": name,
                        "args": args,
                        "result_summary": result_text[:200] if len(result_text) > 200 else result_text,
                    })

                    if is_screenshot:
                        screenshot_requested = True
                        screenshot_reason = str(args.get("reason", "Model requested a screenshot"))
                        result_text = "Screenshot has been requested from the user. It will be provided in a follow-up message."

                    results.append((call_id, name, result_text))

                _append_tool_result_messages(messages, data, raw_tool_calls, results, provider)

                if image_path_for_injection and _ollama_model_is_multimodal(selected_model):
                    import base64 as _b64
                    img_bytes = Path(image_path_for_injection).read_bytes()
                    b64 = _b64.b64encode(img_bytes).decode()
                    messages.append({
                        "role": "user",
                        "content": "Here is the generated image:",
                        "images": [b64],
                    })

                if screenshot_requested:
                    break

                data = _llm_chat_with_tools(messages, selected_model, tools, provider)
                raw_tool_calls = _get_tool_calls_from_response(data, provider)

        except Exception as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"
            return

        context_debug = _build_context_debug(messages)

        if screenshot_requested:
            if not hidden and user_text != "[Thinking Tick]":
                active_store.add_message(session_id, "user", user_text or "[Image]", None)
            yield json.dumps({"type": "request_screenshot", "reason": screenshot_reason}) + "\n"
            yield json.dumps({
                "type": "done", "spoken_text": "", "silent_text": "",
                "tool_calls_made": tool_calls_made, "context_debug": context_debug,
            }) + "\n"
            return

        if not hidden and user_text != "[Thinking Tick]":
            active_store.add_message(
                session_id,
                "user",
                user_text or "[Image]",
                user_embedding if user_embedding else None,
            )

        is_thinking_tick = user_text == "[Thinking Tick]"
        if spoken_text and not is_thinking_tick:
            try:
                assistant_embedding = _ollama_embeddings(spoken_text)
            except requests.RequestException:
                assistant_embedding = []
            active_store.add_message(
                session_id, "assistant", spoken_text, assistant_embedding
            )

        yield json.dumps({
            "type": "done",
            "spoken_text": spoken_text,
            "silent_text": silent_text,
            "tool_calls_made": tool_calls_made,
            "context_debug": context_debug,
        }) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/models", response_model=ModelListResponse)
def list_models(provider: Optional[str] = None) -> ModelListResponse:
    selected_provider = _normalize_provider(provider)
    if selected_provider == "openrouter":
        try:
            models = _openrouter_list_models()
        except (requests.RequestException, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail=f"Model list error: {exc}")
        default_model = OPENROUTER_MODEL
        if default_model and default_model not in models:
            models.insert(0, default_model)
        return ModelListResponse(
            models=models, default_model=default_model, provider=selected_provider
        )

    url = f"{OLLAMA_BASE_URL}/api/tags"
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Model list error: {exc}")

    data = response.json()
    models = [
        item.get("name")
        for item in data.get("models", [])
        if item.get("name")
    ]
    if OLLAMA_MODEL not in models:
        models.insert(0, OLLAMA_MODEL)
    return ModelListResponse(
        models=models, default_model=OLLAMA_MODEL, provider=selected_provider
    )


@app.delete("/api/personality/{personality_id}/memory")
def delete_personality_memory(personality_id: str) -> Dict[str, bool]:
    if personality_id == "default":
        raise HTTPException(status_code=400, detail="Cannot delete default personality memory")
    _personality_stores.pop(personality_id, None)
    _personality_yaml_stores.pop(personality_id, None)
    db_path = BASE_DIR / f"memory_{personality_id}.sqlite3"
    if db_path.exists():
        db_path.unlink()
    yaml_path = BASE_DIR / f"memories_{personality_id}.yaml"
    if yaml_path.exists():
        yaml_path.unlink()
    return {"deleted": True}


@app.get("/api/tts/voices", response_model=TTSVoicesResponse)
def list_tts_voices() -> TTSVoicesResponse:
    if not _is_kokoro_running():
        return TTSVoicesResponse(voices=[], default_voice="")
    url = f"{KOKORO_BASE_URL}/voices"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Kokoro voices error: {exc}")
    data = response.json()
    voices = data.get("voices") if isinstance(data, dict) else []
    if not isinstance(voices, list):
        voices = []
    default_voice = ""
    if isinstance(data, dict):
        default_voice = str(data.get("default_voice", "")).strip()
    return TTSVoicesResponse(voices=voices, default_voice=default_voice)


@app.get("/api/tts")
def tts_proxy_get(text: str, voice: str = "", speed: Optional[float] = None) -> StreamingResponse:
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    payload: Dict[str, Any] = {"text": text}
    if voice:
        payload["voice"] = voice
    if speed is not None:
        payload["speed"] = speed
    url = f"{KOKORO_BASE_URL}/tts"
    try:
        response = requests.post(url, json=payload, stream=True, timeout=120)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Kokoro TTS error: {exc}")
    media_type = response.headers.get("Content-Type", "audio/wav").split(";")[0]

    def stream_audio() -> Iterable[bytes]:
        try:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        finally:
            response.close()

    return StreamingResponse(stream_audio(), media_type=media_type)


@app.post("/api/tts")
def tts_proxy(request: TTSRequest) -> StreamingResponse:
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    payload: Dict[str, Any] = {"text": text}
    if request.voice:
        payload["voice"] = request.voice
    if request.speed:
        payload["speed"] = request.speed
    url = f"{KOKORO_BASE_URL}/tts"
    try:
        response = requests.post(url, json=payload, stream=True, timeout=120)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Kokoro TTS error: {exc}")

    media_type = response.headers.get("Content-Type", "audio/wav").split(";")[0]

    def stream_audio() -> Iterable[bytes]:
        try:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        finally:
            response.close()

    return StreamingResponse(stream_audio(), media_type=media_type)


# ---------------------------------------------------------------------------
# Kokoro subprocess lifecycle endpoints
# ---------------------------------------------------------------------------


@app.get("/api/kokoro/status")
def kokoro_status() -> Dict[str, Any]:
    return {
        "running": _is_kokoro_running(),
        "available": _kokoro_venv_python() is not None,
        "managed": _kokoro_process is not None,
    }


@app.post("/api/kokoro/start")
def kokoro_start() -> Dict[str, str]:
    global _kokoro_process
    if _is_kokoro_running():
        raise HTTPException(status_code=409, detail="Kokoro is already running")

    python_path = _kokoro_venv_python()
    if python_path is None:
        raise HTTPException(
            status_code=500,
            detail="Kokoro venv not found at backend/.venv-kokoro",
        )

    try:
        _kokoro_process = subprocess.Popen(
            [
                python_path,
                "-m",
                "uvicorn",
                "kokoro_service:app",
                "--host",
                "127.0.0.1",
                "--port",
                KOKORO_PORT,
            ],
            cwd=str(BASE_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_DETACH_FLAGS,
        )
    except Exception as exc:
        _kokoro_process = None
        raise HTTPException(
            status_code=500, detail=f"Failed to start Kokoro: {exc}"
        )

    # Poll health endpoint until ready (up to ~30s)
    for _ in range(60):
        if _kokoro_process.poll() is not None:
            _kokoro_process = None
            raise HTTPException(
                status_code=500, detail="Kokoro process exited unexpectedly"
            )
        if _kokoro_health_check():
            return {"status": "running"}
        time.sleep(0.5)

    # Timed out — kill the process
    _stop_kokoro()
    raise HTTPException(
        status_code=500, detail="Kokoro did not become ready within 30 seconds"
    )


@app.post("/api/kokoro/stop")
def kokoro_stop() -> Dict[str, str]:
    _stop_kokoro()
    return {"status": "stopped"}


# ---------------------------------------------------------------------------
# ComfyUI subprocess lifecycle endpoints
# ---------------------------------------------------------------------------


@app.get("/api/comfyui/status")
def comfyui_status() -> Dict[str, Any]:
    return {
        "running": _is_comfyui_running(),
        "available": bool(COMFYUI_DIR),
        "managed": _comfyui_process is not None,
    }


@app.post("/api/comfyui/start")
def comfyui_start() -> Dict[str, str]:
    global _comfyui_process
    if _is_comfyui_running():
        raise HTTPException(status_code=409, detail="ComfyUI is already running")

    if not COMFYUI_DIR:
        raise HTTPException(
            status_code=500,
            detail="COMFYUI_DIR not configured in .env",
        )

    python_path = _main_venv_python()
    if python_path is None:
        raise HTTPException(
            status_code=500, detail="Main .venv not found at backend/.venv"
        )

    main_py = Path(COMFYUI_DIR) / "main.py"
    if not main_py.exists():
        raise HTTPException(
            status_code=500,
            detail=f"ComfyUI main.py not found at {main_py}",
        )

    try:
        _comfyui_process = subprocess.Popen(
            [
                python_path,
                str(main_py),
                "--listen",
                "127.0.0.1",
                "--port",
                COMFYUI_PORT,
            ],
            cwd=COMFYUI_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_DETACH_FLAGS,
        )
    except Exception as exc:
        _comfyui_process = None
        raise HTTPException(
            status_code=500, detail=f"Failed to start ComfyUI: {exc}"
        )

    # Poll health endpoint until ready (up to ~120s)
    for _ in range(240):
        if _comfyui_process.poll() is not None:
            _comfyui_process = None
            raise HTTPException(
                status_code=500, detail="ComfyUI process exited unexpectedly"
            )
        if _comfyui_health_check():
            return {"status": "running"}
        time.sleep(0.5)

    _stop_comfyui()
    raise HTTPException(
        status_code=500, detail="ComfyUI did not become ready within 120 seconds"
    )


@app.post("/api/comfyui/stop")
def comfyui_stop() -> Dict[str, str]:
    _stop_comfyui()
    return {"status": "stopped"}


@app.get("/api/comfyui/models")
def comfyui_models() -> Dict[str, Any]:
    """List checkpoint files found in all known model directories."""
    return {"models": _get_model_files()}


@app.get("/api/comfyui/active-model")
def comfyui_active_model_get() -> Dict[str, str]:
    return {"checkpoint": COMFYUI_CHECKPOINT}


@app.post("/api/comfyui/active-model")
def comfyui_active_model_set(body: Dict[str, str]) -> Dict[str, str]:
    global COMFYUI_CHECKPOINT
    checkpoint = body.get("checkpoint", "").strip()
    if not checkpoint:
        raise HTTPException(status_code=400, detail="checkpoint is required")
    COMFYUI_CHECKPOINT = checkpoint
    # Persist to settings file
    all_settings = _load_comfyui_settings()
    all_settings["_active_checkpoint"] = checkpoint
    _save_comfyui_settings(all_settings)
    return {"checkpoint": COMFYUI_CHECKPOINT}


@app.get("/api/comfyui/model-settings/{checkpoint}")
def comfyui_model_settings_get(checkpoint: str) -> Dict[str, Any]:
    return _get_model_settings(checkpoint)


@app.put("/api/comfyui/model-settings/{checkpoint}")
def comfyui_model_settings_put(checkpoint: str, body: Dict[str, Any]) -> Dict[str, Any]:
    all_settings = _load_comfyui_settings()
    allowed = {"steps", "cfg", "sampler", "scheduler", "resolutions", "workflow_json"}
    filtered = {k: v for k, v in body.items() if k in allowed}
    existing = all_settings.get(checkpoint, {})
    existing.update(filtered)
    all_settings[checkpoint] = existing
    _save_comfyui_settings(all_settings)
    return _get_model_settings(checkpoint)


@app.get("/api/vram")
def get_vram() -> Dict[str, Any]:
    """Return GPU VRAM usage: used_gb, total_gb, or nulls if unavailable."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split("\n")[0].split(",")
            used_gb = round(float(parts[0].strip()) / 1024.0, 2)
            total_gb = round(float(parts[1].strip()) / 1024.0, 2)
            return {"used_gb": used_gb, "total_gb": total_gb}
    except Exception:
        pass
    return {"used_gb": None, "total_gb": None}


@app.post("/api/cleanvram")
def clean_vram() -> Dict[str, str]:
    """Unload all Ollama models and free ComfyUI memory."""
    for model_name in _ollama_running_models():
        _ollama_stop_model(model_name)
    _comfyui_free_memory()
    return {"status": "ok"}


@app.post("/api/comfyui/validate-workflow")
def comfyui_validate_workflow(body: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a workflow JSON string and report any missing custom nodes."""
    workflow_json_str = (body.get("workflow_json") or "").strip()
    if not workflow_json_str:
        raise HTTPException(status_code=400, detail="workflow_json is required")

    # Parse the workflow
    try:
        workflow = json.loads(workflow_json_str)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSON: {exc}")

    if not isinstance(workflow, dict):
        raise HTTPException(status_code=422, detail="Workflow must be a JSON object")

    # Extract all class_type values used in the workflow
    used_types: set = {
        node.get("class_type", "")
        for node in workflow.values()
        if isinstance(node, dict) and node.get("class_type")
    }

    if not _is_comfyui_running():
        # Can't check against ComfyUI — report as unverifiable
        return {"valid": False, "missing_nodes": [], "error": "ComfyUI is not running; cannot validate nodes"}

    # Fetch known node types from ComfyUI
    try:
        resp = requests.get(f"{COMFYUI_BASE_URL}/object_info", timeout=15)
        resp.raise_for_status()
        known_types: set = set(resp.json().keys())
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"ComfyUI object_info error: {exc}")

    missing = sorted(used_types - known_types)
    return {"valid": len(missing) == 0, "missing_nodes": missing}
