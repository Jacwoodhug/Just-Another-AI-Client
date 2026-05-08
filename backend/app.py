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
from fastapi import FastAPI, HTTPException, Query
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
IMAGE_LIBRARY_FILE = COMFYUI_OUTPUT_DIR / "library.json"
IMAGE_FOLDERS_FILE = COMFYUI_OUTPUT_DIR / "folders.json"

CHAT_MAX_HISTORY = int(os.getenv("CHAT_MAX_HISTORY", "20"))
CONTEXT_MAX_TOKENS = int(os.getenv("CONTEXT_MAX_TOKENS", "4096"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
EMBED_MAX_CHARS = int(os.getenv("EMBED_MAX_CHARS", "8000"))
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
    "- generateImage: generate an image using AI. Use when the user asks to create, draw, or generate a picture. Can be called multiple times in the same message to generate more than one image. After all images are generated, always reply in [SPOKEN] confirming they are ready.\n"
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
            "description": "Generate an image using AI. Use when the user asks to create, draw, or generate a picture or image. Can be called multiple times in the same message to generate more than one image.",
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


# ── Code Workspace tool definitions ──────────────────────────────────────

CODE_TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "readFile",
            "description": "Read a file's contents. Provide start_line and/or end_line (1-indexed, inclusive) to read a range; omit both for the whole file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file."},
                    "start_line": {"type": "integer", "description": "First line to read (1-indexed, inclusive). Omit to start from line 1."},
                    "end_line": {"type": "integer", "description": "Last line to read (1-indexed, inclusive). Omit to read through EOF."},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "findFiles",
            "description": "Find files matching a glob pattern inside a directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern, e.g. '**/*.py'."},
                    "directory": {"type": "string", "description": "Directory to search in."},
                },
                "required": ["pattern", "directory"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "listDirectory",
            "description": "List files and folders in a directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Absolute path to the directory."},
                },
                "required": ["directory"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "searchInFile",
            "description": "Case-insensitive substring search in a file. Returns each match with 2 lines of context before and after.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file."},
                    "query": {"type": "string", "description": "Search string (case-insensitive)."},
                },
                "required": ["path", "query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "writeFile",
            "description": "Overwrite a file with new content. Requires user approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file."},
                    "content": {"type": "string", "description": "New file content."},
                    "summary": {"type": "string", "description": "Reason for the change (shown to user for approval)."},
                },
                "required": ["path", "content", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "createFile",
            "description": "Create a new file. Requires user approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path for the new file."},
                    "content": {"type": "string", "description": "Initial file content."},
                    "summary": {"type": "string", "description": "Reason for creating this file (shown to user for approval)."},
                },
                "required": ["path", "content", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "deleteFile",
            "description": "Delete a file. Requires user approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Absolute path to the file."},
                    "summary": {"type": "string", "description": "Reason for deleting (shown to user for approval)."},
                },
                "required": ["path", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "runCommand",
            "description": "Run a shell command inside the workspace. Requires user approval.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run."},
                    "cwd": {"type": "string", "description": "Working directory (must be inside the workspace)."},
                    "summary": {"type": "string", "description": "Reason for running this command (shown to user for approval)."},
                },
                "required": ["command", "cwd", "summary"],
            },
        },
    },
]

_CODE_APPROVAL_TOOLS = {"writeFile", "createFile", "deleteFile", "runCommand"}
_CODE_READ_ONLY_TOOLS = {"readFile", "findFiles", "listDirectory", "searchInFile"}
_CODE_SKIPPED_BINARY = "[Skipped: file too large or binary]"
_CODE_FILE_SIZE_LIMIT = 5 * 1024 * 1024  # 5 MB


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
    regenerate: Optional[bool] = False
    # Code Workspace fields
    workspace: Optional[str] = None        # "chat" | "code" | "image"
    code_session_id: Optional[str] = None
    workspace_dirs: Optional[List[str]] = Field(default_factory=list)
    pre_approved_read_paths: Optional[List[str]] = Field(default_factory=list)
    prevented_paths: Optional[List[str]] = Field(default_factory=list)
    hidden_paths: Optional[List[str]] = Field(default_factory=list)
    run_timeout_seconds: Optional[int] = 30
    run_output_cap_kb: Optional[int] = 50


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
    raw_output: str = ""
    # Code Workspace fields
    pending_tool_approval: Optional[Dict[str, Any]] = None
    auto_executed: List[Dict[str, Any]] = Field(default_factory=list)
    original_content: Optional[str] = None
    new_content: Optional[str] = None
    change_id: Optional[str] = None
    next_undo_summary: Optional[str] = None
    next_redo_summary: Optional[str] = None


class GenerateImageRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    resolution: Optional[str] = None
    raw: Optional[bool] = False
    model: Optional[str] = None
    provider: Optional[str] = None
    seed: Optional[int] = None               # None = random
    workspace: Optional[str] = None          # "chat" | "image"
    personality_id: Optional[str] = None     # personality that triggered generation


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


# Mount more specific path first so it isn't shadowed by the broader /static mount.
# Serve compiled React bundle from frontend-dist/assets/ at /static/assets/
_FRONTEND_DIST_ASSETS = BASE_DIR.parent / "frontend-dist" / "assets"
if _FRONTEND_DIST_ASSETS.exists():
    app.mount("/static/assets", StaticFiles(directory=str(_FRONTEND_DIST_ASSETS)), name="static-assets")

# Serve app.js, styles.css, index.html etc from frontend/
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# Suppress /api/vram from uvicorn access log (high-frequency polling)
class _NoVramFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/vram" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_NoVramFilter())

# Serve generated images statically
COMFYUI_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/generated_images", StaticFiles(directory=str(COMFYUI_OUTPUT_DIR)), name="generated_images")


# ---------------------------------------------------------------------------
# Image library helpers
# ---------------------------------------------------------------------------
_library_lock = __import__("threading").Lock()


def _load_library() -> Dict[str, Any]:
    """Load library.json; returns empty dict if missing or corrupt."""
    try:
        if IMAGE_LIBRARY_FILE.exists():
            return json.loads(IMAGE_LIBRARY_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_library(data: Dict[str, Any]) -> None:
    IMAGE_LIBRARY_FILE.parent.mkdir(parents=True, exist_ok=True)
    IMAGE_LIBRARY_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _library_upsert(filename: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Thread-safe update of a single entry; returns updated entry."""
    with _library_lock:
        lib = _load_library()
        entry = lib.get(filename, {})
        entry.update(updates)
        lib[filename] = entry
        _save_library(lib)
        return entry


def _load_folders() -> List[str]:
    """Load explicitly-created folders from folders.json."""
    try:
        if IMAGE_FOLDERS_FILE.exists():
            data = json.loads(IMAGE_FOLDERS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _save_folders(folders: List[str]) -> None:
    IMAGE_FOLDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    IMAGE_FOLDERS_FILE.write_text(json.dumps(sorted(folders), indent=2), encoding="utf-8")


def _image_url_for(filename: str) -> str:
    """Convert a filename to its URL path."""
    # Check direct/ subfolder first
    direct = COMFYUI_OUTPUT_DIR / "direct" / filename
    if direct.exists():
        return f"/generated_images/direct/{filename}"
    # Check session-based subfolders (e.g. b196b431/b196b431_66dc.png)
    root_file = COMFYUI_OUTPUT_DIR / filename
    if root_file.exists():
        return f"/generated_images/{filename}"
    # Scan one level of subdirectories
    for subdir in COMFYUI_OUTPUT_DIR.iterdir():
        if subdir.is_dir() and (subdir / filename).exists():
            return f"/generated_images/{subdir.name}/{filename}"
    return f"/generated_images/{filename}"


# ---------------------------------------------------------------------------
# Image library Pydantic models
# ---------------------------------------------------------------------------

class FolderCreateRequest(BaseModel):
    name: str

class ImageFolderRequest(BaseModel):
    folder: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    filenames: List[str]

class BulkFolderRequest(BaseModel):
    filenames: List[str]
    folder: Optional[str] = None


# ---------------------------------------------------------------------------
# Image library routes
# ---------------------------------------------------------------------------

@app.get("/api/images")
def list_images():
    """Return all images with metadata."""
    with _library_lock:
        lib = _load_library()
    results = []
    for filename, meta in lib.items():
        results.append({"filename": filename, "url": _image_url_for(filename), **meta})
    # Sort newest first
    results.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return results


@app.get("/api/images/folders")
def list_folders():
    """Return list of unique folder names (explicit + inferred from images)."""
    with _library_lock:
        lib = _load_library()
    from_images = {m.get("folder") for m in lib.values() if m.get("folder")}
    explicit = set(_load_folders())
    return sorted(from_images | explicit)


@app.post("/api/images/folders")
def create_folder(req: FolderCreateRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    folders = _load_folders()
    if name not in folders:
        folders.append(name)
        _save_folders(folders)
    return {"name": name}


@app.delete("/api/images/folders/{name}")
def delete_folder(name: str):
    """Remove folder assignment from all images and delete the folder record."""
    with _library_lock:
        lib = _load_library()
        for entry in lib.values():
            if entry.get("folder") == name:
                entry["folder"] = None
        _save_library(lib)
    folders = _load_folders()
    if name in folders:
        folders.remove(name)
        _save_folders(folders)
    return {"status": "ok"}


@app.patch("/api/images/{filename}/star")
def toggle_star(filename: str):
    with _library_lock:
        lib = _load_library()
        entry = lib.get(filename, {})
        entry["starred"] = not entry.get("starred", False)
        lib[filename] = entry
        _save_library(lib)
        return {"filename": filename, "starred": entry["starred"]}


@app.patch("/api/images/{filename}/folder")
def set_image_folder(filename: str, req: ImageFolderRequest):
    entry = _library_upsert(filename, {"folder": req.folder})
    return {"filename": filename, "folder": entry.get("folder")}


@app.delete("/api/images/{filename}")
def delete_image(filename: str):
    """Delete image file + metadata entry."""
    with _library_lock:
        lib = _load_library()
        lib.pop(filename, None)
        _save_library(lib)
    # Try to delete the actual file
    for subdir in [COMFYUI_OUTPUT_DIR / "direct", COMFYUI_OUTPUT_DIR]:
        candidate = subdir / filename
        if candidate.exists():
            try:
                candidate.unlink()
            except Exception:
                pass
            break
    return {"status": "ok"}


@app.post("/api/images/bulk-delete")
def bulk_delete_images(req: BulkDeleteRequest):
    with _library_lock:
        lib = _load_library()
        for filename in req.filenames:
            lib.pop(filename, None)
            for subdir in [COMFYUI_OUTPUT_DIR / "direct", COMFYUI_OUTPUT_DIR]:
                candidate = subdir / filename
                if candidate.exists():
                    try:
                        candidate.unlink()
                    except Exception:
                        pass
                    break
        _save_library(lib)
    return {"status": "ok", "deleted": req.filenames}


@app.post("/api/images/bulk-folder")
def bulk_set_folder(req: BulkFolderRequest):
    with _library_lock:
        lib = _load_library()
        for filename in req.filenames:
            entry = lib.get(filename, {})
            entry["folder"] = req.folder
            lib[filename] = entry
        _save_library(lib)
    return {"status": "ok"}


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


def _ollama_embed_single(text: str) -> List[float]:
    """Embed a single chunk of text (must be within the model's token limit)."""
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


def _ollama_embeddings(text: str) -> List[float]:
    """Embed text of any length by chunking and averaging embeddings."""
    if not text:
        return []
    # Split into chunks that fit within the model's token limit
    chunks = [text[i:i + EMBED_MAX_CHARS] for i in range(0, len(text), EMBED_MAX_CHARS)]
    embeddings = [_ollama_embed_single(chunk) for chunk in chunks]
    embeddings = [e for e in embeddings if e]
    if not embeddings:
        return []
    if len(embeddings) == 1:
        return embeddings[0]
    # Average the chunk embeddings
    dim = len(embeddings[0])
    avg = [sum(e[i] for e in embeddings) / len(embeddings) for i in range(dim)]
    return avg


def _merge_system_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge consecutive system messages into one for model compatibility."""
    merged: List[Dict[str, Any]] = []
    system_parts: List[str] = []
    for msg in messages:
        if msg.get("role") == "system":
            system_parts.append(msg["content"])
        else:
            if system_parts:
                merged.append({"role": "system", "content": "\n\n".join(system_parts)})
                system_parts = []
            merged.append(msg)
    if system_parts:
        merged.append({"role": "system", "content": "\n\n".join(system_parts)})
    return merged


def _ollama_chat(messages: List[Dict[str, str]], model: str) -> str:
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": model,
        "messages": _merge_system_messages(messages),
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
    session_id: str = "",
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
            file_path, _ = _comfyui_generate(
                prompt=prompt, negative_prompt=negative_prompt,
                checkpoint=COMFYUI_CHECKPOINT, width=w, height=h,
                steps=settings["steps"], cfg=settings["cfg"],
                sampler=settings["sampler"], scheduler=settings["scheduler"],
                output_dir=COMFYUI_OUTPUT_DIR, base_url=COMFYUI_BASE_URL,
                workflow_json=settings.get("workflow_json"),
                session_id=session_id,
            )
            return f"__IMAGE_GENERATED__:{file_path}", False
        except Exception as exc:
            return f"Image generation failed: {exc}", False

    return f"Unknown tool: {name}", False


def _extract_tool_calls_ollama(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract tool calls from an Ollama chat response."""
    message = data.get("message", {})
    return message.get("tool_calls") or []


def _parse_kv_args(args_str: str) -> Dict[str, Any]:
    """Parse key:value pairs from informal tool-call arg strings.

    Handles Mistral-style <|"|> quote delimiters as well as plain JSON.
    """
    clean = args_str.replace('<|"|>', '"')
    try:
        return json.loads("{" + clean + "}")
    except json.JSONDecodeError:
        pass
    result: Dict[str, Any] = {}
    for m in re.finditer(r'(\w+)\s*:\s*(?:"([^"]*?)"|([^,}\s]+))', clean):
        key = m.group(1)
        result[key] = m.group(2) if m.group(2) is not None else m.group(3)
    return result


def _parse_text_tool_calls(text: str, tool_names: set) -> List[Dict[str, Any]]:
    """Extract tool calls embedded in plain text for models that emit them inline.

    Tries several common patterns in order of specificity and returns the first
    non-empty match set so we don't double-execute.
    """
    extracted: List[Dict[str, Any]] = []

    # Pattern 1: [TOOL_CALL] toolName{key:<|"|>value<|"|>, ...}  (Mistral-small style)
    for m in re.finditer(r"\[TOOL_CALL\]\s*(\w+)\s*\{([^}]*)\}", text, re.IGNORECASE):
        name = m.group(1)
        if name not in tool_names:
            continue
        extracted.append({"function": {"name": name, "arguments": _parse_kv_args(m.group(2))}})
    if extracted:
        return extracted

    # Pattern 2: <tool_call>{"name":"...", "arguments":{...}}</tool_call>
    for m in re.finditer(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, re.DOTALL | re.IGNORECASE):
        try:
            obj = json.loads(m.group(1))
            name = obj.get("name", "")
            if name not in tool_names:
                continue
            args = obj.get("arguments", obj.get("parameters", {}))
            extracted.append({"function": {"name": name, "arguments": args}})
        except json.JSONDecodeError:
            pass
    if extracted:
        return extracted

    # Pattern 3: bare JSON {"name": "toolName", "arguments": {...}}
    for m in re.finditer(
        r'\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{[^{}]*\})\s*\}',
        text,
        re.DOTALL,
    ):
        name = m.group(1)
        if name not in tool_names:
            continue
        try:
            extracted.append({"function": {"name": name, "arguments": json.loads(m.group(2))}})
        except json.JSONDecodeError:
            pass

    return extracted


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
    effective_tools = tools if (tools and _ollama_model_supports_tools(model)) else []
    payload: Dict[str, Any] = {"model": model, "messages": _merge_system_messages(messages), "stream": False}
    if effective_tools:
        payload["tools"] = effective_tools
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
    session_id: str = "",
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
                name, args, active_yaml_store, search_method, session_id
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
    global _comfyui_model_in_vram
    _comfyui_model_in_vram = False
    try:
        requests.post(
            f"{COMFYUI_BASE_URL}/free",
            json={"unload_models": True, "free_memory": True},
            timeout=10,
        )
    except Exception:
        pass


# True after a successful generation; cleared when _comfyui_free_memory() is called.
_comfyui_model_in_vram: bool = False


def _comfyui_model_loaded() -> bool:
    """Return True if the image model is known to be resident in VRAM."""
    return _comfyui_model_in_vram


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


_ollama_model_info_cache: Dict[str, Any] = {}


def _ollama_get_model_info(model: str) -> Dict[str, Any]:
    """Return cached /api/show response for a model."""
    if model not in _ollama_model_info_cache:
        try:
            resp = requests.post(
                f"{OLLAMA_BASE_URL}/api/show",
                json={"model": model},
                timeout=10,
            )
            resp.raise_for_status()
            _ollama_model_info_cache[model] = resp.json()
        except Exception:
            _ollama_model_info_cache[model] = {}
    return _ollama_model_info_cache[model]


def _ollama_model_is_multimodal(model: str) -> bool:
    """Return True if the Ollama model has 'clip' in its families (i.e. is multimodal)."""
    info = _ollama_get_model_info(model)
    families = info.get("details", {}).get("families") or []
    return "clip" in families


def _ollama_model_supports_tools(model: str) -> bool:
    """Return True if the Ollama model supports function/tool calling."""
    info = _ollama_get_model_info(model)
    # Newer Ollama versions expose a capabilities list
    capabilities = info.get("capabilities") or []
    if capabilities:
        return "tools" in capabilities
    # Fallback: check if the model template contains tool markers
    template = info.get("template") or ""
    return "{{ if .Tools }}" in template or "{{- if .Tools }}" in template or ".Tools" in template


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
    payload = {"model": model, "messages": _merge_system_messages(messages), "stream": True}
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
    effective_tools = tools if (tools and _ollama_model_supports_tools(model)) else []
    payload: Dict[str, Any] = {"model": model, "messages": _merge_system_messages(messages), "stream": True}
    if effective_tools:
        payload["tools"] = effective_tools
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


# ── Code Workspace system prompt ──────────────────────────────────────────────

def _build_code_system_prompt(registered_dirs: List[str], pre_approved_paths: List[str]) -> str:
    dirs_str = "\n".join(f"  - {d}" for d in registered_dirs) if registered_dirs else "  (none)"
    if pre_approved_paths:
        paths_str = "\n".join(f"  - {p}" for p in pre_approved_paths)
    else:
        paths_str = "  (none selected — use listDirectory to explore)"
    return f"""You are in Code Workspace mode. You have access to file and command tools for reading
and editing the user's codebase, plus the full set of base tools.

── Code tools (run automatically, no `summary` needed) ──────────────────────────────
  readFile(path, start_line?, end_line?)
      — read a file's contents. Line numbers are 1-indexed and inclusive.
        Omit both for the whole file; pass start_line alone to read from there
        to EOF; pass end_line alone to read from line 1 to there.
  findFiles(pattern, directory) — find files matching a glob pattern
  listDirectory(directory)      — list files/folders accessible to you in a directory
  searchInFile(path, query)     — case-insensitive substring search; returns each
                                  match with 2 lines of context before and after.

── Code tools (require user approval — `summary` field required) ────────────────────
  writeFile(path, content, summary)   — overwrite a file
  createFile(path, content, summary)  — create a new file
  deleteFile(path, summary)           — delete a file
  runCommand(command, cwd, summary)   — run a shell command inside the workspace

── Base tools (always available, use as normal) ─────────────────────────────────────
  webSearch — look up documentation, APIs, or anything you need to research.
  requestScreenshot — ask the user to capture a screenshot of the running app.
  generateImage — generate an image asset.
  memoryStore(content) — store a durable fact (conventions, preferences).
  memoryEdit(id, content) — update an existing memory entry.
  memoryDelete(id) — remove a memory entry.

── Workspace ────────────────────────────────────────────────────────────────────────
Registered directories (only paths inside these are accessible to code tools):
{dirs_str}

The user has pre-selected these files as relevant context — start by reading them
if useful:
{paths_str}

Use listDirectory to discover other files.

If you receive one of these error responses from a code tool, acknowledge and do not retry:
  [Out of scope]    — the path is not inside a registered workspace directory
  [Edit prevented]  — the user has protected that file from modification
  [Hidden]          — the file is not in your accessible tree
  [Denied by user]  — the user declined your action
"""


def _chat_code_workspace(request: ChatRequest, session_id: str) -> ChatResponse:
    """Handle a chat request in Code Workspace mode."""
    code_session_id = request.code_session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    personality_id = (request.personality_id or "default").strip()
    search_method = (request.search_method or "searxng").lower()
    active_yaml_store = _get_yaml_store(personality_id)
    active_store = _get_store(personality_id)
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model

    workspace_dirs = list(request.workspace_dirs or [])
    pre_approved = list(request.pre_approved_read_paths or [])
    prevented = list(request.prevented_paths or [])
    hidden = list(request.hidden_paths or [])
    run_timeout = int(request.run_timeout_seconds or 30)
    run_output_cap = int(request.run_output_cap_kb or 50)

    # Code workspace uses its own session for message history
    recent = active_store.get_recent(code_session_id, limit=CHAT_MAX_HISTORY)

    memory_context = active_yaml_store.format_for_context()
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "system", "content": _build_code_system_prompt(workspace_dirs, pre_approved)},
        {"role": "system", "content": _current_time_context()},
    ]
    if memory_context:
        messages.append({"role": "system", "content": memory_context})

    # No RAG retrieval in code workspace — source files are the context
    messages.extend(_format_recent_messages(recent))
    messages.append({"role": "user", "content": user_text})

    tools = _build_tool_definitions(COMFYUI_CHECKPOINT) + CODE_TOOL_DEFINITIONS

    # Initialize in-flight group
    _code_inflight_groups[code_session_id] = {"paths": {}, "prompt_text": user_text}

    try:
        final_text, tool_calls_made, pending_approval, auto_exec = _run_code_tool_loop(
            messages, tools, selected_model, provider, active_yaml_store, search_method,
            code_session_id, workspace_dirs, prevented, hidden, user_text,
            run_timeout, run_output_cap,
        )
    except Exception as exc:
        final_text = f"Error: {exc}"
        pending_approval = None
        auto_exec = []
        tool_calls_made = []

    # Commit change group if loop is fully done
    change_id: Optional[str] = None
    if pending_approval is None:
        group = _code_inflight_groups.pop(code_session_id, {})
        if group.get("paths"):
            change_id = _commit_change_group(code_session_id, user_text, group)

    # Store message history (bare user prompt + short spoken text only)
    active_store.add_message(code_session_id, "user", user_text, None)
    spoken, _ = _parse_sections(final_text)
    spoken_text = spoken or final_text
    _CODE_CODE_FENCE_RE = re.compile(r"```")
    _CODE_INDENT_RE = re.compile(r"^[ \t]{2,}", re.MULTILINE)
    is_code_heavy = (
        len(spoken_text) > 800
        and (bool(_CODE_CODE_FENCE_RE.search(spoken_text)) or len(_CODE_INDENT_RE.findall(spoken_text)) >= 2)
    )
    if spoken_text and not is_code_heavy:
        active_store.add_message(code_session_id, "assistant", spoken_text, None)

    undo_s, redo_s = _undo_redo_summaries(code_session_id)

    if pending_approval:
        return ChatResponse(
            session_id=code_session_id,
            assistant_text=spoken_text,
            silent_text="",
            speak=False,
            tool_calls_made=tool_calls_made,
            provider=provider,
            pending_tool_approval={
                "call_id": pending_approval["call_id"],
                "tool_name": pending_approval["name"],
                "path_or_command": pending_approval.get("path_or_command", ""),
                "summary": pending_approval["summary"],
                "warnings": pending_approval.get("warnings", []),
            },
            auto_executed=auto_exec,
            next_undo_summary=undo_s,
            next_redo_summary=redo_s,
        )

    return ChatResponse(
        session_id=code_session_id,
        assistant_text=spoken_text,
        silent_text="",
        speak=bool(spoken_text),
        tool_calls_made=tool_calls_made,
        provider=provider,
        change_id=change_id,
        auto_executed=auto_exec,
        next_undo_summary=undo_s,
        next_redo_summary=redo_s,
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    regenerate = bool(request.regenerate)
    screenshot_followup = bool(request.screenshot_followup)
    search_method = (request.search_method or "searxng").lower()
    personality_id = (request.personality_id or "default").strip()
    tone_context = (request.tone_context or "").strip() or None
    active_store = _get_store(personality_id)
    workspace = (request.workspace or "chat").lower()

    # ── Code workspace branch ────────────────────────────────────────────
    if workspace == "code":
        if not user_text:
            # Allow null text for state-only pings (undo/redo state)
            code_session_id = request.code_session_id or str(uuid.uuid4())
            undo_s, redo_s = _undo_redo_summaries(code_session_id)
            return ChatResponse(
                session_id=session_id,
                assistant_text="",
                silent_text="",
                speak=False,
                next_undo_summary=undo_s,
                next_redo_summary=redo_s,
            )
        return _chat_code_workspace(request, session_id)

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
                active_yaml_store, search_method, session_id=session_id,
            )
        )
    except (requests.RequestException, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")

    context_debug = _build_context_debug(messages)

    if screenshot_requested:
        if not hidden and not regenerate and user_text != "[Thinking Tick]":
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

    if not hidden and not regenerate and user_text != "[Thinking Tick]":
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
        raw_output=raw_content,
    )


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    regenerate = bool(request.regenerate)
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
            raw_content_accumulated = ""

            for event_type, value in _llm_stream_first_call(messages, selected_model, tools, provider):
                if event_type == "token":
                    raw_content_accumulated += value
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

            # Fallback: small models sometimes emit tool calls as inline text instead of
            # structured tool_calls. Detect common patterns and retract the bad text.
            if not raw_tool_calls and raw_content_accumulated.strip():
                _tool_names = {t["function"]["name"] for t in tools}
                _text_calls = _parse_text_tool_calls(raw_content_accumulated, _tool_names)
                if _text_calls:
                    yield json.dumps({"type": "retract"}) + "\n"
                    raw_tool_calls = _text_calls
                    spoken_text = ""
                    silent_text = ""
                    data = {"message": {"content": "", "tool_calls": _text_calls}}

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
                    raw_content_accumulated = raw_content
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
                        raw_content_accumulated = raw_content
                        spoken_text, silent_text = _parse_sections(raw_content)
                        if spoken_text:
                            yield json.dumps({"type": "token", "channel": "spoken", "text": spoken_text}) + "\n"
                        if silent_text:
                            yield json.dumps({"type": "token", "channel": "silent", "text": silent_text}) + "\n"
                    break

                results: List[Tuple[str, str, str]] = []
                image_path_for_injection: Optional[str] = None

                # Unload LLM once before all image generation calls if VRAM is tight
                _image_tool_calls = [
                    tc for tc in raw_tool_calls
                    if _normalize_tool_call(tc, provider)[0] == "generateImage"
                ]
                ollama_models_unloaded: List[str] = []
                if _image_tool_calls and _is_comfyui_running() and provider != "openrouter":
                    if not _comfyui_model_loaded():
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

                if _image_tool_calls:
                    yield json.dumps({"type": "image_generation_start", "total": len(_image_tool_calls)}) + "\n"

                try:
                    image_gen_idx = 0
                    for tc in raw_tool_calls:
                        name, args, call_id = _normalize_tool_call(tc, provider)
                        is_screenshot = False

                        if name == "generateImage":
                            if not _is_comfyui_running():
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
                                    image_gen_idx += 1
                                    yield json.dumps({"type": "status", "text": f"Generating image {image_gen_idx}/{len(_image_tool_calls)}…"}) + "\n"
                                    COMFYUI_OUTPUT_DIR.mkdir(exist_ok=True)
                                    try:
                                        from comfyui_service import generate as _comfyui_generate
                                        file_path, _ = _comfyui_generate(
                                            prompt=prompt_arg, negative_prompt=negative_prompt_arg,
                                            checkpoint=COMFYUI_CHECKPOINT, width=w, height=h,
                                            steps=settings["steps"], cfg=settings["cfg"],
                                            sampler=settings["sampler"], scheduler=settings["scheduler"],
                                            output_dir=COMFYUI_OUTPUT_DIR, base_url=COMFYUI_BASE_URL,
                                            workflow_json=settings.get("workflow_json"),
                                            session_id=session_id,
                                        )
                                        result_text = f"__IMAGE_GENERATED__:{file_path}"
                                        image_already_generated = True
                                        global _comfyui_model_in_vram
                                        _comfyui_model_in_vram = True
                                    except Exception as exc:
                                        result_text = f"Image generation failed: {exc}"
                        else:
                            result_text, is_screenshot = _execute_tool(
                                name, args, active_yaml_store, search_method, session_id
                            )

                        if result_text.startswith("__IMAGE_GENERATED__:"):
                            image_path_for_injection = result_text[len("__IMAGE_GENERATED__:"):]
                            filename = Path(image_path_for_injection).name
                            short_id = session_id.split("-")[0] if session_id else ""
                            image_url = f"/generated_images/{short_id}/{filename}" if short_id else f"/generated_images/{filename}"
                            # Add to library so it appears in the Image workspace
                            _library_upsert(filename, {
                                "prompt": locals().get("prompt_arg", str(args.get("prompt", ""))),
                                "negPrompt": locals().get("negative_prompt_arg", str(args.get("negative_prompt", ""))),
                                "enhancedPrompt": "",
                                "enhanced": False,
                                "seed": None,
                                "resolution": locals().get("resolution_arg", str(args.get("resolution", "1024x1024"))),
                                "model": COMFYUI_CHECKPOINT,
                                "timestamp": datetime.utcnow().isoformat() + "Z",
                                "starred": False,
                                "folder": None,
                                "source": "chat",
                                "workspace": "chat",
                                "personality": personality_id if personality_id != "default" else None,
                            })
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
                finally:
                    # Reload LLM once after all image generation calls complete
                    if ollama_models_unloaded:
                        yield json.dumps({
                            "type": "status",
                            "text": "Reloading language model…",
                        }) + "\n"
                        _comfyui_free_memory()
                        _ollama_warm_model(selected_model)

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
            if not hidden and not regenerate and user_text != "[Thinking Tick]":
                active_store.add_message(session_id, "user", user_text or "[Image]", None)
            yield json.dumps({"type": "request_screenshot", "reason": screenshot_reason}) + "\n"
            yield json.dumps({
                "type": "done", "spoken_text": "", "silent_text": "",
                "tool_calls_made": tool_calls_made, "context_debug": context_debug,
            }) + "\n"
            return

        if not hidden and not regenerate and user_text != "[Thinking Tick]":
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
            "raw_output": raw_content_accumulated,
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


@app.delete("/api/session/{session_id}")
def delete_session(session_id: str, personality_id: Optional[str] = None) -> Dict[str, Any]:
    """Delete all messages for a session and remove its generated images folder."""
    pid = (personality_id or "default").strip()
    store = _get_store(pid)
    deleted = store.delete_session(session_id)
    import shutil
    short_id = session_id.split("-")[0] if session_id else ""
    image_folder = COMFYUI_OUTPUT_DIR / short_id
    if image_folder.exists():
        shutil.rmtree(image_folder)
    return {"deleted": deleted}


@app.delete("/api/session/{session_id}/last_exchange")
def delete_last_exchange(session_id: str, personality_id: Optional[str] = None) -> Dict[str, Any]:
    """Delete the last user + assistant message pair for a session (used when deleting a response)."""
    pid = (personality_id or "default").strip()
    store = _get_store(pid)
    deleted = store.delete_last_n_messages(session_id, n=2)
    return {"deleted": deleted}


@app.delete("/api/session/{session_id}/last_assistant")
def delete_last_assistant(session_id: str, personality_id: Optional[str] = None) -> Dict[str, Any]:
    """Delete only the last assistant message for a session (used when regenerating a response)."""
    pid = (personality_id or "default").strip()
    store = _get_store(pid)
    deleted = store.delete_last_n_messages(session_id, n=1)
    return {"deleted": deleted}


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


@app.post("/api/generateimage")
def api_generate_image(req: GenerateImageRequest) -> StreamingResponse:
    """Generate an image directly via ComfyUI with live status streaming."""

    def _stream() -> Iterable[str]:
        if not _is_comfyui_running():
            yield json.dumps({"type": "error", "detail": "ComfyUI is not running."}) + "\n"
            return
        prompt = (req.prompt or "").strip()
        if not prompt:
            yield json.dumps({"type": "error", "detail": "prompt is required"}) + "\n"
            return

        enhanced_prompt: Optional[str] = None
        final_prompt = prompt
        provider = req.provider or None

        if not req.raw:
            yield json.dumps({"type": "status", "text": "Enhancing prompt\u2026"}) + "\n"
            try:
                enhance_model = req.model or _default_model(provider)
                enhance_messages: List[Dict[str, Any]] = [
                    {
                        "role": "system",
                        "content": (
                            "You are an image prompt enhancer. "
                            "Take the user's brief description and rewrite it as a highly detailed, "
                            "visually rich prompt for an AI image generator. "
                            "Return only the enhanced prompt, nothing else."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ]
                enhanced_prompt = _llm_chat(enhance_messages, enhance_model, provider).strip()
                if enhanced_prompt:
                    final_prompt = enhanced_prompt
                    yield json.dumps({"type": "enhanced_prompt", "prompt": enhanced_prompt}) + "\n"
            except Exception as enhance_exc:
                yield json.dumps({"type": "status", "text": f"Enhance failed ({enhance_exc}), using original prompt."}) + "\n"
                enhanced_prompt = None

        # Unload LLM if ComfyUI isn't loaded yet and VRAM is low.
        if not _comfyui_model_loaded() and _normalize_provider(provider) != "openrouter":
            free_vram = _get_free_vram_gb()
            if free_vram is not None and free_vram < COMFYUI_VRAM_THRESHOLD_GB:
                yield json.dumps({"type": "status", "text": f"Low VRAM ({free_vram:.1f}\u202fGB free) \u2014 unloading language model\u2026"}) + "\n"
                for m in _ollama_running_models():
                    _ollama_stop_model(m)
                _comfyui_free_memory()
                time.sleep(1)

        yield json.dumps({"type": "status", "text": "Generating image\u2026"}) + "\n"

        settings = _get_model_settings(COMFYUI_CHECKPOINT)
        default_res = (settings.get("resolutions") or ["1024x1024"])[0]
        try:
            w, h = map(int, (req.resolution or default_res).split("x"))
        except ValueError:
            w, h = 1024, 1024
        COMFYUI_OUTPUT_DIR.mkdir(exist_ok=True)
        try:
            from comfyui_service import generate as _comfyui_generate
            file_path, used_seed = _comfyui_generate(
                prompt=final_prompt,
                negative_prompt=req.negative_prompt or "",
                checkpoint=COMFYUI_CHECKPOINT,
                width=w,
                height=h,
                steps=settings["steps"],
                cfg=settings["cfg"],
                sampler=settings["sampler"],
                scheduler=settings["scheduler"],
                output_dir=COMFYUI_OUTPUT_DIR,
                base_url=COMFYUI_BASE_URL,
                workflow_json=settings.get("workflow_json"),
                session_id="direct",
                seed=req.seed,
            )
            global _comfyui_model_in_vram
            _comfyui_model_in_vram = True
            filename = Path(file_path).name
            image_url = f"/generated_images/direct/{filename}"
            # Persist metadata to library.json
            _library_upsert(filename, {
                "prompt": prompt,
                "negPrompt": req.negative_prompt or "",
                "enhancedPrompt": enhanced_prompt or "",
                "enhanced": bool(enhanced_prompt),
                "seed": used_seed,
                "resolution": req.resolution or f"{w}x{h}",
                "model": COMFYUI_CHECKPOINT,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "starred": False,
                "folder": None,
                "source": "manual",
                "workspace": req.workspace or "image",
                "personality": req.personality_id or None,
            })
            yield json.dumps({"type": "image_ready", "url": image_url, "enhanced_prompt": enhanced_prompt, "seed": used_seed}) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(_stream(), media_type="application/x-ndjson")


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


# =============================================================================
# Code Workspace Backend
# =============================================================================

import fnmatch
import hashlib
import shlex
import shutil
import threading

CODE_HISTORY_DIR = BASE_DIR / "code_history"
_CODE_HISTORY_LOCK = threading.Lock()

# ── In-memory state ───────────────────────────────────────────────────────────

# Pending approval queue: keyed by code_session_id
_pending_code_approvals: Dict[str, Dict[str, Any]] = {}

# Undo/redo stacks: keyed by code_session_id
_code_history: Dict[str, List[Dict[str, Any]]] = {}
_code_history_redo: Dict[str, List[Dict[str, Any]]] = {}
_code_history_total_bytes: int = 0

# In-flight change groups: keyed by code_session_id
_code_inflight_groups: Dict[str, Dict[str, Any]] = {}

# Storage limit (bytes); loaded from config.json on startup
_code_storage_limit_bytes: int = 1_073_741_824  # 1 GB default


# ── Path validation ───────────────────────────────────────────────────────────

def _is_path_allowed(path: str, allowed_dirs: List[str]) -> bool:
    """Return True if *path* resolves inside one of *allowed_dirs*."""
    if not allowed_dirs:
        return False
    try:
        resolved = Path(path).resolve()
    except Exception:
        return False
    for d in allowed_dirs:
        try:
            ad = Path(d).resolve()
            resolved.relative_to(ad)
            return True
        except ValueError:
            continue
    return False


def _is_path_hidden(path: str, hidden_paths: List[str]) -> bool:
    """Return True if *path* is equal to or descends from any hidden path."""
    try:
        resolved = Path(path).resolve()
    except Exception:
        return False
    for hp in (hidden_paths or []):
        try:
            hp_resolved = Path(hp).resolve()
            resolved.relative_to(hp_resolved)
            return True
        except ValueError:
            continue
    return False


def _is_path_prevented(path: str, prevented_paths: List[str]) -> bool:
    """Return True if *path* is protected."""
    try:
        resolved = Path(path).resolve()
    except Exception:
        return False
    for pp in (prevented_paths or []):
        try:
            pp_resolved = Path(pp).resolve()
            resolved.relative_to(pp_resolved)
            return True
        except ValueError:
            continue
    return False


def _detect_binary(data: bytes) -> bool:
    """Return True if *data* looks like binary content."""
    return b"\x00" in data


# ── Code tool execution ───────────────────────────────────────────────────────

def _execute_code_tool(
    name: str,
    args: Dict[str, Any],
    workspace_dirs: List[str],
    hidden_paths: List[str],
    prevented_paths: List[str],
    run_timeout: int,
    run_output_cap_kb: int,
) -> str:
    """Execute a read-only code tool and return the result string."""

    if name == "readFile":
        path = str(args.get("path", "")).strip()
        if not path:
            return "Error: missing path."
        if _is_path_hidden(path, hidden_paths):
            return f"[Hidden] The path '{path}' does not exist in the accessible file tree."
        if not _is_path_allowed(path, workspace_dirs):
            return f"[Out of scope] The path '{path}' is not in the loaded workspace."
        try:
            p = Path(path)
            if not p.exists():
                return f"Error: file not found: {path}"
            raw = p.read_bytes()
            if len(raw) > _CODE_FILE_SIZE_LIMIT or _detect_binary(raw):
                return _CODE_SKIPPED_BINARY
            lines = raw.decode("utf-8", errors="replace").splitlines()
            total = len(lines)
            start_raw = args.get("start_line")
            end_raw = args.get("end_line")
            start = int(start_raw) if start_raw is not None else 1
            end = int(end_raw) if end_raw is not None else total
            start = max(1, min(start, total))
            end = max(1, min(end, total))
            if start > end:
                return f"[lines {start}–{end} of {total} in {path}]\n(invalid range)"
            selected = lines[start - 1:end]
            header = f"[lines {start}–{end} of {total} in {path}]"
            return header + "\n" + "\n".join(selected)
        except Exception as exc:
            return f"Error reading file: {exc}"

    if name == "findFiles":
        pattern = str(args.get("pattern", "")).strip()
        directory = str(args.get("directory", "")).strip()
        if not pattern or not directory:
            return "Error: missing pattern or directory."
        if not _is_path_allowed(directory, workspace_dirs):
            return f"[Out of scope] The path '{directory}' is not in the loaded workspace."
        try:
            base = Path(directory)
            if not base.is_dir():
                return f"Error: not a directory: {directory}"
            matches = []
            for p in base.rglob("*"):
                if fnmatch.fnmatch(p.name, pattern) or fnmatch.fnmatch(str(p.relative_to(base)), pattern):
                    full = str(p)
                    if not _is_path_allowed(full, workspace_dirs):
                        continue
                    if _is_path_hidden(full, hidden_paths):
                        continue
                    matches.append(full)
            if not matches:
                return f"findFiles '{pattern}' in {directory} → 0 files"
            return f"findFiles '{pattern}' in {directory} → {len(matches)} file(s):\n" + "\n".join(matches)
        except Exception as exc:
            return f"Error: {exc}"

    if name == "listDirectory":
        directory = str(args.get("directory", "")).strip()
        if not directory:
            return "Error: missing directory."
        if not _is_path_allowed(directory, workspace_dirs):
            return f"[Out of scope] The path '{directory}' is not in the loaded workspace."
        try:
            base = Path(directory)
            if not base.is_dir():
                return f"Error: not a directory: {directory}"
            entries = []
            skip_dirs = {".git", "__pycache__", "node_modules", ".venv", ".venv-kokoro"}
            for item in sorted(base.iterdir()):
                if item.name in skip_dirs:
                    continue
                full = str(item)
                if _is_path_hidden(full, hidden_paths):
                    continue
                kind = "dir" if item.is_dir() else "file"
                entries.append(f"{item.name}/ ({kind})" if item.is_dir() else f"{item.name} ({kind})")
            if not entries:
                return f"listDirectory {directory} → (empty)"
            return f"listDirectory {directory} → {len(entries)} entries:\n" + "\n".join(entries)
        except Exception as exc:
            return f"Error: {exc}"

    if name == "searchInFile":
        path = str(args.get("path", "")).strip()
        query = str(args.get("query", "")).strip()
        if not path or not query:
            return "Error: missing path or query."
        if _is_path_hidden(path, hidden_paths):
            return ""  # skip silently per spec
        if not _is_path_allowed(path, workspace_dirs):
            return f"[Out of scope] The path '{path}' is not in the loaded workspace."
        try:
            p = Path(path)
            if not p.exists():
                return f"Error: file not found: {path}"
            raw = p.read_bytes()
            if len(raw) > _CODE_FILE_SIZE_LIMIT or _detect_binary(raw):
                return _CODE_SKIPPED_BINARY
            text_lines = raw.decode("utf-8", errors="replace").splitlines()
            ql = query.lower()
            match_indices = [i for i, ln in enumerate(text_lines) if ql in ln.lower()]
            if not match_indices:
                return f"{path}: 0 matches for '{query}'"
            # Merge overlapping 2-line context windows
            ctx = 2
            windows: List[Tuple[int, int]] = []
            for idx in match_indices:
                ws = max(0, idx - ctx)
                we = min(len(text_lines) - 1, idx + ctx)
                if windows and ws <= windows[-1][1] + 1:
                    windows[-1] = (windows[-1][0], we)
                else:
                    windows.append([ws, we])
            output_lines = [f"{path}: {len(match_indices)} match{'es' if len(match_indices) != 1 else ''}"]
            for ws, we in windows:
                output_lines.append(f"-- line {ws + 1} --")
                for i in range(ws, we + 1):
                    ln = text_lines[i]
                    marker = "   ← match" if i in match_indices else ""
                    output_lines.append(f"{i+1:4d} | {ln}{marker}")
            return "\n".join(output_lines)
        except Exception as exc:
            return f"Error: {exc}"

    return f"Unknown read-only code tool: {name}"


# ── History on-disk helpers ───────────────────────────────────────────────────

def _load_history_config() -> None:
    global _code_storage_limit_bytes
    config_path = CODE_HISTORY_DIR / "config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
            _code_storage_limit_bytes = int(cfg.get("limit_bytes", 1_073_741_824))
        except Exception:
            pass


def _save_history_config() -> None:
    CODE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    (CODE_HISTORY_DIR / "config.json").write_text(
        json.dumps({"limit_bytes": _code_storage_limit_bytes}, indent=2), encoding="utf-8"
    )


def _load_history_index() -> Dict[str, Any]:
    index_path = CODE_HISTORY_DIR / "index.json"
    if index_path.exists():
        try:
            return json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"change_groups": [], "total_bytes": 0}


def _save_history_index(index: Dict[str, Any]) -> None:
    CODE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    (CODE_HISTORY_DIR / "index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _path_sha(path: str) -> str:
    return hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]


def _commit_change_group(code_session_id: str, prompt_text: str, group: Dict[str, Any]) -> str:
    """Write a change-group to disk and update the index. Returns change_id."""
    global _code_history_total_bytes
    if not group.get("paths"):
        return ""
    change_id = datetime.utcnow().strftime("%Y%m%dT%H%M%S") + "_" + str(uuid.uuid4())[:8]
    group_dir = CODE_HISTORY_DIR / change_id
    before_dir = group_dir / "before"
    after_dir = group_dir / "after"
    before_dir.mkdir(parents=True, exist_ok=True)
    after_dir.mkdir(parents=True, exist_ok=True)

    files_meta = []
    total_size = 0
    for abs_path, entry in group["paths"].items():
        sha = _path_sha(abs_path)
        before_content = entry.get("before_content", "")
        # Read current (after) content
        try:
            p = Path(abs_path)
            after_content = p.read_text(encoding="utf-8", errors="replace") if p.exists() else "__did_not_exist__"
        except Exception:
            after_content = "__did_not_exist__"

        before_bytes = before_content.encode("utf-8") if before_content != "__did_not_exist__" else b""
        after_bytes = after_content.encode("utf-8") if after_content != "__did_not_exist__" else b""

        (before_dir / f"{sha}.bin").write_bytes(before_bytes)
        (after_dir / f"{sha}.bin").write_bytes(after_bytes)

        entry_size = len(before_bytes) + len(after_bytes)
        total_size += entry_size
        files_meta.append({
            "path": abs_path,
            "sha": sha,
            "op": entry.get("op", "write"),
            "before_size": len(before_bytes),
            "after_size": len(after_bytes),
        })

    metadata = {
        "id": change_id,
        "code_session_id": code_session_id,
        "prompt_text": prompt_text,
        "created_at": datetime.utcnow().isoformat(),
        "files": files_meta,
        "size_bytes": total_size,
    }
    (group_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    with _CODE_HISTORY_LOCK:
        _code_history_total_bytes += total_size
        if code_session_id not in _code_history:
            _code_history[code_session_id] = []
        _code_history[code_session_id].append(metadata)
        # Clear redo stack on new commit
        _code_history_redo[code_session_id] = []

        # Update index
        index = _load_history_index()
        index.setdefault("change_groups", []).append({
            "id": change_id,
            "code_session_id": code_session_id,
            "created_at": metadata["created_at"],
            "size_bytes": total_size,
            "prompt_text": prompt_text,
        })
        index["total_bytes"] = _code_history_total_bytes
        _save_history_index(index)

        # Evict if over limit
        _evict_history_if_needed()

    return change_id


def _evict_history_if_needed() -> None:
    """Delete oldest change-groups until under storage limit. Must be called under lock."""
    global _code_history_total_bytes
    index = _load_history_index()
    groups = index.get("change_groups", [])
    while _code_history_total_bytes > _code_storage_limit_bytes and len(groups) > 1:
        oldest = groups.pop(0)
        old_dir = CODE_HISTORY_DIR / oldest["id"]
        if old_dir.exists():
            shutil.rmtree(old_dir, ignore_errors=True)
        _code_history_total_bytes -= oldest.get("size_bytes", 0)
        # Remove from in-memory stacks
        sid = oldest.get("code_session_id", "")
        for stack in [_code_history, _code_history_redo]:
            if sid in stack:
                stack[sid] = [g for g in stack[sid] if g["id"] != oldest["id"]]
    index["total_bytes"] = max(0, _code_history_total_bytes)
    index["change_groups"] = groups
    _save_history_index(index)


def _read_snapshot(change_id: str, path_sha: str, direction: str) -> Optional[str]:
    """Read before or after content from a change-group snapshot."""
    snap_path = CODE_HISTORY_DIR / change_id / direction / f"{path_sha}.bin"
    if not snap_path.exists():
        return None
    data = snap_path.read_bytes()
    if not data:
        return "__did_not_exist__"
    return data.decode("utf-8", errors="replace")


def _rebuild_history_from_disk() -> None:
    """Rebuild in-memory history from disk on startup."""
    global _code_history_total_bytes
    CODE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    _load_history_config()
    index = _load_history_index()
    _code_history_total_bytes = index.get("total_bytes", 0)
    for entry in index.get("change_groups", []):
        sid = entry.get("code_session_id", "")
        if sid not in _code_history:
            _code_history[sid] = []
        _code_history[sid].append(entry)


# Bootstrap history on module load
try:
    _rebuild_history_from_disk()
except Exception:
    pass


# ── Code tool loop ────────────────────────────────────────────────────────────

def _undo_redo_summaries(code_session_id: str) -> Tuple[Optional[str], Optional[str]]:
    undo_stack = _code_history.get(code_session_id, [])
    redo_stack = _code_history_redo.get(code_session_id, [])
    undo_summary = undo_stack[-1].get("prompt_text") if undo_stack else None
    redo_summary = redo_stack[-1].get("prompt_text") if redo_stack else None
    return undo_summary, redo_summary


def _run_code_tool_loop(
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    model: str,
    provider: Optional[str],
    active_yaml_store: YamlMemoryStore,
    search_method: str,
    code_session_id: str,
    workspace_dirs: List[str],
    prevented_paths: List[str],
    hidden_paths: List[str],
    prompt_text: str,
    run_timeout: int,
    run_output_cap_kb: int,
    max_iterations: int = 10,
) -> Tuple[str, List[Dict[str, Any]], Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Code workspace tool loop.
    Returns (final_text, tool_calls_made, pending_approval, auto_executed).
    If pending_approval is not None, the loop is paused and state stored in
    _pending_code_approvals[code_session_id].
    """
    tool_calls_made: List[Dict[str, Any]] = []
    auto_executed: List[Dict[str, Any]] = []

    # Ensure an in-flight group exists for this session
    if code_session_id not in _code_inflight_groups:
        _code_inflight_groups[code_session_id] = {"paths": {}, "prompt_text": prompt_text}

    for _ in range(max_iterations):
        data = _llm_chat_with_tools(messages, model, tools, provider)
        raw_tool_calls = _get_tool_calls_from_response(data, provider)

        if not raw_tool_calls:
            content = _get_content_from_response(data, provider)
            return content, tool_calls_made, None, auto_executed

        pending_queue: List[Dict[str, Any]] = []
        completed_results: List[Tuple[str, str, str]] = []

        for tc in raw_tool_calls:
            name, args, call_id = _normalize_tool_call(tc, provider)

            # 1. Hidden check
            path_arg = str(args.get("path") or args.get("directory") or args.get("cwd") or "")
            if path_arg and name not in ("runCommand",) and _is_path_hidden(path_arg, hidden_paths):
                result_text = f"[Hidden] The path '{path_arg}' does not exist in the accessible file tree."
                completed_results.append((call_id, name, result_text))
                tool_calls_made.append({"name": name, "args": args, "result_summary": result_text[:200]})
                continue

            # 2. Scope check (for code tools)
            if name in _CODE_APPROVAL_TOOLS | _CODE_READ_ONLY_TOOLS:
                check_path = path_arg
                if name == "createFile":
                    check_path = str(Path(path_arg).parent) if path_arg else ""
                if check_path and not _is_path_allowed(check_path, workspace_dirs):
                    result_text = f"[Out of scope] The path '{check_path}' is not in the loaded workspace."
                    completed_results.append((call_id, name, result_text))
                    tool_calls_made.append({"name": name, "args": args, "result_summary": result_text[:200]})
                    continue

            # 3. Prevented check
            if name in ("writeFile", "createFile", "deleteFile") and path_arg:
                if _is_path_prevented(path_arg, prevented_paths):
                    result_text = f"[Edit prevented] The file '{path_arg}' has been marked as protected."
                    completed_results.append((call_id, name, result_text))
                    tool_calls_made.append({"name": name, "args": args, "result_summary": result_text[:200]})
                    continue

            # 4. Read-only tools → auto-execute
            if name in _CODE_READ_ONLY_TOOLS:
                result_text = _execute_code_tool(name, args, workspace_dirs, hidden_paths, prevented_paths, run_timeout, run_output_cap_kb)
                completed_results.append((call_id, name, result_text))
                tool_calls_made.append({"name": name, "args": args, "result_summary": result_text[:200]})
                auto_executed.append({"tool_name": name, "args": args, "result_text": result_text})
                continue

            # 5. Handle base (non-code) tools inline
            if name not in _CODE_APPROVAL_TOOLS:
                result_text, _ = _execute_tool(name, args, active_yaml_store, search_method, code_session_id)
                completed_results.append((call_id, name, result_text))
                tool_calls_made.append({"name": name, "args": args, "result_summary": result_text[:200]})
                continue

            # 6. Approval-required tool → enqueue
            summary = str(args.get("summary") or "(no reason given)")
            path_or_cmd = path_arg or str(args.get("command") or "")
            warnings: List[str] = []
            if name == "runCommand":
                cmd_str = str(args.get("command") or "")
                for pp in (prevented_paths or []):
                    if pp and pp in cmd_str:
                        warnings.append(f"This command references a protected file: {pp}")
            pending_queue.append({
                "call_id": call_id,
                "name": name,
                "args": args,
                "summary": summary,
                "path_or_command": path_or_cmd,
                "warnings": warnings,
            })

        if not pending_queue:
            # All calls resolved inline; continue loop
            _append_tool_result_messages(messages, data, raw_tool_calls, completed_results, provider)
            continue

        # Store paused state and return first pending item
        _pending_code_approvals[code_session_id] = {
            "messages": messages,
            "pending_queue": pending_queue,
            "completed_results": completed_results,
            "batch_data": data,
            "raw_tool_calls": raw_tool_calls,
            "model": model,
            "provider": provider,
            "active_yaml_store": active_yaml_store,
            "search_method": search_method,
            "workspace_dirs": workspace_dirs,
            "prevented_paths": prevented_paths,
            "hidden_paths": hidden_paths,
            "prompt_text": prompt_text,
            "run_timeout": run_timeout,
            "run_output_cap_kb": run_output_cap_kb,
        }
        first_pending = pending_queue[0]
        return "", tool_calls_made, first_pending, auto_executed

    content = _get_content_from_response(data, provider) if "data" in dir() else ""
    return content, tool_calls_made, None, auto_executed


def _apply_approved_write(
    name: str,
    args: Dict[str, Any],
    code_session_id: str,
    run_timeout: int,
    run_output_cap_kb: int,
) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Execute an approved write/run tool.
    Returns (result_text, original_content, new_content).
    """
    original_content: Optional[str] = None
    new_content: Optional[str] = None

    if name == "writeFile":
        path = str(args.get("path", ""))
        content = str(args.get("content", ""))
        try:
            p = Path(path)
            original_content = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""
            new_content = content
            _record_inflight_before(code_session_id, path, "write", original_content)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            return f"File written: {path}", original_content, new_content
        except Exception as exc:
            return f"Error writing file: {exc}", original_content, new_content

    if name == "createFile":
        path = str(args.get("path", ""))
        content = str(args.get("content", ""))
        try:
            p = Path(path)
            original_content = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""
            new_content = content
            _record_inflight_before(code_session_id, path, "create", original_content)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            return f"File created: {path}", original_content, new_content
        except Exception as exc:
            return f"Error creating file: {exc}", original_content, new_content

    if name == "deleteFile":
        path = str(args.get("path", ""))
        try:
            p = Path(path)
            original_content = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""
            new_content = None
            _record_inflight_before(code_session_id, path, "delete", original_content)
            if p.exists():
                p.unlink()
            return f"File deleted: {path}", original_content, new_content
        except Exception as exc:
            return f"Error deleting file: {exc}", original_content, new_content

    if name == "runCommand":
        command = str(args.get("command", ""))
        cwd = str(args.get("cwd", "."))
        try:
            cap_bytes = run_output_cap_kb * 1024
            result = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=run_timeout,
            )
            stdout = result.stdout or ""
            stderr = result.stderr or ""
            combined_len = len(stdout.encode()) + len(stderr.encode())
            truncated = ""
            if combined_len > cap_bytes:
                # Trim stdout to fit
                stdout = stdout[:cap_bytes]
                truncated = f"\n[Output truncated at {run_output_cap_kb}KB]"
            result_parts = [f"$ {command}  [exit: {result.returncode}]"]
            if stdout:
                result_parts.append(stdout.rstrip())
            if stderr:
                result_parts.append(f"[stderr]\n{stderr.rstrip()}")
            if truncated:
                result_parts.append(truncated)
            return "\n".join(result_parts), None, None
        except subprocess.TimeoutExpired:
            return f"$ {command}\n[Timed out after {run_timeout}s]", None, None
        except Exception as exc:
            return f"Error running command: {exc}", None, None

    return f"Unknown tool: {name}", None, None


def _record_inflight_before(
    code_session_id: str, path: str, op: str, before_content: str
) -> None:
    """Record before_content for the first write to a path in this group."""
    group = _code_inflight_groups.setdefault(code_session_id, {"paths": {}, "prompt_text": ""})
    abs_path = str(Path(path).resolve())
    if abs_path not in group["paths"]:
        group["paths"][abs_path] = {"op": op, "before_content": before_content}
    else:
        # Update op but keep original before_content
        group["paths"][abs_path]["op"] = op


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/code/pick-folder")
def code_pick_folder() -> Dict[str, Any]:
    """Open a native folder picker (via subprocess) and return the chosen path."""
    script = str(BASE_DIR / "code_pick_folder.py")
    python = sys.executable
    try:
        result = subprocess.run(
            [python, script],
            capture_output=True,
            timeout=120,
            # CREATE_NO_WINDOW prevents the child from attaching to uvicorn's console
            # (which would crash the terminal when the subprocess exits on Windows).
            # CREATE_NEW_PROCESS_GROUP isolates Ctrl+C/Break signals from the parent.
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace").strip()
            return {"path": None, "error": err or "Picker failed"}
        path = result.stdout.decode("utf-8").strip() or None
        return {"path": path, "error": None}
    except subprocess.TimeoutExpired:
        return {"path": None, "error": "Picker timed out"}
    except Exception as exc:
        return {"path": None, "error": str(exc)}


@app.get("/api/code/files")
def code_files(paths: List[str] = Query(default=None)) -> List[Dict[str, Any]]:
    """Return a recursive file tree for the given root paths."""
    if not paths:
        return []
    skip = {".git", "__pycache__", "node_modules", ".venv", ".venv-kokoro"}

    def build_tree(p: Path) -> Optional[Dict[str, Any]]:
        if p.name in skip:
            return None
        if p.is_dir():
            children = []
            try:
                for child in sorted(p.iterdir()):
                    node = build_tree(child)
                    if node:
                        children.append(node)
            except PermissionError:
                pass
            return {"path": str(p), "name": p.name, "type": "directory", "children": children}
        return {"path": str(p), "name": p.name, "type": "file", "children": []}

    result = []
    for root in (paths or []):
        rp = Path(root)
        if rp.exists():
            node = build_tree(rp)
            if node:
                result.append(node)
    return result


@app.get("/api/code/read")
def code_read_file(path: str) -> Dict[str, Any]:
    """Return raw file content (UTF-8) for UI use."""
    try:
        p = Path(path)
        if not p.exists():
            return {"content": None, "error": "File not found"}
        raw = p.read_bytes()
        if _detect_binary(raw):
            return {"content": None, "error": "Binary file"}
        return {"content": raw.decode("utf-8", errors="replace"), "error": None}
    except Exception as exc:
        return {"content": None, "error": str(exc)}


class CodeApproveRequest(BaseModel):
    code_session_id: str
    call_id: str
    approved: bool


@app.post("/api/code/approve", response_model=ChatResponse)
def code_approve(request: CodeApproveRequest) -> ChatResponse:
    """Approve or deny the next pending tool call and advance the queue."""
    sid = request.code_session_id
    if sid not in _pending_code_approvals:
        return ChatResponse(
            session_id=sid,
            assistant_text="",
            silent_text="",
            speak=False,
        )

    state = _pending_code_approvals[sid]
    queue: List[Dict[str, Any]] = state["pending_queue"]
    if not queue or queue[0]["call_id"] != request.call_id:
        # Stale or expired
        return ChatResponse(
            session_id=sid,
            assistant_text="",
            silent_text="",
            speak=False,
            pending_tool_approval={"error": "approval_expired"},
        )

    item = queue.pop(0)
    name = item["name"]
    args = item["args"]
    call_id = item["call_id"]

    original_content: Optional[str] = None
    new_content: Optional[str] = None

    if request.approved:
        run_timeout = state.get("run_timeout", 30)
        run_output_cap_kb = state.get("run_output_cap_kb", 50)
        result_text, original_content, new_content = _apply_approved_write(
            name, args, sid, run_timeout, run_output_cap_kb
        )
    else:
        path_or_cmd = item.get("path_or_command") or args.get("path") or args.get("command") or ""
        result_text = f"[Denied by user] The action '{name}' on '{path_or_cmd}' was denied. Do not retry this action unless the user explicitly asks you to."

    state["completed_results"].append((call_id, name, result_text))

    if queue:
        # More items pending — return next one
        next_item = queue[0]
        undo_s, redo_s = _undo_redo_summaries(sid)
        return ChatResponse(
            session_id=sid,
            assistant_text="",
            silent_text="",
            speak=False,
            original_content=original_content,
            new_content=new_content,
            pending_tool_approval={
                "call_id": next_item["call_id"],
                "tool_name": next_item["name"],
                "path_or_command": next_item.get("path_or_command", ""),
                "summary": next_item["summary"],
                "warnings": next_item.get("warnings", []),
            },
            next_undo_summary=undo_s,
            next_redo_summary=redo_s,
        )

    # Queue drained — resume the tool loop
    messages = state["messages"]
    batch_data = state["batch_data"]
    raw_tool_calls = state["raw_tool_calls"]
    completed_results = state["completed_results"]
    provider = state["provider"]
    _append_tool_result_messages(messages, batch_data, raw_tool_calls, completed_results, provider)

    del _pending_code_approvals[sid]

    # Resume
    model = state["model"]
    active_yaml_store = state["active_yaml_store"]
    search_method = state["search_method"]
    workspace_dirs = state["workspace_dirs"]
    prevented = state["prevented_paths"]
    hidden = state["hidden_paths"]
    prompt_text = state["prompt_text"]
    run_timeout = state.get("run_timeout", 30)
    run_output_cap = state.get("run_output_cap_kb", 50)

    tools = _build_tool_definitions(COMFYUI_CHECKPOINT) + CODE_TOOL_DEFINITIONS

    try:
        final_text, more_calls, next_approval, auto_exec = _run_code_tool_loop(
            messages, tools, model, provider, active_yaml_store, search_method,
            sid, workspace_dirs, prevented, hidden, prompt_text, run_timeout, run_output_cap,
        )
    except Exception as exc:
        final_text = f"Error: {exc}"
        next_approval = None
        auto_exec = []

    # Commit group if loop fully done
    change_id: Optional[str] = None
    if next_approval is None and sid in _code_inflight_groups:
        group = _code_inflight_groups.pop(sid, {})
        if group.get("paths"):
            change_id = _commit_change_group(sid, prompt_text, group)

    undo_s, redo_s = _undo_redo_summaries(sid)

    if next_approval:
        return ChatResponse(
            session_id=sid,
            assistant_text=final_text,
            silent_text="",
            speak=False,
            original_content=original_content,
            new_content=new_content,
            pending_tool_approval={
                "call_id": next_approval["call_id"],
                "tool_name": next_approval["name"],
                "path_or_command": next_approval.get("path_or_command", ""),
                "summary": next_approval["summary"],
                "warnings": next_approval.get("warnings", []),
            },
            auto_executed=auto_exec,
            next_undo_summary=undo_s,
            next_redo_summary=redo_s,
        )

    spoken, _ = _parse_sections(final_text)
    return ChatResponse(
        session_id=sid,
        assistant_text=spoken or final_text,
        silent_text="",
        speak=bool(spoken or final_text),
        original_content=original_content,
        new_content=new_content,
        change_id=change_id,
        auto_executed=auto_exec,
        next_undo_summary=undo_s,
        next_redo_summary=redo_s,
    )


class CodeUndoRedoRequest(BaseModel):
    code_session_id: str


@app.post("/api/code/undo")
def code_undo(request: CodeUndoRedoRequest) -> Dict[str, Any]:
    sid = request.code_session_id
    with _CODE_HISTORY_LOCK:
        stack = _code_history.get(sid, [])
        if not stack:
            return {"ok": False, "error": "Nothing to undo"}
        group_meta = stack.pop()
        _code_history_redo.setdefault(sid, []).append(group_meta)

    restored_files = []
    change_id = group_meta["id"]
    for fm in group_meta.get("files", []):
        path = fm["path"]
        sha = fm["sha"]
        before_content = _read_snapshot(change_id, sha, "before")
        if before_content is None:
            continue
        try:
            p = Path(path)
            if before_content == "__did_not_exist__":
                if p.exists():
                    p.unlink()
            else:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(before_content, encoding="utf-8")
            restored_files.append(path)
        except Exception:
            pass
    return {"ok": True, "restored_files": restored_files, "change_id": change_id}


@app.post("/api/code/redo")
def code_redo(request: CodeUndoRedoRequest) -> Dict[str, Any]:
    sid = request.code_session_id
    with _CODE_HISTORY_LOCK:
        redo_stack = _code_history_redo.get(sid, [])
        if not redo_stack:
            return {"ok": False, "error": "Nothing to redo"}
        group_meta = redo_stack.pop()
        _code_history.setdefault(sid, []).append(group_meta)

    restored_files = []
    change_id = group_meta["id"]
    for fm in group_meta.get("files", []):
        path = fm["path"]
        sha = fm["sha"]
        after_content = _read_snapshot(change_id, sha, "after")
        if after_content is None:
            continue
        try:
            p = Path(path)
            if after_content == "__did_not_exist__":
                if p.exists():
                    p.unlink()
            else:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(after_content, encoding="utf-8")
            restored_files.append(path)
        except Exception:
            pass
    return {"ok": True, "restored_files": restored_files, "change_id": change_id}


class CodeRevertRequest(BaseModel):
    code_session_id: str
    change_id: str
    path: str


@app.post("/api/code/revert")
def code_revert(request: CodeRevertRequest) -> Dict[str, Any]:
    sha = _path_sha(str(Path(request.path).resolve()))
    before_content = _read_snapshot(request.change_id, sha, "before")
    if before_content is None:
        return {"ok": False, "error": "Snapshot not found"}
    try:
        p = Path(request.path)
        if before_content == "__did_not_exist__":
            if p.exists():
                p.unlink()
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(before_content, encoding="utf-8")
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/api/code/history")
def code_history_list(code_session_id: str) -> Dict[str, Any]:
    stack = _code_history.get(code_session_id, [])
    return {
        "change_groups": [
            {
                "id": g["id"],
                "prompt_text": g.get("prompt_text", ""),
                "created_at": g.get("created_at", ""),
                "file_count": len(g.get("files", [])),
                "size_bytes": g.get("size_bytes", 0),
            }
            for g in stack
        ]
    }


class CodeHistoryClearRequest(BaseModel):
    code_session_id: Optional[str] = None


@app.post("/api/code/history/clear")
def code_history_clear(request: CodeHistoryClearRequest) -> Dict[str, Any]:
    global _code_history_total_bytes
    with _CODE_HISTORY_LOCK:
        index = _load_history_index()
        groups = index.get("change_groups", [])
        to_delete = [g for g in groups if not request.code_session_id or g.get("code_session_id") == request.code_session_id]
        for g in to_delete:
            d = CODE_HISTORY_DIR / g["id"]
            if d.exists():
                shutil.rmtree(d, ignore_errors=True)
        remaining = [g for g in groups if g not in to_delete]
        index["change_groups"] = remaining
        _code_history_total_bytes = sum(g.get("size_bytes", 0) for g in remaining)
        index["total_bytes"] = _code_history_total_bytes
        _save_history_index(index)
        if request.code_session_id:
            _code_history.pop(request.code_session_id, None)
            _code_history_redo.pop(request.code_session_id, None)
        else:
            _code_history.clear()
            _code_history_redo.clear()
    return {"ok": True}


class CodeHistoryLimitRequest(BaseModel):
    limit_bytes: int


@app.post("/api/code/history/limit")
def code_history_limit(request: CodeHistoryLimitRequest) -> Dict[str, Any]:
    global _code_storage_limit_bytes
    with _CODE_HISTORY_LOCK:
        _code_storage_limit_bytes = max(1024 * 1024, request.limit_bytes)
        _save_history_config()
        _evict_history_if_needed()
    return {"ok": True, "limit_bytes": _code_storage_limit_bytes, "total_bytes": _code_history_total_bytes}


@app.get("/api/code/undo-redo-state")
def code_undo_redo_state(code_session_id: str) -> Dict[str, Any]:
    undo_s, redo_s = _undo_redo_summaries(code_session_id)
    return {"next_undo_summary": undo_s, "next_redo_summary": redo_s}

