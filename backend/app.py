import json
import os
import re
import subprocess
import sys
import time
import uuid
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

# ---------------------------------------------------------------------------
# Kokoro subprocess management
# ---------------------------------------------------------------------------
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
    if _kokoro_process is None:
        return
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

TOOL_DEFINITIONS = [
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
        for tc in raw_tool_calls:
            name, args, call_id = _normalize_tool_call(tc, provider)
            result_text, is_screenshot = _execute_tool(
                name, args, active_yaml_store, search_method
            )

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

        if screenshot_requested:
            return "", tool_calls_made, True, screenshot_reason

    content = _get_content_from_response(data, provider)
    return content, tool_calls_made, screenshot_requested, screenshot_reason


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
    url = f"{OLLAMA_BASE_URL}/api/stop"
    try:
        requests.post(url, json={"name": name, "model": name}, timeout=10)
    except requests.RequestException:
        return


@app.on_event("shutdown")
def shutdown_cleanup() -> None:
    _stop_kokoro()
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

    recent = active_store.get_recent(session_id, limit=8)

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
                messages, TOOL_DEFINITIONS, selected_model, provider,
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
    if not user_text and not has_image:
        raise HTTPException(status_code=400, detail="Text or image is required")
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model

    try:
        user_embedding = _ollama_embeddings(user_text) if user_text else []
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

    recent = active_store.get_recent(session_id, limit=8)

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

    # Run tool loop non-streaming first
    try:
        raw_content, tool_calls_made, screenshot_requested, screenshot_reason = (
            _run_tool_loop(
                messages, TOOL_DEFINITIONS, selected_model, provider,
                active_yaml_store, search_method,
            )
        )
    except (requests.RequestException, RuntimeError) as exc:
        def error_gen() -> Iterable[str]:
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"
        return StreamingResponse(error_gen(), media_type="application/x-ndjson")

    context_debug = _build_context_debug(messages)

    if screenshot_requested:
        if not hidden and user_text != "[Thinking Tick]":
            active_store.add_message(session_id, "user", user_text or "[Image]", None)

        def generate_screenshot_request() -> Iterable[str]:
            meta = {
                "type": "meta",
                "session_id": session_id,
                "tool_calls_made": tool_calls_made,
                "provider": provider,
                "context_debug": context_debug,
            }
            yield json.dumps(meta) + "\n"
            yield json.dumps(
                {"type": "request_screenshot", "reason": screenshot_reason}
            ) + "\n"
            yield json.dumps(
                {"type": "done", "spoken_text": "", "silent_text": ""}
            ) + "\n"

        return StreamingResponse(
            generate_screenshot_request(), media_type="application/x-ndjson"
        )

    # If tool loop returned content directly (no streaming needed for final response),
    # we still emit it as streamed tokens for wire-format compatibility.
    def generate() -> Iterable[str]:
        meta = {
            "type": "meta",
            "session_id": session_id,
            "tool_calls_made": tool_calls_made,
            "provider": provider,
            "context_debug": context_debug,
        }
        yield json.dumps(meta) + "\n"

        spoken_text, silent_text = _parse_sections(raw_content)

        if spoken_text:
            yield json.dumps({"type": "token", "channel": "spoken", "text": spoken_text}) + "\n"
        if silent_text:
            yield json.dumps({"type": "token", "channel": "silent", "text": silent_text}) + "\n"

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

        yield json.dumps(
            {"type": "done", "spoken_text": spoken_text, "silent_text": silent_text}
        ) + "\n"

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
