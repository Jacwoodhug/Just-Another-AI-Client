import json
import os
import re
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

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
DB_PATH = BASE_DIR / "memory.sqlite3"

load_dotenv(BASE_DIR / ".env")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
SEARXNG_BASE_URL = os.getenv("SEARXNG_BASE_URL", "http://localhost:8080").rstrip("/")
SEARXNG_RESULTS = int(os.getenv("SEARXNG_RESULTS", "5"))
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

SYSTEM_PROMPT = (
    "You are a voice chat assistant in a web GUI. "
    "You can choose to respond or stay silent. "
    "Return two parts. PART 1: A single line of raw JSON object. PART 2: The body.\n"
    "PART 1 JSON keys: memory_note (string) and thinking_summary (string). "
    "MANDATORY: Output RAW JSON only for Part 1. Do NOT wrap it in markdown block quotes (```json). \n"
    "thinking_summary: a brief, user-safe summary of your reasoning (1-3 bullets).\n"
    "\n"
    "PART 2 (Body):\n"
    "Leave a blank line after the JSON, then use these markers:\n"
    "[SPOKEN] followed by the spoken response text.\n"
    "[SILENT] followed by the silent response text (shown in Thinking panel, never spoken).\n"
    "If web search results are provided, use them to answer. Do not cite URLs unless explicitly asked.\n"
    "memory_note: a short, durable fact worth remembering (or empty).\n"
    "\n"
    "BEHAVIORAL GUIDELINES:\n"
    "You are an ambient, voice-first companion with visual awareness of the user’s screen and access to memory. Your primary interaction channel is spoken conversation. Screenshots provide passive context, not obligations to respond.\n"
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
    "- You haven’t spoken recently and a brief interaction would feel companionable.\n"
    "- Otherwise, remain silent.\n"
    "\n"
    "Asking questions:\n"
    "- You are allowed and encouraged to ask questions, especially following user speech.\n"
    "- Ask one question at a time. Keep it low-pressure and conversational.\n"
    "- Curiosity, not interrogation. Easy to ignore.\n"
    "\n"
    "Tone & personality:\n"
    "- Conversational, relaxed, human. Mild humor/opinions welcome.\n"
    "- Avoid “assistant voice.” Avoid narrating the screen.\n"
    "- Spoken responses should usually be 1-2 sentences, sometimes 3.\n"
    "\n"
    "Silence rules:\n"
    "Leave [SPOKEN] empty primarily when:\n"
    "- no user speech occurred\n"
    "- you already spoke recently and nothing meaningfully changed\n"
    "- the user appears focused or actively typing\n"
    "- you would be guessing details you can’t see clearly\n"
    "- Silence should feel intentional and comfortable, not hesitant.\n"
    "\n"
    "Internal thoughts (use [SILENT]):\n"
    "- Private observations, tentative interpretations, contextual notes.\n"
    "- Do not leak reasoning into [SPOKEN].\n"
    "\n"
    "Memory behavior:\n"
    "- Use memory_note only for durable preferences, habits, or long-term facts. No transient moods.\n"
    "\n"
    "Self-regulation:\n"
    "- If you spoke very recently, raise the bar before speaking again unless the user speaks.\n"
    "- User speech always lowers the bar to respond."
)

SEARCH_DECIDER_PROMPT = (
    "You are a search query generator. "
    "Decide if a web search is required to answer the user's request accurately. "
    "You MUST respond with valid JSON only. No other text.\n"
    "Format: {\"use_search\": boolean, \"search_query\": string}\n"
    "Example: {\"use_search\": true, \"search_query\": \"latest nvidia driver\"}\n"
    "If no search is needed, use {\"use_search\": false, \"search_query\": \"\"}."
)

SCREENSHOT_DECIDER_PROMPT = (
    "You decide whether a fresh screenshot of the user's screen is required "
    "to answer the user's request accurately. "
    "Respond with valid JSON only. No other text.\n"
    "Format: {\"request_screenshot\": boolean, \"reason\": string}\n"
    "If no screenshot is needed, use {\"request_screenshot\": false, \"reason\": \"\"}.\n"
    "Request a screenshot when the user asks what is on the screen, to describe UI/visuals, "
    "or when on-screen content is required to answer."
)



class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    text: Optional[str] = None
    model: Optional[str] = None
    image_base64: Optional[str] = None
    provider: Optional[str] = None
    hidden: Optional[bool] = False
    screenshot_followup: Optional[bool] = False


class ChatResponse(BaseModel):
    session_id: str
    assistant_text: str
    silent_text: str
    speak: bool
    memory_used: List[str] = Field(default_factory=list)
    thinking_summary: str = ""
    search_query: str = ""
    search_results: List[Dict[str, str]] = Field(default_factory=list)
    provider: str = ""
    request_screenshot: bool = False
    request_reason: str = ""


class ModelListResponse(BaseModel):
    models: List[str]
    default_model: str
    provider: str


app = FastAPI(title="Ollama Voice Chat")
store = MemoryStore(str(DB_PATH))

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


def _decide_search_query(
    user_text: str, model: str, provider: Optional[str] = None
) -> str:
    if not user_text:
        return ""
    messages = [
        {"role": "system", "content": SEARCH_DECIDER_PROMPT},
        {"role": "user", "content": user_text},
    ]
    try:
        content = _llm_chat(messages, model, provider)
        print(f"DEBUG: Search decider raw content: {content!r}")
    except (requests.RequestException, RuntimeError) as exc:
        print(f"DEBUG: Search decider error: {exc}")
        return ""
    use_search, query = _parse_search_decider(content)
    print(f"DEBUG: Parsed search decision: use_search={use_search}, query={query!r}")
    if use_search and query:
        return query
    return ""


def _decide_screenshot_request(
    user_text: str, model: str, provider: Optional[str] = None
) -> Tuple[bool, str]:
    if not user_text:
        return False, ""
    messages = [
        {"role": "system", "content": SCREENSHOT_DECIDER_PROMPT},
        {"role": "user", "content": user_text},
    ]
    try:
        content = _llm_chat(messages, model, provider)
        print(f"DEBUG: Screenshot decider raw content: {content!r}")
    except (requests.RequestException, RuntimeError) as exc:
        print(f"DEBUG: Screenshot decider error: {exc}")
        return False, ""
    request, reason = _parse_screenshot_decider(content)
    print(
        "DEBUG: Parsed screenshot decision: "
        f"request_screenshot={request}, reason={reason!r}"
    )
    return request, reason


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
def unload_ollama_models() -> None:
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


def _parse_header_line(line: str) -> Dict[str, Any]:
    try:
        data = json.loads(_normalize_json_quotes(line))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _normalize_json_quotes(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u201e", '"')
        .replace("\u201f", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201b", "'")
    )


def _parse_header_block(text: str) -> Dict[str, Any]:
    candidate = _normalize_json_quotes(text.strip())
    if not candidate:
        return {}
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(candidate[start : end + 1])
            except json.JSONDecodeError:
                return {}
        else:
            return {}
    return data if isinstance(data, dict) else {}


def _strip_code_fence(text: str) -> str:
    if not text:
        return ""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text.strip()


def _parse_search_decider(content: str) -> Tuple[bool, str]:
    cleaned = _strip_code_fence(content)
    header = _parse_header_block(cleaned)
    if header:
        use_search = bool(header.get("use_search", False))
        query = str(header.get("search_query", "")).strip()
        return use_search, query

    use_match = re.search(r"use_search\s*[:=]\s*(true|false)", cleaned, re.I)
    if use_match:
        use_search = use_match.group(1).lower() == "true"
        query = ""
        query_match = re.search(
            r"search_query\s*[:=]\s*\"([^\"]+)\"", cleaned, re.I
        )
        if not query_match:
            query_match = re.search(
                r"search_query\s*[:=]\s*'([^']+)'", cleaned, re.I
            )
        if query_match:
            query = query_match.group(1).strip()
        return use_search, query

    return False, ""


def _parse_screenshot_decider(content: str) -> Tuple[bool, str]:
    cleaned = _strip_code_fence(content)
    header = _parse_header_block(cleaned)
    if header:
        request = bool(header.get("request_screenshot", False))
        reason = str(header.get("reason", "")).strip()
        return request, reason

    request_match = re.search(
        r"request_screenshot\s*[:=]\s*(true|false)", cleaned, re.I
    )
    if request_match:
        request = request_match.group(1).lower() == "true"
        reason = ""
        reason_match = re.search(r"reason\s*[:=]\s*\"([^\"]+)\"", cleaned, re.I)
        if not reason_match:
            reason_match = re.search(r"reason\s*[:=]\s*'([^']+)'", cleaned, re.I)
        if reason_match:
            reason = reason_match.group(1).strip()
        return request, reason

    return False, ""


def _split_json_prefix(text: str) -> Tuple[str, str]:
    if not text:
        return "", ""
    stripped = text.lstrip()
    if not stripped.startswith("{"):
        return "", text
    depth = 0
    in_string = False
    escape = False
    for idx, char in enumerate(stripped):
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                prefix = stripped[: idx + 1]
                rest = stripped[idx + 1 :]
                return prefix, rest
    return "", text


def _split_header_body(content: str) -> Tuple[Dict[str, Any], str]:
    if not content or not content.strip():
        return {}, ""

    fenced = re.match(r"\s*```(?:json)?\s*", content)
    if fenced:
        stripped = content[fenced.end() :]
        prefix, rest = _split_json_prefix(stripped)
        if prefix:
            header = _parse_header_block(prefix)
            if header:
                # Remove potential closing backticks from the start of the rest
                rest = re.sub(r"^\s*```\s*", "", rest)
                return header, rest.lstrip()

    parts = re.split(r"\r?\n\r?\n", content, maxsplit=1)
    if len(parts) == 2:
        header_block, body = parts
        header = _parse_header_block(header_block)
        if header:
            return header, body.lstrip()

    stripped = content.strip()
    header = _parse_header_block(stripped)
    if header and (
        "memory_note" in header
        or "thinking_summary" in header
        or "assistant_text" in header
        or "speak" in header
    ):
        return header, ""

    lines = stripped.splitlines()
    header = _parse_header_line(lines[0].strip())
    if header:
        body = "\n".join(lines[1:]).lstrip()
        return header, body

    prefix, rest = _split_json_prefix(stripped)
    if prefix:
        header = _parse_header_block(prefix)
        if header:
            return header, rest.lstrip()

    return {}, stripped


def _parse_sections(body: str) -> Tuple[str, str]:
    if not body:
        return "", ""

    spoken_lines: List[str] = []
    silent_lines: List[str] = []
    section: Optional[str] = None

    for line in body.splitlines():
        marker = line.strip()
        if marker == "[SPOKEN]":
            section = "spoken"
            continue
        if marker == "[SILENT]":
            section = "silent"
            continue
        if section == "spoken":
            spoken_lines.append(line)
        elif section == "silent":
            silent_lines.append(line)

    spoken_text = "\n".join(spoken_lines).strip()
    silent_text = "\n".join(silent_lines).strip()

    # Clean up artifacts from spoken text
    if spoken_text:
        # Remove leading triple backticks if present (multi-line aware)
        spoken_text = re.sub(r"^[`'\"]{1,3}\s*", "", spoken_text)
        # Remove leading "json" label if mixed in
        spoken_text = re.sub(r"^(?:json|python)\s*", "", spoken_text, flags=re.IGNORECASE)

    if not spoken_text and not silent_text:
        fallback = body.strip()
        # Apply same cleaning to fallback
        fallback = re.sub(r"^`{1,3}\s*", "", fallback)
        fallback = re.sub(r"^json\s*", "", fallback, flags=re.IGNORECASE)
        # Remove trailing backticks too
        fallback = re.sub(r"\s*`{1,3}$", "", fallback)
        return fallback, ""

    return spoken_text, silent_text


def _coerce_response(content: str) -> Dict[str, Any]:
    header, body = _split_header_body(content)
    memory_note = str(header.get("memory_note", "")).strip() if header else ""
    thinking_summary = (
        str(header.get("thinking_summary", "")).strip() if header else ""
    )
    # If summary came back as a python list string rep (e.g. "['item']") clean it
    if thinking_summary.startswith("[") and thinking_summary.endswith("]"):
        try:
            # Simple heuristic cleanup instead of dangerous eval
            inner = thinking_summary[1:-1]
            parts = [p.strip().strip("'\"") for p in inner.split(",")]
            thinking_summary = " ".join(parts)
        except Exception:
            pass

    if header and ("assistant_text" in header or "speak" in header):
        assistant_text = str(header.get("assistant_text", "")).strip()
        speak = bool(header.get("speak", True))
        if speak:
            spoken_text = assistant_text
            # Clean up artifacts if they leaked into the JSON field
            spoken_text = re.sub(r"^[`'\"]{1,3}\s*", "", spoken_text)
            silent_text = ""
        else:
            spoken_text = ""
            silent_text = assistant_text
        return {
            "spoken_text": spoken_text,
            "silent_text": silent_text,
            "memory_note": memory_note,
            "thinking_summary": thinking_summary,
        }

    spoken_text, silent_text = _parse_sections(body)

    return {
        "spoken_text": spoken_text,
        "silent_text": silent_text,
        "memory_note": memory_note,
        "thinking_summary": thinking_summary,
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    screenshot_followup = bool(request.screenshot_followup)
    if not user_text and not has_image:
        raise HTTPException(status_code=400, detail="Text or image is required")
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model

    if (
        user_text
        and not has_image
        and not hidden
        and not screenshot_followup
        and user_text != "[Thinking Tick]"
    ):
        request_screenshot, reason = _decide_screenshot_request(
            user_text, selected_model, provider
        )
        if request_screenshot:
            store.add_message(
                session_id,
                "user",
                user_text or "[Image]",
                None,
            )
            return ChatResponse(
                session_id=session_id,
                assistant_text="",
                silent_text="",
                speak=False,
                memory_used=[],
                thinking_summary="",
                search_query="",
                search_results=[],
                provider=provider,
                request_screenshot=True,
                request_reason=reason,
            )

    recent = store.get_recent(session_id, limit=8)

    try:
        user_embedding = _ollama_embeddings(user_text) if user_text else []
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

    memories = store.search(user_embedding, top_k=4) if user_embedding else []
    memory_lines = [
        f"[{item['role']}] {item['content']}" for item in memories if item.get("content")
    ]

    search_query = _decide_search_query(user_text, selected_model, provider)
    search_results = _searxng_search(search_query, SEARXNG_RESULTS)
    search_block = _format_search_results(search_query, search_results)

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _current_time_context()},
    ]
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
    if memory_lines:
        memory_block = "Relevant memory snippets:\n" + "\n".join(
            f"- {line}" for line in memory_lines
        )
        messages.append({"role": "system", "content": memory_block})

    messages.extend(recent)
    if search_block:
        messages.append({"role": "system", "content": search_block})
    prompt_text = user_text or "Please describe the image."
    user_message = {"role": "user", "content": prompt_text}
    if has_image:
        user_message["images"] = [image_base64]
    messages.append(user_message)

    try:
        raw_content = _llm_chat(messages, selected_model, provider)
    except (requests.RequestException, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail=f"Chat error: {exc}")

    parsed = _coerce_response(raw_content)

    if not hidden and user_text != "[Thinking Tick]":
        store.add_message(
            session_id,
            "user",
            user_text or "[Image]",
            user_embedding if user_embedding else None,
        )

    spoken_text = parsed.get("spoken_text", "")
    silent_text = parsed.get("silent_text", "")

    # Don't store AI responses to thinking ticks in memory
    is_thinking_tick = user_text == "[Thinking Tick]"
    
    if spoken_text and not is_thinking_tick:
        try:
            assistant_embedding = _ollama_embeddings(spoken_text)
        except requests.RequestException:
            assistant_embedding = []
        store.add_message(session_id, "assistant", spoken_text, assistant_embedding)

    memory_note = parsed.get("memory_note", "")
    if memory_note and not is_thinking_tick:
        try:
            memory_embedding = _ollama_embeddings(memory_note)
        except requests.RequestException:
            memory_embedding = []
        store.add_message(session_id, "memory", memory_note, memory_embedding)

    return ChatResponse(
        session_id=session_id,
        assistant_text=spoken_text,
        silent_text=silent_text,
        speak=bool(spoken_text),
        memory_used=memory_lines,
        thinking_summary=str(parsed.get("thinking_summary", "")),
        search_query=search_query,
        search_results=search_results,
        provider=provider,
    )


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    session_id = request.session_id or str(uuid.uuid4())
    user_text = (request.text or "").strip()
    image_base64 = (request.image_base64 or "").strip()
    has_image = bool(image_base64)
    hidden = bool(request.hidden)
    screenshot_followup = bool(request.screenshot_followup)
    if not user_text and not has_image:
        raise HTTPException(status_code=400, detail="Text or image is required")
    provider = _normalize_provider(request.provider)
    default_model = _default_model(provider)
    selected_model = (request.model or default_model).strip() or default_model

    if (
        user_text
        and not has_image
        and not hidden
        and not screenshot_followup
        and user_text != "[Thinking Tick]"
    ):
        request_screenshot, reason = _decide_screenshot_request(
            user_text, selected_model, provider
        )
        if request_screenshot:
            store.add_message(
                session_id,
                "user",
                user_text or "[Image]",
                None,
            )

            def generate_request() -> Iterable[str]:
                meta = {
                    "type": "meta",
                    "session_id": session_id,
                    "memory_used": [],
                    "thinking_summary": "",
                    "search_query": "",
                    "search_results": [],
                    "provider": provider,
                }
                yield json.dumps(meta) + "\n"
                yield json.dumps(
                    {"type": "request_screenshot", "reason": reason}
                ) + "\n"
                yield json.dumps(
                    {"type": "done", "spoken_text": "", "silent_text": ""}
                ) + "\n"

            return StreamingResponse(
                generate_request(), media_type="application/x-ndjson"
            )

    try:
        user_embedding = _ollama_embeddings(user_text) if user_text else []
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}")

    recent = store.get_recent(session_id, limit=8)

    memories = store.search(user_embedding, top_k=4) if user_embedding else []
    memory_lines = [
        f"[{item['role']}] {item['content']}" for item in memories if item.get("content")
    ]

    search_query = _decide_search_query(user_text, selected_model, provider)
    search_results = _searxng_search(search_query, SEARXNG_RESULTS)
    search_block = _format_search_results(search_query, search_results)

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _current_time_context()},
    ]
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
    if memory_lines:
        memory_block = "Relevant memory snippets:\n" + "\n".join(
            f"- {line}" for line in memory_lines
        )
        messages.append({"role": "system", "content": memory_block})

    messages.extend(recent)
    if search_block:
        messages.append({"role": "system", "content": search_block})
    prompt_text = user_text or "Please describe the image."
    user_message = {"role": "user", "content": prompt_text}
    if has_image:
        user_message["images"] = [image_base64]
    messages.append(user_message)

    def generate() -> Iterable[str]:
        header_parsed = False
        memory_note = ""
        thinking_summary = ""
        buffer = ""
        body_buffer = ""
        spoken_chunks: List[str] = []
        silent_chunks: List[str] = []
        section: Optional[str] = None
        meta_sent = False
        markers = ["[SPOKEN]", "[SILENT]"]
        max_marker_len = max(len(marker) for marker in markers)

        def emit_tokens(kind: str, text: str) -> Iterable[str]:
            if not text:
                return []
            if kind == "spoken":
                spoken_chunks.append(text)
            elif kind == "silent":
                silent_chunks.append(text)
            return [json.dumps({"type": "token", "channel": kind, "text": text}) + "\n"]

        def drain_buffer(force: bool = False) -> Iterable[str]:
            nonlocal body_buffer, section
            output: List[str] = []
            while body_buffer:
                idx_spoken = body_buffer.find("[SPOKEN]")
                idx_silent = body_buffer.find("[SILENT]")
                indices = [i for i in [idx_spoken, idx_silent] if i != -1]
                next_idx = min(indices) if indices else -1

                if section is None:
                    if next_idx == -1:
                        if force or len(body_buffer) > max_marker_len:
                            cutoff = (
                                len(body_buffer)
                                if force
                                else len(body_buffer) - max_marker_len
                            )
                            chunk = body_buffer[:cutoff]
                            body_buffer = body_buffer[cutoff:]
                            output.extend(emit_tokens("spoken", chunk))
                        break
                    if next_idx > 0:
                        chunk = body_buffer[:next_idx]
                        output.extend(emit_tokens("spoken", chunk))
                    marker = body_buffer[next_idx : next_idx + len("[SPOKEN]")]
                    section = "spoken" if marker == "[SPOKEN]" else "silent"
                    body_buffer = body_buffer[next_idx + len(marker) :].lstrip("\r\n")
                    continue

                if next_idx == -1:
                    if force or len(body_buffer) > max_marker_len:
                        cutoff = (
                            len(body_buffer)
                            if force
                            else len(body_buffer) - max_marker_len
                        )
                        chunk = body_buffer[:cutoff]
                        body_buffer = body_buffer[cutoff:]
                        output.extend(emit_tokens(section, chunk))
                    break

                chunk = body_buffer[:next_idx]
                output.extend(emit_tokens(section, chunk))
                marker = body_buffer[next_idx : next_idx + len("[SPOKEN]")]
                section = "spoken" if marker == "[SPOKEN]" else "silent"
                body_buffer = body_buffer[next_idx + len(marker) :].lstrip("\r\n")
            return output

        try:
            for chunk in _llm_chat_stream(messages, selected_model, provider):
                if not header_parsed:
                    buffer += chunk
                    fenced = re.match(r"\s*```(?:json)?\s*", buffer)
                    if fenced:
                        stripped = buffer[fenced.end() :]
                        prefix, rest = _split_json_prefix(stripped)
                        if prefix:
                            header = _parse_header_block(prefix)
                            if header:
                                memory_note = str(
                                    header.get("memory_note", "")
                                ).strip()
                                thinking_summary = str(
                                    header.get("thinking_summary", "")
                                ).strip()
                                body_buffer = rest.lstrip("\r\n ")
                                header_parsed = True
                    if not header_parsed:
                        sep_idx = buffer.find("\n\n")
                        sep_len = 2
                        if sep_idx == -1:
                            sep_idx = buffer.find("\r\n\r\n")
                            sep_len = 4
                        if sep_idx == -1:
                            newline_idx = buffer.find("\n")
                            if newline_idx == -1:
                                prefix, rest = _split_json_prefix(buffer)
                                if not prefix:
                                    continue
                                header = _parse_header_block(prefix)
                                if not header:
                                    continue
                                memory_note = str(
                                    header.get("memory_note", "")
                                ).strip()
                                thinking_summary = str(
                                    header.get("thinking_summary", "")
                                ).strip()
                                body_buffer = rest.lstrip("\r\n ")
                                header_parsed = True
                            else:
                                header_candidate = buffer[:newline_idx].strip()
                                header = _parse_header_block(header_candidate)
                                if not header:
                                    continue
                                memory_note = str(
                                    header.get("memory_note", "")
                                ).strip()
                                thinking_summary = str(
                                    header.get("thinking_summary", "")
                                ).strip()
                                body_buffer = buffer[newline_idx + 1 :].lstrip("\r\n")
                                header_parsed = True
                        else:
                            header_block = buffer[:sep_idx]
                            header = _parse_header_block(header_block)
                            if header:
                                memory_note = str(
                                    header.get("memory_note", "")
                                ).strip()
                                thinking_summary = str(
                                    header.get("thinking_summary", "")
                                ).strip()
                            body_buffer = buffer[sep_idx + sep_len :].lstrip("\r\n")
                            header_parsed = True

                    meta = {
                        "type": "meta",
                        "session_id": session_id,
                        "memory_used": memory_lines,
                        "thinking_summary": thinking_summary,
                        "search_query": search_query,
                        "search_results": search_results,
                        "provider": provider,
                    }
                    yield json.dumps(meta) + "\n"
                    meta_sent = True
                    buffer = ""
                    if body_buffer:
                        for output in drain_buffer():
                            yield output
                    continue

                if chunk:
                    body_buffer += chunk
                    for output in drain_buffer():
                        yield output

            if not header_parsed:
                header_parsed = True
                meta = {
                    "type": "meta",
                    "session_id": session_id,
                    "memory_used": memory_lines,
                    "thinking_summary": "",
                    "search_query": search_query,
                    "search_results": search_results,
                    "provider": provider,
                }
                yield json.dumps(meta) + "\n"
                meta_sent = True
                body_buffer = buffer
                buffer = ""
                if body_buffer:
                    for output in drain_buffer():
                        yield output

            if body_buffer:
                for output in drain_buffer(force=True):
                    yield output

            spoken_text = "".join(spoken_chunks).strip()
            silent_text = "".join(silent_chunks).strip()

            if not hidden and user_text != "[Thinking Tick]":
                store.add_message(
                    session_id,
                    "user",
                    user_text or "[Image]",
                    user_embedding if user_embedding else None,
                )

            if spoken_text:
                try:
                    assistant_embedding = _ollama_embeddings(spoken_text)
                except requests.RequestException:
                    assistant_embedding = []
                store.add_message(
                    session_id, "assistant", spoken_text, assistant_embedding
                )

            if memory_note:
                try:
                    memory_embedding = _ollama_embeddings(memory_note)
                except requests.RequestException:
                    memory_embedding = []
                store.add_message(session_id, "memory", memory_note, memory_embedding)

            if meta_sent:
                yield json.dumps(
                    {
                        "type": "done",
                        "spoken_text": spoken_text,
                        "silent_text": silent_text,
                    }
                ) + "\n"
        except requests.RequestException as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"
        except RuntimeError as exc:
            yield json.dumps({"type": "error", "detail": str(exc)}) + "\n"

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
