const micStatus = document.getElementById("micStatus");
const sessionStatus = document.getElementById("sessionStatus");
const chatLog = document.getElementById("chatLog");
const interimText = document.getElementById("interimText");
const modelSelect = document.getElementById("modelSelect");
const modelStatus = document.getElementById("modelStatus");
const providerBadge = document.getElementById("providerBadge");
const voiceSelect = document.getElementById("voiceSelect");
const voiceTestBtn = document.getElementById("voiceTestBtn");
const voicePill = document.querySelector(".voice-pill");
const ttsToggle = document.getElementById("ttsToggle");
const ttsProviderToggle = document.getElementById("ttsProviderToggle");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const newChatBtn = document.getElementById("newChatBtn");
const sendBtn = document.getElementById("sendBtn");
const textInput = document.getElementById("textInput");
const imageInput = document.getElementById("imageInput");
const imageUploadBtn = document.getElementById("imageUploadBtn");
const imageClearBtn = document.getElementById("imageClearBtn");
const imagePreview = document.getElementById("imagePreview");
const screenStatus = document.getElementById("screenStatus");
const screenCaptureBtn = document.getElementById("screenCaptureBtn");
const idleCaptureToggle = document.getElementById("idleCaptureToggle");
const layout = document.getElementById("layout");
const sessionToggle = document.getElementById("sessionToggle");
const sessionPanel = document.getElementById("sessionPanel");
const sessionClose = document.getElementById("sessionClose");
const sessionList = document.getElementById("sessionList");
const sessionNewBtn = document.getElementById("sessionNewBtn");
const providerToggle = document.getElementById("providerToggle");
const thinkingToggle = document.getElementById("thinkingToggle");
const thinkingPanel = document.getElementById("thinkingPanel");
const thinkingClose = document.getElementById("thinkingClose");
const thinkingSilentList = document.getElementById("thinkingSilentList");
const thinkingToolCalls = document.getElementById("thinkingToolCalls");
const thinkingScreenshot = document.getElementById("thinkingScreenshot");
const thinkingTokenEstimate = document.getElementById("thinkingTokenEstimate");
const thinkingVramLabel = document.getElementById("thinkingVramLabel");
const thinkingVramArc = document.getElementById("thinkingVramArc");
const thinkingContextToggle = document.getElementById("contextToggle");
const thinkingContextBody = document.getElementById("thinkingContext");
const rawOutputToggle = document.getElementById("rawOutputToggle");
const rawOutputBody = document.getElementById("thinkingRawOutput");
const settingsBtn = document.getElementById("settingsBtn");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsClose = document.getElementById("settingsClose");
const searchMethodToggle = document.getElementById("searchMethodToggle");
const personalitySelect = document.getElementById("personalitySelect");
const sessionNewPersonalityBtn = document.getElementById("sessionNewPersonalityBtn");
const personalityPicker = document.getElementById("personalityPicker");
const personalityPickerSelect = document.getElementById("personalityPickerSelect");
const personalityPickerCreate = document.getElementById("personalityPickerCreate");
const personalityPickerCancel = document.getElementById("personalityPickerCancel");
const personalityAddBtn = document.getElementById("personalityAddBtn");
const personalityList = document.getElementById("personalityList");
const personalityEditor = document.getElementById("personalityEditor");
const settingsMain = document.getElementById("settingsMain");
const personalityEditorTitle = document.getElementById("personalityEditorTitle");
const peNameInput = document.getElementById("peNameInput");
const peToneInput = document.getElementById("peToneInput");
const peTtsProviderToggle = document.getElementById("peTtsProviderToggle");
const peTtsVoiceSelect = document.getElementById("peTtsVoiceSelect");
const peSeparateMemory = document.getElementById("peSeparateMemory");
const peSaveBtn = document.getElementById("peSaveBtn");
const peCancelBtn = document.getElementById("peCancelBtn");
const kokoroToggleBtn = document.getElementById("kokoroToggleBtn");
const kokoroStatusDot = document.getElementById("kokoroStatusDot");
const kokoroStatusText = document.getElementById("kokoroStatusText");
const hdrKokoroDot = document.getElementById("hdrKokoroDot");
const comfyuiToggleBtn = document.getElementById("comfyuiToggleBtn");
const comfyuiStatusDot = document.getElementById("comfyuiStatusDot");
const comfyuiStatusText = document.getElementById("comfyuiStatusText");
const hdrComfyuiDot = document.getElementById("hdrComfyuiDot");
const comfyuiCheckpointSelect = document.getElementById("comfyuiCheckpointSelect");
const comfyuiRefreshModelsBtn = document.getElementById("comfyuiRefreshModelsBtn");
const comfyuiModelSettingsForm = document.getElementById("comfyuiModelSettingsForm");
const comfyuiStepsInput = document.getElementById("comfyuiStepsInput");
const comfyuiCfgInput = document.getElementById("comfyuiCfgInput");
const comfyuiSamplerInput = document.getElementById("comfyuiSamplerInput");
const comfyuiSchedulerInput = document.getElementById("comfyuiSchedulerInput");
const comfyuiResolutionList = document.getElementById("comfyuiResolutionList");
const comfyuiAddResolutionBtn = document.getElementById("comfyuiAddResolutionBtn");
const comfyuiWorkflowJsonTextarea = document.getElementById("comfyuiWorkflowJsonTextarea");
const comfyuiValidateWorkflowBtn = document.getElementById("comfyuiValidateWorkflowBtn");
const comfyuiValidateResult = document.getElementById("comfyuiValidateResult");
const comfyuiSaveSettingsBtn = document.getElementById("comfyuiSaveSettingsBtn");
const serviceToasts = document.getElementById("serviceToasts");
const sessionScrim = document.getElementById("sessionScrim");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Set to true by React (main.jsx) once the ChatWorkspace is mounted.
// When true, DOM chat-log mutations are bypassed in favour of custom events.
window.__chatReactActive = false;

let recognition = null;
let isListening = false;
let isSessionPanelOpen = false;
let sessionId = null;
let pendingTranscript = "";
let sendTimeoutId = null;
let speechBuffer = "";
let attachedImage = null;
let screenStream = null;
let screenVideo = null;
let idleCaptureEnabled = false;
let socialModeEnabled = localStorage.getItem('socialModeEnabled') === 'true';
let idleCaptureTimerId = null;
let idleCaptureInProgress = false;
let lastSpeechTime = Date.now();
let activeAbortController = null;

function setProcessing(active) {
  if (!sendBtn) return;
  if (active) {
    sendBtn.textContent = "Cancel";
    sendBtn.classList.add("cancel");
  } else {
    sendBtn.textContent = "Send";
    sendBtn.classList.remove("cancel");
  }
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { isProcessing: active } }));
}

function cancelActiveRequest() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  setProcessing(false);
  hideTypingIndicator();
  if (_generatingStatusItem && _generatingStatusItem.parentNode) {
    _generatingStatusItem.parentNode.removeChild(_generatingStatusItem);
    _generatingStatusItem = null;
  }
  interimText.textContent = "";
}
let IDLE_CAPTURE_MS = 60000;
const MAX_SCREEN_WIDTH = 1280;
const SCREENSHOT_REQUEST_TOKEN = "[REQUEST_SCREENSHOT]";
let currentProvider = "ollama";
const PROVIDER_LABELS = {
  ollama: "Local",
  openrouter: "API",
};
const CHAT_HISTORY_LIMIT = 10;
let ttsEnabled = true;
let ttsProvider = "browser";
const TTS_PROVIDER_LABELS = {
  browser: "Browser",
  kokoro: "Kokoro",
};
const TTS_PROVIDER_STORAGE_KEY = "ttsProvider";
const TTS_VOICE_BROWSER_KEY = "ttsVoice";
const TTS_VOICE_KOKORO_KEY = "ttsVoiceKokoro";
let kokoroVoices = [];
let kokoroVoicesLoaded = false;
let kokoroQueue = [];
let kokoroPlaying = false;
let kokoroGeneration = 0;
let kokoroAbortController = null; // unused, kept for compatibility
let kokoroCurrentAudio = null;
const SESSION_STORAGE_KEY = "chatSessions";
const SEARCH_METHOD_KEY = "searchMethod";
let searchMethod = localStorage.getItem(SEARCH_METHOD_KEY) || "searxng";
const CHAT_MAX_HISTORY_KEY = "chatMaxHistory";
const CONTEXT_MAX_TOKENS_KEY = "contextMaxTokens";
let chatMaxHistory = parseInt(localStorage.getItem(CHAT_MAX_HISTORY_KEY) || "20", 10);
let contextMaxTokens = parseInt(localStorage.getItem(CONTEXT_MAX_TOKENS_KEY) || "4000", 10);
const RAG_TOP_K_KEY = "ragTopK";
let ragTopK = parseInt(localStorage.getItem(RAG_TOP_K_KEY) || "4", 10);
const PERSONALITIES_KEY = "personalities";
const ACTIVE_PERSONALITY_KEY = "activePersonality";
const DEFAULT_TONE_CONTEXT = `Tone & personality:
- Conversational, relaxed, human. Mild humor/opinions welcome.
- Avoid \u201cassistant voice.\u201d Avoid narrating the screen.
- Spoken responses should usually be 1-2 sentences, sometimes 3.`;
const DEFAULT_PERSONALITY = {
  id: "default",
  name: "Default",
  toneContext: "",
  ttsProvider: "browser",
  ttsVoice: "",
  separateMemory: false,
};
let personalities = [];
let activePersonalityId = "default";
let peEditingId = null;  // null = adding new, string = editing existing
let peTtsProvider = "browser";
let editingSessionId = null;
let editingSessionDraft = "";
let screenshotRequestInProgress = false;
let lastUserPrompt = "";
let contextDebugText = "";
let contextVisible = false;
let rawOutputText = "";
let rawOutputVisible = false;
let pendingScreenshotDataUrl = "";
let pendingScreenshotLabel = "";

// ---------------------------------------------------------------------------
// Backend config cache
// ---------------------------------------------------------------------------
let _backendConfig = null;

function _cfg(key, fallback) {
  if (_backendConfig !== null && Object.prototype.hasOwnProperty.call(_backendConfig, key))
    return _backendConfig[key];
  return fallback;
}

async function loadBackendConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      _backendConfig = await res.json();
      window._backendConfig = _backendConfig;
    }
  } catch (_) {}
}

async function saveConfigKey(key, value) {
  try {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  } catch (_) {}
}

// Session cache
let _sessionCache = [];
let _backendSessionsLoaded = false;

async function refreshSessionCache() {
  try {
    const res = await fetch('/api/sessions');
    if (res.ok) {
      _sessionCache = await res.json();
      _backendSessionsLoaded = true;
      return;
    }
  } catch (_) {}
  // Fallback: populate from localStorage only on network error
  if (!_backendSessionsLoaded) {
    try {
      const stored = JSON.parse(localStorage.getItem('chatSessions') || '[]');
      if (Array.isArray(stored)) _sessionCache = stored;
    } catch (_) {}
  }
}

async function upsertSessionToBackend(session) {
  try {
    await fetch('/api/sessions/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  } catch (_) {}
}

function isSpeechActive() {
  // Check if user is actively speaking (has pending transcript)
  if (pendingTranscript) {
    return true;
  }
  // Check if TTS is currently speaking
  if (ttsProvider === "browser" && window.speechSynthesis && speechSynthesis.speaking) {
    return true;
  }
  if (
    ttsProvider === "kokoro" &&
    kokoroCurrentAudio &&
    !kokoroCurrentAudio.paused
  ) {
    return true;
  }
  return false;
}

function loadSession() {
  const stored = localStorage.getItem("sessionId");
  if (stored) {
    ensureSessionEntry(stored);
    setSessionStatusById(stored);
    return stored;
  }
  return newSession();
}

function newSession() {
  const newId = crypto.randomUUID();
  sessionId = newId;
  localStorage.setItem("sessionId", newId);
  ensureSessionEntry(newId);
  const now = Date.now();
  const newSessionObj = { id: newId, name: defaultSessionName(newId), createdAt: now, updatedAt: now };
  _sessionCache = _sessionCache.filter(s => s.id !== newId);
  _sessionCache.unshift(newSessionObj);
  upsertSessionToBackend(newSessionObj);
  setSessionStatusById(newId);
  editingSessionId = null;
  editingSessionDraft = "";
  chatLog.innerHTML = "";
  if (window.__chatReactActive) window.dispatchEvent(new CustomEvent('chat:clear', {}));
  updateThinkingPanel([]);
  clearThinkingMessages();
  setThinkingContext("");
  setRawOutput("");
  setThinkingScreenshot("", "");
  clearImage();
  clearChatHistory(newId);
  renderSessionList();
  return newId;
}

function setMic(text) {
  micStatus.textContent = text;
  const active =
    typeof text === "string" &&
    text.toLowerCase().includes("listening");
  micStatus.classList.toggle("active", active);
}

function setModelStatus(text) {
  if (!modelStatus) {
    return;
  }
  modelStatus.textContent = text;
}

function setProviderBadge(provider) {
  if (!providerBadge) {
    return;
  }
  const normalized = normalizeProvider(provider);
  providerBadge.textContent = `Provider: ${providerLabel(normalized)}`;
  providerBadge.dataset.provider = normalized;
}

function setScreenStatus(text) {
  if (!screenStatus) {
    return;
  }
  screenStatus.textContent = text;
}

function setTtsEnabled(enabled) {
  ttsEnabled = enabled;
  if (ttsToggle) {
    ttsToggle.textContent = enabled ? "TTS: on" : "TTS: off";
    ttsToggle.setAttribute("aria-pressed", String(enabled));
    ttsToggle.classList.toggle("active", enabled);
  }
  updateTtsControls();
  localStorage.setItem("ttsEnabled", String(enabled));
  if (!enabled) {
    stopTtsPlayback();
  }
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { ttsOn: enabled } }));
}

function normalizeProvider(value) {
  const candidate = (value || "").trim().toLowerCase();
  if (candidate === "openrouter" || candidate === "ollama") {
    return candidate;
  }
  return "ollama";
}

function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || "Local";
}

function normalizeTtsProvider(value) {
  const candidate = (value || "").trim().toLowerCase();
  if (candidate === "kokoro" || candidate === "browser") {
    return candidate;
  }
  return "browser";
}

function ttsProviderLabel(provider) {
  return TTS_PROVIDER_LABELS[provider] || "Browser";
}

function getTtsVoiceStorageKey(provider) {
  return provider === "kokoro" ? TTS_VOICE_KOKORO_KEY : TTS_VOICE_BROWSER_KEY;
}

function updateTtsControls() {
  const hasVoices =
    ttsProvider === "browser"
      ? Boolean(window.speechSynthesis && speechSynthesis.getVoices().length)
      : kokoroVoices.length > 0;
  if (voiceSelect) {
    voiceSelect.disabled = !hasVoices;
  }
  if (voiceTestBtn) {
    voiceTestBtn.disabled = !hasVoices;
  }
}


function getModelStorageKey(provider) {
  return provider === "openrouter" ? "openrouterModel" : "ollamaModel";
}

function updateProviderButtons(provider) {
  if (!providerToggle) {
    return;
  }
  const buttons = providerToggle.querySelectorAll("button[data-provider]");
  buttons.forEach((button) => {
    const isActive = button.dataset.provider === provider;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function defaultSessionName(id) {
  if (!id) {
    return "Session";
  }
  return `Session ${id.slice(0, 8)}`;
}

function getSessions() {
  let sessions = [];
  try {
    sessions = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "[]");
  } catch (error) {
    sessions = [];
  }
  return Array.isArray(sessions) ? sessions : [];
}

function saveSessions(sessions) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
}

function ensureSessionEntry(id, personalityId) {
  if (!id) {
    return null;
  }
  const sessions = getSessions();
  let entry = sessions.find((session) => session.id === id);
  if (!entry) {
    const now = Date.now();
    entry = {
      id,
      name: defaultSessionName(id),
      createdAt: now,
      updatedAt: now,
    };
    if (personalityId) entry.personalityId = personalityId;
    sessions.push(entry);
    saveSessions(sessions);
  }
  return entry;
}

function getSessionPersonalityId(sessionId) {
  const sessions = getSessions();
  const entry = sessions.find((s) => s.id === sessionId);
  return entry ? (entry.personalityId || null) : null;
}

function applySessionPersonalityLock(sid) {
  const lockedId = getSessionPersonalityId(sid);
  if (lockedId) {
    const p = personalities.find((x) => x.id === lockedId);
    if (p) {
      activePersonalityId = lockedId;
      localStorage.setItem(ACTIVE_PERSONALITY_KEY, lockedId);
      applyPersonalityTts(p);
      renderPersonalitySelect();
    }
  }
  if (personalitySelect) {
    personalitySelect.disabled = !!lockedId;
  }
}

function touchSession(id) {
  if (!id) {
    return;
  }
  const sessions = getSessions();
  const now = Date.now();
  let entry = sessions.find((session) => session.id === id);
  if (!entry) {
    entry = {
      id,
      name: defaultSessionName(id),
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(entry);
  } else {
    entry.updatedAt = now;
  }
  saveSessions(sessions);
  if (
    sessionPanel &&
    isSessionPanelOpen &&
    !editingSessionId
  ) {
    renderSessionList();
  }
}

function getSessionName(id) {
  if (!id) {
    return "Session";
  }
  const sessions = getSessions();
  const entry = sessions.find((session) => session.id === id);
  return entry && entry.name ? entry.name : defaultSessionName(id);
}

function setSessionStatusById(id) {
  if (!sessionStatus) {
    return;
  }
  sessionStatus.textContent = `Session: ${getSessionName(id)}`;
}

function formatSessionMeta(entry) {
  const updatedAt = entry.updatedAt || entry.createdAt;
  if (!updatedAt) {
    return entry.id.slice(0, 8);
  }
  const stamp = new Date(updatedAt).toLocaleString();
  return `${entry.id.slice(0, 8)} â€¢ ${stamp}`;
}

function renameSession(id, name) {
  const trimmed = (name || "").trim();
  if (!id || !trimmed) {
    return;
  }
  const sessions = getSessions();
  const entry = sessions.find((session) => session.id === id);
  if (!entry) {
    return;
  }
  entry.name = trimmed.slice(0, 60);
  entry.updatedAt = Date.now();
  saveSessions(sessions);
  // Update _sessionCache
  const cacheEntry = _sessionCache.find(s => s.id === id);
  if (cacheEntry) {
    cacheEntry.name = entry.name;
    cacheEntry.updatedAt = entry.updatedAt;
  }
  upsertSessionToBackend(entry);
  if (id === sessionId) {
    setSessionStatusById(id);
  }
  renderSessionList();
}

function switchSession(id) {
  if (!id || id === sessionId) {
    return;
  }
  sessionId = id;
  localStorage.setItem("sessionId", id);
  ensureSessionEntry(id);
  setSessionStatusById(id);
  applySessionPersonalityLock(id);
  editingSessionId = null;
  editingSessionDraft = "";
  pendingTranscript = "";
  interimText.textContent = "...";
  chatLog.innerHTML = "";
  if (window.__chatReactActive) window.dispatchEvent(new CustomEvent('chat:clear', {}));
  updateThinkingPanel([]);
  clearThinkingMessages();
  setThinkingContext("");
  setRawOutput("");
  setThinkingScreenshot("", "");
  loadChatHistory();
  renderSessionList();
}

function renderSessionList() {
  if (!sessionList) {
    return;
  }
  const sessions = _sessionCache.slice().sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
  sessionList.innerHTML = "";
  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = "No sessions yet.";
    sessionList.appendChild(empty);
    return;
  }

  sessions.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "session-item";
    item.dataset.sessionId = entry.id;
    if (entry.id === sessionId) {
      item.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "session-main";

    if (editingSessionId === entry.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "session-input";
      input.value = editingSessionDraft || entry.name || defaultSessionName(entry.id);
      input.addEventListener("input", () => {
        editingSessionDraft = input.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          editingSessionId = null;
          editingSessionDraft = "";
          renameSession(entry.id, input.value);
        }
        if (event.key === "Escape") {
          editingSessionId = null;
          editingSessionDraft = "";
          renderSessionList();
        }
      });
      main.appendChild(input);
    } else {
      const name = document.createElement("div");
      name.className = "session-name";
      name.textContent = entry.name || defaultSessionName(entry.id);
      main.appendChild(name);
    }

    const meta = document.createElement("div");
    meta.className = "session-meta";
    meta.textContent = formatSessionMeta(entry);
    main.appendChild(meta);

    if (entry.personalityId) {
      const p = personalities.find((x) => x.id === entry.personalityId);
      const badge = document.createElement("div");
      badge.className = "session-personality-badge";
      badge.textContent = p ? `\uD83E\uDDE0 ${p.name}` : "\uD83E\uDDE0 Personality";
      main.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "session-item-actions";

    if (editingSessionId === entry.id) {
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "small";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const nextName = editingSessionDraft;
        editingSessionId = null;
        editingSessionDraft = "";
        renameSession(entry.id, nextName);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "small ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingSessionId = null;
        editingSessionDraft = "";
        renderSessionList();
      });

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
    } else {
      item.style.cursor = "pointer";
      item.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        switchSession(entry.id);
      });

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "small ghost";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => {
        editingSessionId = entry.id;
        editingSessionDraft = entry.name || defaultSessionName(entry.id);
        renderSessionList();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "small danger ghost";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        deleteSession(entry.id);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
    }

    item.appendChild(main);
    item.appendChild(actions);
    sessionList.appendChild(item);
  });
}

function deleteSession(id) {
  if (!id) {
    return;
  }
  const name = getSessionName(id);
  const confirmDelete = window.confirm(
    `Delete session "${name}"? This will also delete all images generated in this session and cannot be undone.`
  );
  if (!confirmDelete) {
    return;
  }

  const personalityId = getSessionPersonalityId(id);
  const params = personalityId ? `?personality_id=${encodeURIComponent(personalityId)}` : "";
  fetch(`/api/session/${encodeURIComponent(id)}${params}`, { method: "DELETE" }).catch(() => {});

  const sessions = getSessions().filter((session) => session.id !== id);
  saveSessions(sessions);
  _sessionCache = _sessionCache.filter(s => s.id !== id);
  clearChatHistory(id);

  if (editingSessionId === id) {
    editingSessionId = null;
    editingSessionDraft = "";
  }

  if (sessionId === id) {
    if (sessions.length > 0) {
      const next = sessions.sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      )[0];
      switchSession(next.id);
    } else {
      newSession();
    }
    return;
  }

  renderSessionList();
}

function setSessionPanelOpen(open) {
  if (!sessionPanel) {
    return;
  }
  isSessionPanelOpen = open;
  sessionPanel.classList.toggle("open", open);
  sessionPanel.setAttribute("aria-hidden", String(!open));
  if (sessionScrim) {
    sessionScrim.classList.toggle("open", open);
  }
  if (sessionToggle) {
    sessionToggle.classList.toggle("active", open);
    sessionToggle.setAttribute("aria-pressed", String(open));
  }
  localStorage.setItem("sessionPanelOpen", String(open));
  if (open) {
    renderSessionList();
  }
}

function getChatHistoryKey(id) {
  const keyId = id || sessionId;
  if (!keyId) {
    return "";
  }
  return `chatHistory:${keyId}`;
}

function saveOrUpdateImageGroup(saveId, dataUrl) {
  if (!sessionId || !saveId) return;
  _currentImageGroupDataUrls.push(dataUrl);
  const key = getChatHistoryKey(sessionId);
  if (!key) return;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch(_) { history = []; }
  if (!Array.isArray(history)) history = [];
  const activePersonalityName = getActivePersonality().name;
  const entry = { role: "assistant", text: "[Generated images]", groupId: saveId, imageDataUrls: [..._currentImageGroupDataUrls], personalityName: activePersonalityName !== "default" ? activePersonalityName : undefined };
  const idx = history.findIndex(e => e.groupId === saveId);
  if (idx >= 0) {
    history[idx] = entry;
  } else {
    history.push(entry);
    if (history.length > CHAT_HISTORY_LIMIT) history = history.slice(-CHAT_HISTORY_LIMIT);
  }
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch(_) {
    const fallback = history.map(e => e.groupId === saveId ? { role: e.role, text: e.text, groupId: e.groupId } : e);
    try { localStorage.setItem(key, JSON.stringify(fallback)); } catch(_2) {}
  }
  // Persist to backend
  const activeP = getActivePersonality();
  const params = activeP.id && activeP.id !== 'default' ? `?personality_id=${encodeURIComponent(activeP.id)}` : '';
  fetch(`/api/session/${encodeURIComponent(sessionId)}/image-group${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId: saveId, imageDataUrls: [..._currentImageGroupDataUrls], personalityName: entry.personalityName }),
  }).catch(() => {});
  touchSession(sessionId);
}

function createImageGroupItem(role, dataUrls, personalityName) {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : (personalityName && personalityName !== "default" ? personalityName : "Assistant");
  if (personalityName && personalityName !== "default") item.dataset.personality = personalityName;
  const grid = document.createElement("div");
  grid.className = "image-grid";
  grid.dataset.count = String(Math.min(dataUrls.length, 4));

  item.appendChild(meta);
  item.appendChild(grid);

  if (role === "assistant") _applyPersonalityColors(item, meta, personalityName);
  dataUrls.forEach((src, i) => {
    const cell = document.createElement("div");
    cell.className = "image-grid-cell";
    if (i >= 3) cell.style.display = "none";
    const img = document.createElement("img");
    img.src = src;
    img.alt = role === "user" ? "Attached image" : "Generated image";
    img.className = "generated-image";
    cell.appendChild(img);
    if (i === 2 && dataUrls.length > 3) {
      const badge = document.createElement("div");
      badge.className = "image-grid-overflow";
      badge.dataset.overflowBadge = "1";
      badge.textContent = `+${dataUrls.length - 3}`;
      cell.appendChild(badge);
    }
    grid.appendChild(cell);
  });
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function saveChatMessage(role, text, imageDataUrl, personalityName) {
  const trimmed = (text || "").trim();
  if (!trimmed || !sessionId) {
    return;
  }
  const key = getChatHistoryKey(sessionId);
  if (!key) {
    return;
  }
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(key) || "[]");
  } catch (error) {
    history = [];
  }
  if (!Array.isArray(history)) {
    history = [];
  }
  const entry = { role, text: trimmed };
  if (imageDataUrl) entry.imageDataUrl = imageDataUrl;
  if (role === "assistant" && personalityName && personalityName !== "default") entry.personalityName = personalityName;
  history.push(entry);
  if (history.length > CHAT_HISTORY_LIMIT) {
    history = history.slice(-CHAT_HISTORY_LIMIT);
  }
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (_) {
    // Storage quota exceeded â€” retry without image data so at least the text survives
    if (imageDataUrl) {
      const fallback = history.map(e => e === entry ? { role: e.role, text: e.text } : e);
      try { localStorage.setItem(key, JSON.stringify(fallback)); } catch (_2) {}
    }
  }
  touchSession(sessionId);
}

function loadChatHistory() {
  const sid = sessionId;
  if (!sid) {
    if (window.__chatReactActive) window.dispatchEvent(new CustomEvent('chat:reload', {}));
    return;
  }
  // Try to load from backend first
  const activeP = getActivePersonality();
  const params = activeP.id && activeP.id !== 'default' ? `?personality_id=${encodeURIComponent(activeP.id)}` : '';
  fetch(`/api/session/${encodeURIComponent(sid)}/history${params}`)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(rows => {
      if (window.__chatReactActive) {
        window.dispatchEvent(new CustomEvent('chat:reload', {}));
        return;
      }
      chatLog.innerHTML = "";
      rows.forEach((item) => {
        if (!item) return;
        if (item.role === 'image_group') {
          try {
            const data = JSON.parse(item.content || '{}');
            if (data.imageDataUrls && Array.isArray(data.imageDataUrls) && data.imageDataUrls.length > 0) {
              createImageGroupItem('assistant', data.imageDataUrls, data.personalityName);
            }
          } catch (_) {}
          return;
        }
        const role = item.role === "assistant" ? "assistant" : "user";
        let content;
        try { content = JSON.parse(item.content); } catch (_) { content = item.content; }
        const text = typeof content === 'string' ? content : (content && content.text) || item.content || '';
        const imageDataUrl = (content && content.imageDataUrl) || '';
        const personalityName = (content && content.personalityName) || undefined;
        if (!text && !imageDataUrl) return;
        createChatItem(role, text, undefined, imageDataUrl, personalityName);
      });
    })
    .catch(() => {
      // Fallback to localStorage
      const key = getChatHistoryKey(sid);
      if (!key) {
        if (window.__chatReactActive) window.dispatchEvent(new CustomEvent('chat:reload', {}));
        return;
      }
      let history = [];
      try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { history = []; }
      if (!Array.isArray(history) || history.length === 0) {
        if (window.__chatReactActive) window.dispatchEvent(new CustomEvent('chat:reload', {}));
        return;
      }
      if (window.__chatReactActive) {
        window.dispatchEvent(new CustomEvent('chat:reload', {}));
        return;
      }
      chatLog.innerHTML = "";
      history.forEach((item) => {
        if (!item || !item.text) return;
        const role = item.role === "assistant" ? "assistant" : "user";
        if (item.imageDataUrls && Array.isArray(item.imageDataUrls) && item.imageDataUrls.length > 0) {
          createImageGroupItem(role, item.imageDataUrls, item.personalityName);
        } else {
          createChatItem(role, item.text, undefined, item.imageDataUrl || "", item.personalityName);
        }
      });
    });
}

function clearChatHistory(id) {
  const key = getChatHistoryKey(id);
  if (!key) {
    return;
  }
  localStorage.removeItem(key);
}

function markSpeechActivity() {
  lastSpeechTime = Date.now();
}

function setIdleCaptureEnabled(enabled) {
  idleCaptureEnabled = enabled;
  if (idleCaptureToggle) {
    idleCaptureToggle.textContent = enabled
      ? "Idle capture: on"
      : "Idle capture: off";
    idleCaptureToggle.setAttribute("aria-pressed", String(enabled));
  }
  localStorage.setItem("idleCaptureEnabled", String(enabled));
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { idleOn: enabled } }));
}

async function startScreenCapture() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setScreenStatus("Screen: unsupported");
    return;
  }
  if (screenStream) {
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" },
    });
  } catch (error) {
    setScreenStatus("Screen: denied");
    return;
  }

  screenVideo = document.createElement("video");
  screenVideo.srcObject = screenStream;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  try {
    await screenVideo.play();
  } catch (error) {
    setScreenStatus("Screen: ready");
  }

  const [track] = screenStream.getVideoTracks();
  if (track) {
    track.onended = () => {
      stopScreenCapture();
    };
  }
  setScreenStatus("Screen: on");
  if (screenCaptureBtn) {
    screenCaptureBtn.textContent = "Disable screen";
    screenCaptureBtn.classList.add("active");
  }
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { screenOn: true } }));
}

function stopScreenCapture() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
  }
  screenStream = null;
  screenVideo = null;
  setScreenStatus("Screen: off");
  if (screenCaptureBtn) {
    screenCaptureBtn.textContent = "Enable screen";
    screenCaptureBtn.classList.remove("active");
  }
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { screenOn: false } }));
}

function captureScreenBase64() {
  if (!screenVideo || screenVideo.readyState < 2) {
    return "";
  }
  const width = screenVideo.videoWidth;
  const height = screenVideo.videoHeight;
  if (!width || !height) {
    return "";
  }
  const scale = Math.min(1, MAX_SCREEN_WIDTH / width);
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.drawImage(screenVideo, 0, 0, targetWidth, targetHeight);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1] || "";
}

function stripScreenshotRequest(text) {
  if (!text) {
    return { cleaned: "", requested: false };
  }
  const requested = text.includes(SCREENSHOT_REQUEST_TOKEN);
  if (!requested) {
    return { cleaned: text, requested: false };
  }
  const tokenRegex = /^\s*\[REQUEST_SCREENSHOT\]\s*$/gm;
  let cleaned = text.replace(tokenRegex, "");
  cleaned = cleaned.split(SCREENSHOT_REQUEST_TOKEN).join(" ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return { cleaned, requested: true };
}

async function requestScreenshotFromAssistant(options = {}) {
  if (screenshotRequestInProgress) {
    return;
  }
  if (!screenStream || !screenVideo) {
    createChatItem(
      "assistant",
      "Assistant requested a screenshot. Click Enable screen to share.",
      "status"
    );
    return;
  }
  const imageBase64 = captureScreenBase64();
  if (!imageBase64) {
    createChatItem(
      "assistant",
      "Assistant requested a screenshot, but the screen isn't ready yet.",
      "status"
    );
    return;
  }
  const promptText = (options.promptText || lastUserPrompt || "").trim();
  screenshotRequestInProgress = true;
  try {
    await sendText(promptText, {
      imageBase64,
      userLabel: "[Requested screenshot]",
      hidden: true,
      screenshotFollowup: true,
      contextImageType: "screenshot",
      contextImageLabel: "Requested screenshot",
    });
  } finally {
    screenshotRequestInProgress = false;
  }
}

async function handleIdleCapture() {
  if (!idleCaptureEnabled || !screenStream || !isListening) {
    return;
  }
  if (idleCaptureInProgress) {
    return;
  }
  if (Date.now() - lastSpeechTime < IDLE_CAPTURE_MS) {
    return;
  }
  if (sendTimeoutId || pendingTranscript) {
    return;
  }
  const imageBase64 = captureScreenBase64();
  if (!imageBase64) {
    lastSpeechTime = Date.now();
    return;
  }
  idleCaptureInProgress = true;
  try {
    await sendText("", {
      imageBase64,
      userLabel: "[Screen snapshot]",
      contextImageType: "screenshot",
      contextImageLabel: "Idle screenshot",
    });
  } finally {
    idleCaptureInProgress = false;
    lastSpeechTime = Date.now();
  }
}

let thinkingTimerId = null;
let THINKING_INTERVAL_MS = 30000;
let thinkingLoopEnabled = true;

async function handleThinkingTick() {
  if (!isListening || !thinkingLoopEnabled) {
    return;
  }
  // Don't fire if user or AI is actively speaking
  if (idleCaptureInProgress || sendTimeoutId || isSpeechActive()) {
    // Reschedule for later
    scheduleNextThinkingTick();
    return;
  }
  // Check if enough time has passed since last speech
  if (Date.now() - lastSpeechTime < THINKING_INTERVAL_MS) {
    // Reschedule for later
    scheduleNextThinkingTick();
    return;
  }

  // We reuse idleCaptureInProgress to prevent overlap, which is fine.
  idleCaptureInProgress = true;
  try {
    // Send a "hidden" message that doesn't appear in the main chat log
    await sendText("[Thinking Tick]", { hidden: true });
  } finally {
    idleCaptureInProgress = false;
  }

  // Schedule next tick
  scheduleNextThinkingTick();
}

function scheduleNextThinkingTick() {
  if (thinkingTimerId) {
    clearTimeout(thinkingTimerId);
  }
  thinkingTimerId = setTimeout(handleThinkingTick, THINKING_INTERVAL_MS);
}

function startThinkingWatcher() {
  if (thinkingTimerId) {
    return;
  }
  scheduleNextThinkingTick();
}

function resetThinkingTimer() {
  if (thinkingLoopEnabled && isListening) {
    scheduleNextThinkingTick();
  }
}

// Kept for backward compatibility if needed, but thinking tick might replace it?
// user asked for thinking loop *between* screenshots.
// So we keep the screenshot watcher separate for now but maybe coordinate them.
async function handleIdleCapture() {
  if (!idleCaptureEnabled || !screenStream || !isListening) {
    // Reschedule for later
    scheduleNextIdleCapture();
    return;
  }
  if (idleCaptureInProgress) {
    // Reschedule for later
    scheduleNextIdleCapture();
    return;
  }
  // Check if enough time has passed since last speech
  if (Date.now() - lastSpeechTime < IDLE_CAPTURE_MS) {
    // Reschedule for later
    scheduleNextIdleCapture();
    return;
  }
  // Don't fire if user or AI is actively speaking
  if (sendTimeoutId || isSpeechActive()) {
    // Reschedule for later
    scheduleNextIdleCapture();
    return;
  }

  const imageBase64 = captureScreenBase64();
  if (!imageBase64) {
    // Reschedule for later
    scheduleNextIdleCapture();
    return;
  }

  idleCaptureInProgress = true;
  try {
    await sendText("", {
      imageBase64,
      userLabel: "[Screen snapshot]",
      contextImageType: "screenshot",
      contextImageLabel: "Idle screenshot",
    });
  } finally {
    idleCaptureInProgress = false;
  }

  // Schedule next capture
  scheduleNextIdleCapture();
}

function scheduleNextIdleCapture() {
  if (idleCaptureTimerId) {
    clearTimeout(idleCaptureTimerId);
  }
  idleCaptureTimerId = setTimeout(handleIdleCapture, IDLE_CAPTURE_MS);
}

function startIdleWatcher() {
  if (idleCaptureTimerId) {
    return;
  }
  scheduleNextIdleCapture();
  // Start the thinking loop as well
  startThinkingWatcher();
}

function resetIdleCaptureTimer() {
  if (idleCaptureEnabled && isListening) {
    scheduleNextIdleCapture();
  }
}

function setThinkingPanelOpen(open) {
  if (!thinkingPanel) {
    return;
  }
  thinkingPanel.classList.toggle("open", open);
  thinkingPanel.setAttribute("aria-hidden", String(!open));
  if (thinkingToggle) {
    thinkingToggle.setAttribute("aria-pressed", String(open));
    thinkingToggle.classList.toggle("active", open);
  }
  localStorage.setItem("thinkingPanelOpen", String(open));
}

const THINKING_LIMIT = 20;

function clearThinkingMessages() {
  if (!thinkingSilentList) {
    return;
  }
  thinkingSilentList.innerHTML = "";
  const placeholder = document.createElement("div");
  placeholder.className = "thinking-empty";
  placeholder.textContent = "No silent response yet.";
  thinkingSilentList.appendChild(placeholder);
}

function addThinkingMessage(text, allowEmpty = false) {
  if (!thinkingSilentList) {
    return null;
  }
  const trimmed = (text || "").trim();
  if (!trimmed && !allowEmpty) {
    return null;
  }
  const placeholder = thinkingSilentList.querySelector(".thinking-empty");
  if (placeholder) {
    placeholder.remove();
  }
  const item = document.createElement("div");
  item.className = "thinking-item";
  item.textContent = trimmed;
  thinkingSilentList.appendChild(item);
  const items = thinkingSilentList.querySelectorAll(".thinking-item");
  if (items.length > THINKING_LIMIT) {
    items[0].remove();
  }
  thinkingSilentList.scrollTop = thinkingSilentList.scrollHeight;
  return item;
}

function updateThinkingPanel(toolCallsMade) {
  if (thinkingToolCalls) {
    thinkingToolCalls.innerHTML = "";
    if (Array.isArray(toolCallsMade) && toolCallsMade.length > 0) {
      toolCallsMade.forEach((call) => {
        const li = document.createElement("li");
        const name = call.tool || call.name || "unknown";
        const args = call.arguments || call.args || {};
        const summary = Object.entries(args)
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(", ");
        li.textContent = summary ? `${name}(${summary})` : name;
        thinkingToolCalls.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No tools used.";
      thinkingToolCalls.appendChild(li);
    }
  }
}

function updateThinkingTokenEstimate(contextDebug) {
  if (!thinkingTokenEstimate) return;
  const text = contextDebug || "";
  const estimate = text ? Math.round(text.length / 4) : 0;
  thinkingTokenEstimate.textContent = `~${estimate.toLocaleString()} tokens`;
}

function setThinkingContext(text) {
  contextDebugText = text || "";
  if (!thinkingContextToggle || !thinkingContextBody) {
    return;
  }
  const hasContext = Boolean(contextDebugText);
  if (!hasContext) {
    contextVisible = false;
    thinkingContextBody.textContent = "";
    thinkingContextBody.hidden = true;
    thinkingContextToggle.textContent = "Show full context";
    thinkingContextToggle.disabled = true;
    return;
  }
  thinkingContextToggle.disabled = false;
  thinkingContextToggle.textContent = contextVisible
    ? "Hide full context"
    : "Show full context";
  if (contextVisible) {
    thinkingContextBody.textContent = contextDebugText;
    thinkingContextBody.hidden = false;
  } else {
    thinkingContextBody.textContent = "";
    thinkingContextBody.hidden = true;
  }
}

function setRawOutput(text) {
  rawOutputText = text || "";
  if (!rawOutputToggle || !rawOutputBody) {
    return;
  }
  const hasOutput = Boolean(rawOutputText);
  if (!hasOutput) {
    rawOutputVisible = false;
    rawOutputBody.textContent = "";
    rawOutputBody.hidden = true;
    rawOutputToggle.textContent = "Show raw output";
    rawOutputToggle.disabled = true;
    return;
  }
  rawOutputToggle.disabled = false;
  rawOutputToggle.textContent = rawOutputVisible
    ? "Hide raw output"
    : "Show raw output";
  if (rawOutputVisible) {
    rawOutputBody.textContent = rawOutputText;
    rawOutputBody.hidden = false;
  } else {
    rawOutputBody.textContent = "";
    rawOutputBody.hidden = true;
  }
}

function setThinkingScreenshot(dataUrl, label) {
  if (!thinkingScreenshot) {
    return;
  }
  thinkingScreenshot.innerHTML = "";
  if (!dataUrl) {
    thinkingScreenshot.hidden = true;
    return;
  }
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = label || "Screenshot used for context";
  thinkingScreenshot.appendChild(img);
  if (label) {
    const caption = document.createElement("div");
    caption.className = "caption";
    caption.textContent = label;
    thinkingScreenshot.appendChild(caption);
  }
  thinkingScreenshot.hidden = false;
}

function setPendingScreenshot(dataUrl, label) {
  pendingScreenshotDataUrl = dataUrl || "";
  pendingScreenshotLabel = label || "";
}

function applyPendingScreenshot() {
  if (pendingScreenshotDataUrl) {
    setThinkingScreenshot(pendingScreenshotDataUrl, pendingScreenshotLabel);
    pendingScreenshotDataUrl = "";
    pendingScreenshotLabel = "";
  }
}

function setImagePreview(dataUrl) {
  if (!imagePreview) {
    return;
  }
  imagePreview.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Attached image preview";
  imagePreview.appendChild(img);
  const area = document.getElementById("imagePreviewArea");
  if (area) area.style.display = "flex";
}

function clearImage() {
  attachedImage = null;
  if (imageInput) {
    imageInput.value = "";
  }
  if (imagePreview) {
    imagePreview.innerHTML = "<span class=\"image-placeholder\">No image attached.</span>";
  }
  if (imageClearBtn) {
    imageClearBtn.disabled = true;
  }
  const area = document.getElementById("imagePreviewArea");
  if (area) area.style.display = "none";
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { attachedImage: null } }));
}

function attachImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    const base64 = result.split(",")[1] || "";
    attachedImage = {
      name: file.name,
      dataUrl: result,
      base64,
    };
    setImagePreview(result);
    if (imageClearBtn) {
      imageClearBtn.disabled = false;
    }
    window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { attachedImage: { dataUrl: result, name: file.name } } }));
  };
  reader.readAsDataURL(file);
}

function _applyPersonalityColors(item, meta, personalityName) {
  if (!personalityName || personalityName === "default") return;
  const p = personalities.find((x) => x.name === personalityName);
  if (!p) return;
  if (p.bubbleBg) item.style.background = p.bubbleBg;
  if (p.bubbleBorder) item.style.borderColor = p.bubbleBorder;
  if (p.bubbleText) item.style.color = p.bubbleText;
  if (p.bubbleName && meta) meta.style.color = p.bubbleName;
}

function createChatItem(role, text, variant, imageDataUrl, personalityName) {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  if (variant) {
    item.classList.add(...variant.split(/\s+/).filter(Boolean));
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : (personalityName && personalityName !== "default" ? personalityName : "Assistant");
  if (personalityName && personalityName !== "default") item.dataset.personality = personalityName;

  item.appendChild(meta);

  const body = document.createElement("div");
  body.textContent = text;
  item.appendChild(body);

  if (role === "assistant") _applyPersonalityColors(item, meta, personalityName);

  if (imageDataUrl) {
    const grid = document.createElement("div");
    grid.className = "image-grid";
    grid.dataset.count = "1";
    const cell = document.createElement("div");
    cell.className = "image-grid-cell";
    const attachedImg = document.createElement("img");
    attachedImg.src = imageDataUrl;
    attachedImg.alt = "Attached image";
    attachedImg.className = "generated-image";
    cell.appendChild(attachedImg);
    grid.appendChild(cell);
    item.appendChild(grid);
  }

  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;

  // Dispatch event for React ChatWorkspace
  const _chatMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  item._chatId = _chatMsgId;
  const _isStreamPlaceholder = role === 'assistant' && !text && !variant && !imageDataUrl;
  if (_isStreamPlaceholder) {
    window.dispatchEvent(new CustomEvent('chat:streamStart', { detail: { id: _chatMsgId, personalityName } }));
  } else {
    window.dispatchEvent(new CustomEvent('chat:add', { detail: { id: _chatMsgId, role, text, variant, imageDataUrl, personalityName } }));
  }

  return { item, body };
}

function addChat(role, text, imageDataUrl, personalityName) {
  createChatItem(role, text, undefined, imageDataUrl, personalityName);
  saveChatMessage(role, text, imageDataUrl, personalityName);
  // Ensure scroll happens after DOM update
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
    });
  });
}

function addStatus(text) {
  createChatItem("assistant", text, "status");
  queueSpeech(text);
}

let _generatingStatusItem = null;
let _typingIndicatorItem = null;
let _currentImageGroupItem = null;
let _currentImageGroupGrid = null;
let _currentImageGroupCount = 0;
let _imageGenTotal = 0;
let _currentImageGroupSaveId = null;
let _currentImageGroupDataUrls = [];

function showTypingIndicator() {
  if (_typingIndicatorItem) return;
  const { item, body } = createChatItem("assistant", "", "status typing");
  const wrap = document.createElement("div");
  wrap.className = "typing-indicator";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "typing-dot";
    wrap.appendChild(dot);
  }
  body.appendChild(wrap);
  _typingIndicatorItem = item;
}

function hideTypingIndicator() {
  if (_typingIndicatorItem && _typingIndicatorItem.parentNode) {
    _typingIndicatorItem.parentNode.removeChild(_typingIndicatorItem);
  }
  if (_typingIndicatorItem?._chatId) {
    window.dispatchEvent(new CustomEvent('chat:remove', { detail: { id: _typingIndicatorItem._chatId } }));
  }
  _typingIndicatorItem = null;
}

function addGeneratingStatus(text) {
  if (_generatingStatusItem && _generatingStatusItem.parentNode) {
    _generatingStatusItem.parentNode.removeChild(_generatingStatusItem);
  }
  if (_generatingStatusItem?._chatId) {
    window.dispatchEvent(new CustomEvent('chat:remove', { detail: { id: _generatingStatusItem._chatId } }));
  }
  _generatingStatusItem = null;
  const { item, body } = createChatItem("assistant", "", "status generating");
  const spinner = document.createElement("span");
  spinner.className = "gen-spinner";
  body.appendChild(spinner);
  const label = document.createElement("span");
  label.textContent = text;
  body.appendChild(label);
  _generatingStatusItem = item;
  window.dispatchEvent(new CustomEvent('chat:statusUpdate', { detail: { id: item._chatId, text } }));
  return item;
}

function addToImageGroup(url) {
  if (!_currentImageGroupGrid) {
    const item = document.createElement("div");
    item.className = "chat-item assistant";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "Assistant";
    const grid = document.createElement("div");
    grid.className = "image-grid";
    grid.dataset.count = "1";
    item.appendChild(meta);
    item.appendChild(grid);
    _currentImageGroupItem = item;
    _currentImageGroupGrid = grid;
    if (_generatingStatusItem && _generatingStatusItem.parentNode) {
      _generatingStatusItem.parentNode.insertBefore(item, _generatingStatusItem);
    } else {
      chatLog.appendChild(item);
    }
  }

  _currentImageGroupCount++;
  const count = _currentImageGroupCount;
  _currentImageGroupGrid.dataset.count = String(Math.min(count, 4));

  const cell = document.createElement("div");
  cell.className = "image-grid-cell";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "Generated image";
  img.className = "generated-image";
  cell.appendChild(img);
  // Cells 4+ are hidden (kept in DOM for lightbox navigation)
  if (count > 3) cell.style.display = "none";
  _currentImageGroupGrid.appendChild(cell);

  // Add overflow badge when 4th image arrives; update count for 5+
  if (count === 4) {
    const thirdCell = _currentImageGroupGrid.children[2];
    if (thirdCell) {
      const badge = document.createElement("div");
      badge.className = "image-grid-overflow";
      badge.dataset.overflowBadge = "1";
      badge.textContent = "+1";
      thirdCell.appendChild(badge);
    }
  } else if (count > 4) {
    const thirdCell = _currentImageGroupGrid.children[2];
    if (thirdCell) {
      const badge = thirdCell.querySelector("[data-overflow-badge]");
      if (badge) badge.textContent = `+${count - 3}`;
    }
  }

  // Update spinner label when all expected images have arrived
  if (_generatingStatusItem) {
    const label = _generatingStatusItem.querySelector("span:not(.gen-spinner)");
    if (label && (_imageGenTotal === 0 || count >= _imageGenTotal)) {
      label.textContent = "Composing reply\u2026";
      if (_generatingStatusItem?._chatId) {
        window.dispatchEvent(new CustomEvent('chat:statusUpdate', { detail: { id: _generatingStatusItem._chatId, text: "Composing reply\u2026" } }));
      }
    }
  }

  chatLog.scrollTop = chatLog.scrollHeight;

  // Persist URL path (not base64) to avoid localStorage quota issues
  if (!_currentImageGroupSaveId) _currentImageGroupSaveId = `img-${Date.now()}`;
  saveOrUpdateImageGroup(_currentImageGroupSaveId, url);
  window.dispatchEvent(new CustomEvent('chat:imageGroupAdd', { detail: { groupId: _currentImageGroupSaveId, url } }));
}

function buildUtterance(text) {
  const utterance = new SpeechSynthesisUtterance(sanitizeTtsText(text));
  const storedVoice = localStorage.getItem(getTtsVoiceStorageKey("browser"));
  if (storedVoice) {
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find((voice) => voice.name === storedVoice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
  }
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  return utterance;
}

function sanitizeTtsText(text) {
  if (!text) {
    return "";
  }
  return text
    .replace(/```/g, "")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/~~/g, "")
    .replace(/\*/g, "");
}

function speak(text, interrupt = true) {
  if (!ttsEnabled) {
    return;
  }
  if (ttsProvider === "kokoro") {
    speakWithKokoro(text, interrupt);
    return;
  }
  if (!window.speechSynthesis) {
    return;
  }
  if (interrupt && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  speechSynthesis.speak(buildUtterance(text));
}

function queueSpeech(text) {
  speak(text, false);
}

function stopTtsPlayback() {
  if (ttsProvider === "kokoro") {
    stopKokoroPlayback();
    return;
  }
  if (window.speechSynthesis) {
    speechSynthesis.cancel();
  }
}

function stopKokoroPlayback() {
  kokoroGeneration += 1;
  kokoroPlaying = false;
  clearKokoroQueue();
  if (kokoroCurrentAudio) {
    kokoroCurrentAudio.pause();
    kokoroCurrentAudio.src = "";
    kokoroCurrentAudio = null;
  }
}

function clearKokoroQueue() {
  kokoroQueue.forEach((item) => {
    if (item.audioElement) {
      item.audioElement.src = "";
    }
  });
  kokoroQueue = [];
}

function buildTtsUrl(text) {
  const voice = voiceSelect ? voiceSelect.value : "";
  const params = new URLSearchParams({ text: sanitizeTtsText(text) });
  if (voice) params.set("voice", voice);
  return `/api/tts?${params}`;
}

function speakWithKokoro(text, interrupt) {
  const sanitized = sanitizeTtsText(text);
  if (!sanitized) {
    return;
  }
  if (interrupt) {
    stopKokoroPlayback();
  }
  kokoroQueue.push({
    text: sanitized,
    generation: kokoroGeneration,
    audioElement: null,
  });
  if (!kokoroPlaying) {
    playNextKokoro();
  } else {
    prefetchNextKokoro();
  }
}

function prefetchNextKokoro() {
  const next = kokoroQueue[0];
  if (!next || next.audioElement) {
    return;
  }
  const audio = new Audio(buildTtsUrl(next.text));
  audio.preload = "auto";
  next.audioElement = audio;
}

function playNextKokoro() {
  if (kokoroQueue.length === 0) {
    kokoroPlaying = false;
    return;
  }
  kokoroPlaying = true;
  const item = kokoroQueue.shift();
  if (!item || item.generation !== kokoroGeneration) {
    playNextKokoro();
    return;
  }
  const audio = item.audioElement || new Audio(buildTtsUrl(item.text));
  kokoroCurrentAudio = audio;
  audio.onended = () => {
    if (item.generation === kokoroGeneration) {
      playNextKokoro();
    }
  };
  audio.onerror = () => {
    if (item.generation === kokoroGeneration) {
      playNextKokoro();
    }
  };
  audio.play().catch(() => {
    if (item.generation === kokoroGeneration) {
      playNextKokoro();
    }
  });
  prefetchNextKokoro();
}

function flushSpeechBuffer(force) {
  if (!speechBuffer) {
    return;
  }

  const chunks = [];
  let working = speechBuffer;

  while (working.length > 0) {
    const sentenceMatch = working.match(/^[\s\S]*?[.!?]/);
    if (sentenceMatch && sentenceMatch[0].length >= 20) {
      chunks.push(sentenceMatch[0].trim());
      working = working.slice(sentenceMatch[0].length).trimStart();
      continue;
    }

    if (working.length > 200) {
      // Only cut at a comma or semicolon to preserve sentence flow
      const commaMatch = working.match(/^[\s\S]*?[,;â€”]/);
      if (commaMatch && commaMatch[0].length <= 200) {
        chunks.push(commaMatch[0].trim());
        working = working.slice(commaMatch[0].length).trimStart();
      } else {
        // No comma found within 200 chars â€” hold until a sentence boundary arrives,
        // unless we're forcing (end of stream), in which case flush the whole thing.
        if (force) {
          chunks.push(working.trim());
          working = "";
        }
        break;
      }
      continue;
    }

    if (force) {
      chunks.push(working.trim());
      working = "";
      continue;
    }

    break;
  }

  speechBuffer = working;
  chunks.forEach((chunk) => queueSpeech(chunk));
}

async function sendTextNonStream(payload, shouldClearAttachment, sourceText) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    addChat("assistant", `Error: ${errorText}`);
    return;
  }

  const data = await response.json();
  if (data.session_id && data.session_id !== sessionId) {
    sessionId = data.session_id;
    localStorage.setItem("sessionId", sessionId);
    ensureSessionEntry(sessionId);
    setSessionStatusById(sessionId);
  }
  if (data.provider) {
    setProviderBadge(data.provider);
  }
  setThinkingContext(data.context_debug || "");
  setRawOutput(data.raw_output || "");
  if (data.request_screenshot) {
    await requestScreenshotFromAssistant({
      promptText: sourceText,
      reason: data.request_reason,
    });
    return;
  }

  const toolCallsMade = Array.isArray(data.tool_calls_made) ? data.tool_calls_made : [];
  let spokenText = data.assistant_text || "";
  let silentText = data.silent_text || "";
  const spokenRequest = stripScreenshotRequest(spokenText);
  const silentRequest = stripScreenshotRequest(silentText);
  spokenText = spokenRequest.cleaned;
  silentText = silentRequest.cleaned;
  const requestedScreenshot = spokenRequest.requested || silentRequest.requested;

  if (spokenText) {
    const _pName = getActivePersonality().name;
    addChat("assistant", spokenText, undefined, _pName !== "default" ? _pName : undefined);
    speak(spokenText);
  }
  if (silentText) {
    addThinkingMessage(silentText);
  } else if (!spokenText && !requestedScreenshot) {
    addThinkingMessage("Assistant chose to stay silent.");
  }

  setThinkingScreenshot("", "");
  updateThinkingPanel(toolCallsMade);
  updateThinkingTokenEstimate(data.context_debug || "");
  // Double requestAnimationFrame ensures scroll happens after layout is complete
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
    });
  });

  if (requestedScreenshot) {
    requestScreenshotFromAssistant({ promptText: sourceText });
  }
  applyPendingScreenshot();
  if (shouldClearAttachment) {
    clearImage();
  }
}

async function sendText(text, options = {}) {
  const trimmed = (text || "").trim();
  const hidden = Boolean(options.hidden);
  const regenerate = Boolean(options.regenerate);
  const screenshotFollowup = Boolean(options.screenshotFollowup);
  const contextImageType = (options.contextImageType || "").toLowerCase();
  const contextImageLabel = options.contextImageLabel || "";
  const overrideImage = (options.imageBase64 || "").trim();
  const usingAttachment = !overrideImage && attachedImage && attachedImage.base64;
  const imageBase64 = overrideImage || (usingAttachment ? attachedImage.base64 : "");
  if (!trimmed && !imageBase64) {
    return;
  }

  const imageDataUrl = overrideImage
    ? `data:image/jpeg;base64,${overrideImage}`
    : usingAttachment && attachedImage
      ? attachedImage.dataUrl
      : "";
  if (contextImageType === "screenshot" && imageDataUrl) {
    setPendingScreenshot(imageDataUrl, contextImageLabel || "Screenshot");
  } else {
    setPendingScreenshot("", "");
  }

  const userLabel =
    options.userLabel || trimmed || (imageBase64 ? "[Image]" : "");
  if (!hidden && !regenerate) {
    addChat("user", userLabel, usingAttachment ? imageDataUrl : "");
    setProcessing(true);
    showTypingIndicator();
    activeAbortController = new AbortController();
  } else if (regenerate) {
    setProcessing(true);
    showTypingIndicator();
    activeAbortController = new AbortController();
  }
  interimText.textContent = "...";
  if (!hidden) {
    if (trimmed) {
      lastUserPrompt = trimmed;
    }
    markSpeechActivity();
  }
  stopTtsPlayback();

  const activeP = getActivePersonality();
  const payload = {
    session_id: sessionId,
    search_method: searchMethod,
    personality_id: activeP.id,
    tone_context: activeP.toneContext || "",
    max_history: chatMaxHistory,
    max_context_tokens: contextMaxTokens,
    max_rag_results: ragTopK,
    social_mode: socialModeEnabled,
  };
  if (currentProvider) {
    payload.provider = currentProvider;
  }
  if (trimmed) {
    payload.text = trimmed;
  }
  if (hidden) {
    payload.hidden = true;
  }
  if (regenerate) {
    payload.regenerate = true;
  }
  if (screenshotFollowup) {
    payload.screenshot_followup = true;
  }
  const selectedModel = modelSelect && modelSelect.value;
  if (selectedModel) {
    payload.model = selectedModel;
  }
  if (imageBase64) {
    payload.image_base64 = imageBase64;
  }
  const hadImage = Boolean(imageBase64);
  const shouldClearAttachment = Boolean(usingAttachment);

  // Reset multi-image group tracking for this turn
  _currentImageGroupItem = null;
  _currentImageGroupGrid = null;
  _currentImageGroupCount = 0;
  _imageGenTotal = 0;
  _currentImageGroupSaveId = null;
  _currentImageGroupDataUrls = [];

  let assistantItem = null;
  let silentDraftItem = null;

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: activeAbortController ? activeAbortController.signal : undefined,
    });

    if (!response.ok || !response.body) {
      await sendTextNonStream(payload, shouldClearAttachment, trimmed);
      return;
    }

    let spokenText = "";
    let silentText = "";
    let receivedMeta = false;
    let streamHadError = false;
    const _streamPersonalityName = (() => { const n = getActivePersonality().name; return n !== "default" ? n : undefined; })();
    speechBuffer = "";
    let requestedScreenshot = false;
    let requestReason = "";
    let lastSpokenSanitized = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }
        let message;
        try {
          message = JSON.parse(trimmedLine);
        } catch (error) {
          continue;
        }

        if (message.type === "meta") {
          receivedMeta = true;
          if (message.session_id && message.session_id !== sessionId) {
            sessionId = message.session_id;
            localStorage.setItem("sessionId", sessionId);
            ensureSessionEntry(sessionId);
            setSessionStatusById(sessionId);
          }
          if (message.provider) {
            setProviderBadge(message.provider);
          }
          silentDraftItem = null;
          silentText = "";
          continue;
        }

        if (message.type === "image_generation_start") {
          _imageGenTotal = message.total || 0;
          continue;
        }

        if (message.type === "status") {
          hideTypingIndicator();
          if (message.text) {
            addGeneratingStatus(message.text);
          }
          continue;
        }

        if (message.type === "image_ready") {
          if (message.url) {
            addToImageGroup(message.url);
          }
          continue;
        }

        if (message.type === "request_screenshot") {
          requestedScreenshot = true;
          requestReason = message.reason || "";
          continue;
        }

        if (message.type === "retract") {
          // Model emitted an inline text tool call that we're about to execute properly —
          // clear the garbled text that was already streamed to the user.
          spokenText = "";
          silentText = "";
          if (assistantItem) {
            assistantItem.body.textContent = "";
            window.dispatchEvent(new CustomEvent('chat:token', { detail: { id: assistantItem.item._chatId, text: "" } }));
          }
          continue;
        }

        if (message.type === "token") {
          hideTypingIndicator();
          if (!receivedMeta || !message.text) {
            continue;
          }
          const channel = message.channel || "spoken";
          if (channel === "silent") {
            silentText += message.text;
            const screenshotRequest = stripScreenshotRequest(silentText);
            silentText = screenshotRequest.cleaned;
            if (screenshotRequest.requested) {
              requestedScreenshot = true;
            }
            if (!silentDraftItem) {
              silentDraftItem = addThinkingMessage("", true);
            }
            if (silentDraftItem) {
              silentDraftItem.textContent = silentText.trimEnd();
              if (thinkingSilentList) {
                thinkingSilentList.scrollTop =
                  thinkingSilentList.scrollHeight;
              }
            }
            continue;
          }

          spokenText += message.text;
          const spokenRequest = stripScreenshotRequest(spokenText);
          spokenText = spokenRequest.cleaned;
          if (spokenRequest.requested) {
            requestedScreenshot = true;
          }
          if (!assistantItem) {
            assistantItem = createChatItem("assistant", "", undefined, undefined, _streamPersonalityName);
          }
          const spokenDisplay = spokenText.trimEnd();
          assistantItem.body.textContent = spokenDisplay;
          window.dispatchEvent(new CustomEvent('chat:token', { detail: { id: assistantItem.item._chatId, text: spokenDisplay } }));
          if (spokenDisplay.startsWith(lastSpokenSanitized)) {
            const newChunk = spokenDisplay.slice(lastSpokenSanitized.length);
            if (newChunk) {
              speechBuffer += newChunk;
              flushSpeechBuffer(false);
            }
            lastSpokenSanitized = spokenDisplay;
          } else {
            lastSpokenSanitized = spokenDisplay;
            speechBuffer = "";
          }
          continue;
        }

        if (message.type === "error") {
          const detail = message.detail || "Unknown error";
          streamHadError = true;
          if (assistantItem) {
            assistantItem.body.textContent = `Error: ${detail}`;
          } else {
            addChat("assistant", `Error: ${detail}`);
          }
          addThinkingMessage(`Error: ${detail}`);
          continue;
        }

        if (message.type === "done") {
          // Remove any lingering generating-status spinner
          if (_generatingStatusItem && _generatingStatusItem.parentNode) {
            _generatingStatusItem.parentNode.removeChild(_generatingStatusItem);
          }
          if (_generatingStatusItem?._chatId) {
            window.dispatchEvent(new CustomEvent('chat:remove', { detail: { id: _generatingStatusItem._chatId } }));
          }
          _generatingStatusItem = null;
          hideTypingIndicator();
          if (assistantItem?.item._chatId) {
            window.dispatchEvent(new CustomEvent('chat:streamEnd', { detail: { id: assistantItem.item._chatId } }));
          }
          const toolCalls = Array.isArray(message.tool_calls_made)
            ? message.tool_calls_made
            : [];
          setThinkingScreenshot("", "");
          updateThinkingPanel(toolCalls);
          setThinkingContext(message.context_debug || "");
          setRawOutput(message.raw_output || "");
          updateThinkingTokenEstimate(message.context_debug || "");
          flushSpeechBuffer(true);
          if (
            silentDraftItem &&
            !silentText.trim() &&
            !silentDraftItem.textContent.trim()
          ) {
            silentDraftItem.remove();
            silentDraftItem = null;
            if (
              thinkingSilentList &&
              !thinkingSilentList.querySelector(".thinking-item") &&
              !thinkingSilentList.querySelector(".thinking-empty")
            ) {
              const placeholder = document.createElement("div");
              placeholder.className = "thinking-empty";
              placeholder.textContent = "No silent response yet.";
              thinkingSilentList.appendChild(placeholder);
            }
          }
          if (!spokenText.trim() && !silentText.trim() && !requestedScreenshot && toolCalls.length === 0) {
            addThinkingMessage("Assistant chose to stay silent.");
          }
          if (spokenText.trim()) {
            saveChatMessage("assistant", spokenText, undefined, _streamPersonalityName);
          }
          if (shouldClearAttachment && !streamHadError) {
            clearImage();
          }
          if (requestedScreenshot) {
            await requestScreenshotFromAssistant({
              promptText: trimmed,
              reason: requestReason,
            });
          }
          applyPendingScreenshot();
        }
      }
    }

    if (!receivedMeta) {
      await sendTextNonStream(payload, shouldClearAttachment, trimmed);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      // User cancelled â€” already cleaned up in cancelActiveRequest
      interimText.textContent = "";
    } else {
      await sendTextNonStream(payload, shouldClearAttachment, trimmed);
    }
  } finally {
    if (!hidden) {
      activeAbortController = null;
      setProcessing(false);
    }
  }
}

function initRecognition() {
  if (!SpeechRecognition) {
    setMic("Mic: unsupported in this browser");
    startBtn.disabled = true;
    stopBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  stopBtn.disabled = true;

  recognition.onstart = () => {
    setMic("Mic: listening");
    startBtn.classList.add("active");
    startBtn.setAttribute("aria-pressed", "true");
  };

  recognition.onend = () => {
    setMic("Mic: idle");
    if (isListening) {
      try { recognition.start(); } catch (_) {}
    } else {
      startBtn.classList.remove("active");
      startBtn.setAttribute("aria-pressed", "false");
    }
  };

  recognition.onerror = () => {
    setMic("Mic: error");
    if (!isListening) {
      startBtn.classList.remove("active");
      startBtn.setAttribute("aria-pressed", "false");
    }
  };

  recognition.onresult = (event) => {
    let interim = "";
    let hadSpeech = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0].transcript.trim();
      if (result.isFinal) {
        if (transcript) {
          pendingTranscript = `${pendingTranscript} ${transcript}`.trim();
          hadSpeech = true;
        }
      } else {
        interim += `${transcript} `;
        if (transcript) {
          hadSpeech = true;
        }
      }
    }
    interimText.textContent = interim.trim() || "...";
    if (hadSpeech) {
      markSpeechActivity();
    }
    if (sendTimeoutId) {
      clearTimeout(sendTimeoutId);
    }
    if (pendingTranscript) {
      sendTimeoutId = setTimeout(() => {
        const textToSend = pendingTranscript.trim();
        pendingTranscript = "";
        sendTimeoutId = null;
        if (textToSend) {
          sendText(textToSend);
          resetThinkingTimer();
          resetIdleCaptureTimer();
        }
      }, 1000);
    }
  };
}

async function loadModels() {
  if (!modelSelect) {
    return;
  }
  modelSelect.innerHTML = "";
  modelSelect.disabled = true;
  try {
    const provider = normalizeProvider(currentProvider);
    const response = await fetch(
      `/api/models?provider=${encodeURIComponent(provider)}`
    );
    if (!response.ok) {
      throw new Error("Model list error");
    }
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const defaultModel = data.default_model || models[0] || "";
    const responseProvider = normalizeProvider(data.provider || provider);
    if (responseProvider !== currentProvider) {
      currentProvider = responseProvider;
      localStorage.setItem("llmProvider", currentProvider);
    }
    updateProviderButtons(currentProvider);
    const modelStorageKey = getModelStorageKey(currentProvider);
    const storedModel = localStorage.getItem(modelStorageKey);
    const selectedModel = models.includes(storedModel) ? storedModel : defaultModel;

    models.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      modelSelect.appendChild(option);
    });

    if (selectedModel) {
      modelSelect.value = selectedModel;
      localStorage.setItem(modelStorageKey, selectedModel);
      setModelStatus(`Model (${providerLabel(currentProvider)}): ${selectedModel}`);
    } else {
      setModelStatus(`Model (${providerLabel(currentProvider)}): default`);
    }

    modelSelect.disabled = models.length === 0;
  } catch (error) {
    setModelStatus(`Model (${providerLabel(currentProvider)}): default`);
  }
  setProviderBadge(currentProvider);
}

function populateBrowserVoices() {
  if (!voiceSelect || !window.speechSynthesis || ttsProvider !== "browser") {
    return;
  }
  const voices = speechSynthesis.getVoices();
  if (!voices.length) {
    updateTtsControls();
    return;
  }
  voiceSelect.innerHTML = "";
  const storedVoice = _cfg('ttsVoice', localStorage.getItem(getTtsVoiceStorageKey("browser")));
  const defaultVoice = voices.find((voice) => voice.default) || voices[0];
  const selectedVoice =
    voices.find((voice) => voice.name === storedVoice) || defaultVoice;

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})${voice.default ? " (default)" : ""}`;
    voiceSelect.appendChild(option);
  });

  if (selectedVoice) {
    voiceSelect.value = selectedVoice.name;
    localStorage.setItem(getTtsVoiceStorageKey("browser"), selectedVoice.name);
  }
  updateTtsControls();
}

async function populateKokoroVoices() {
  if (!voiceSelect || ttsProvider !== "kokoro") {
    return;
  }
  voiceSelect.innerHTML = "";
  voiceSelect.disabled = true;
  kokoroVoicesLoaded = false;
  try {
    const response = await fetch("/api/tts/voices");
    if (!response.ok) {
      throw new Error("Kokoro voices unavailable");
    }
    const data = await response.json();
    kokoroVoices = Array.isArray(data.voices) ? data.voices : [];
    const defaultVoice = data.default_voice || kokoroVoices[0] || "";
    if (defaultVoice && !kokoroVoices.includes(defaultVoice)) {
      kokoroVoices.unshift(defaultVoice);
    }
    const storedVoice = _cfg('ttsVoiceKokoro', localStorage.getItem(getTtsVoiceStorageKey("kokoro")));
    const selectedVoice = kokoroVoices.includes(storedVoice)
      ? storedVoice
      : defaultVoice;

    kokoroVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice;
      option.textContent = voice;
      voiceSelect.appendChild(option);
    });

    if (selectedVoice) {
      voiceSelect.value = selectedVoice;
      localStorage.setItem(getTtsVoiceStorageKey("kokoro"), selectedVoice);
    }
    kokoroVoicesLoaded = true;
  } catch (error) {
    kokoroVoices = [];
    kokoroVoicesLoaded = false;
  }
  updateTtsControls();
}

function loadTtsVoices() {
  if (ttsProvider === "kokoro") {
    populateKokoroVoices();
    return;
  }
  populateBrowserVoices();
}

function setTtsProvider(provider) {
  ttsProvider = normalizeTtsProvider(provider);
  localStorage.setItem(TTS_PROVIDER_STORAGE_KEY, ttsProvider);
  saveConfigKey('ttsProvider', ttsProvider);
  stopTtsPlayback();
  if (ttsProviderToggle) {
    ttsProviderToggle.textContent = `TTS: ${ttsProviderLabel(ttsProvider)}`;
    ttsProviderToggle.dataset.provider = ttsProvider;
    ttsProviderToggle.setAttribute(
      "aria-pressed",
      String(ttsProvider === "kokoro")
    );
  }
  loadTtsVoices();
  updateTtsControls();
}

function initVoices() {
  if (!voiceSelect || !voiceTestBtn) {
    return;
  }
  voiceSelect.disabled = true;
  voiceTestBtn.disabled = true;
  if (window.speechSynthesis) {
    populateBrowserVoices();
    speechSynthesis.addEventListener("voiceschanged", populateBrowserVoices);
    populateBrowserVoices();
  }
  loadTtsVoices();
}

const thinkingLoopToggle = document.getElementById("thinkingLoopToggle");

if (thinkingLoopToggle) {
  thinkingLoopToggle.addEventListener("click", () => {
    thinkingLoopEnabled = !thinkingLoopEnabled;
    thinkingLoopToggle.classList.toggle("off", !thinkingLoopEnabled);
    thinkingLoopToggle.classList.toggle("active", thinkingLoopEnabled);
    thinkingLoopToggle.setAttribute("aria-pressed", String(thinkingLoopEnabled));
    thinkingLoopToggle.textContent = `Thinking loop: ${thinkingLoopEnabled ? "on" : "off"}`;
    localStorage.setItem("thinkingLoopEnabled", String(thinkingLoopEnabled));
    window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { loopOn: thinkingLoopEnabled } }));
  });
}

startBtn.addEventListener("click", () => {
  if (!recognition) {
    return;
  }
  if (isListening) {
    // Toggle off: stop listening
    isListening = false;
    recognition.stop();
    startBtn.classList.remove("active");
    startBtn.setAttribute("aria-pressed", "false");
  } else {
    // Toggle on: start listening
    isListening = true;
    startBtn.classList.add("active");
    startBtn.setAttribute("aria-pressed", "true");
    markSpeechActivity();
    try {
      recognition.start();
    } catch (error) {
      isListening = false;
      startBtn.classList.remove("active");
      startBtn.setAttribute("aria-pressed", "false");
    }
  }
  window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { isListening } }));
});

stopBtn.addEventListener("click", () => {
  if (!recognition || !isListening) {
    return;
  }
  isListening = false;
  recognition.stop();
  startBtn.classList.remove("active");
  startBtn.setAttribute("aria-pressed", "false");
});

newChatBtn.addEventListener("click", () => {
  newSession();
});

if (thinkingToggle) {
  thinkingToggle.addEventListener("click", () => {
    const isOpen = thinkingPanel && thinkingPanel.classList.contains("open");
    setThinkingPanelOpen(!isOpen);
  });
}

if (thinkingClose) {
  thinkingClose.addEventListener("click", () => setThinkingPanelOpen(false));
}

if (thinkingContextToggle) {
  thinkingContextToggle.addEventListener("click", () => {
    if (!contextDebugText) {
      return;
    }
    contextVisible = !contextVisible;
    setThinkingContext(contextDebugText);
  });
}

if (rawOutputToggle) {
  rawOutputToggle.addEventListener("click", () => {
    if (!rawOutputText) {
      return;
    }
    rawOutputVisible = !rawOutputVisible;
    setRawOutput(rawOutputText);
  });
}

// Settings modal
function updateSearchMethodUI() {
  if (!searchMethodToggle) return;
  searchMethodToggle.querySelectorAll(".setting-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === searchMethod);
  });
}

function openSettings() {
  if (settingsBackdrop) settingsBackdrop.hidden = false;
  const histInput = document.getElementById("chatMaxHistoryInput");
  const tokInput = document.getElementById("contextMaxTokensInput");
  const ragInput = document.getElementById("ragTopKInput");
  if (histInput) histInput.value = chatMaxHistory;
  if (tokInput) tokInput.value = Math.round(contextMaxTokens / 1000);
  if (ragInput) ragInput.value = ragTopK;
  checkKokoroStatus();
  checkComfyUIStatus();
  loadComfyUIModels();
}

function closeSettings() {
  if (settingsBackdrop) settingsBackdrop.hidden = true;
}

// â”€â”€ Service toast notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let kokoroJustStarted = false;
let comfyuiJustStarted = false;

function updateServiceToasts() {
  if (!serviceToasts) return;
  serviceToasts.innerHTML = "";
  const toasts = [
    kokoroServiceBusy   ? { label: "Kokoro TTS",  state: kokoroServiceRunning   ? "stopping" : "starting" } : null,
    comfyuiServiceBusy  ? { label: "ComfyUI",     state: comfyuiServiceRunning  ? "stopping" : "starting" } : null,
    (!kokoroServiceBusy  && kokoroJustStarted)  ? { label: "Kokoro TTS",  state: "started" } : null,
    (!comfyuiServiceBusy && comfyuiJustStarted) ? { label: "ComfyUI",     state: "started" } : null,
  ].filter(Boolean);
  toasts.forEach(({ label, state }) => {
    const pill = document.createElement("div");
    pill.className = "service-toast";
    const dot = document.createElement("span");
    dot.className = `service-toast-dot ${state}`;
    const text = document.createElement("span");
    text.textContent = state === "started" ? `${label} started` : `${label} ${state}\u2026`;
    pill.appendChild(dot);
    pill.appendChild(text);
    serviceToasts.appendChild(pill);
  });
}

// â”€â”€ Kokoro TTS service management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let kokoroServiceRunning = false;
let kokoroServiceAvailable = false;
let kokoroServiceBusy = false;

function updateKokoroUI() {
  if (!kokoroToggleBtn || !kokoroStatusDot || !kokoroStatusText) return;

  kokoroStatusDot.classList.remove("running", "stopped", "unavailable");
  hdrKokoroDot?.classList.remove("running", "stopped", "unavailable");

  if (!kokoroServiceAvailable) {
    kokoroStatusDot.classList.add("unavailable");
    hdrKokoroDot?.classList.add("unavailable");
    kokoroStatusText.textContent = "Unavailable";
    kokoroToggleBtn.textContent = "Launch";
    kokoroToggleBtn.disabled = true;
  } else if (kokoroServiceBusy) {
    kokoroStatusDot.classList.add("stopped");
    hdrKokoroDot?.classList.add("stopped");
    kokoroStatusText.textContent = kokoroServiceRunning ? "Stopping…" : "Starting…";
    kokoroToggleBtn.textContent = kokoroServiceRunning ? "Stop Service" : "Launch";
    kokoroToggleBtn.disabled = true;
  } else if (kokoroServiceRunning) {
    kokoroStatusDot.classList.add("running");
    hdrKokoroDot?.classList.add("running");
    kokoroStatusText.textContent = "Running";
    kokoroToggleBtn.textContent = "Stop Service";
    kokoroToggleBtn.disabled = false;
  } else {
    kokoroStatusDot.classList.add("stopped");
    hdrKokoroDot?.classList.add("stopped");
    kokoroStatusText.textContent = "Stopped";
    kokoroToggleBtn.textContent = "Launch";
    kokoroToggleBtn.disabled = false;
  }
  updateServiceToasts();
}

async function checkKokoroStatus() {
  try {
    const res = await fetch("/api/kokoro/status");
    if (!res.ok) throw new Error();
    const data = await res.json();
    kokoroServiceRunning = !!data.running;
    kokoroServiceAvailable = !!data.available;
  } catch {
    kokoroServiceRunning = false;
    kokoroServiceAvailable = false;
  }
  updateKokoroUI();
}

async function toggleKokoroService() {
  if (kokoroServiceBusy) return;
  if (kokoroServiceRunning && !confirm("Stop the Kokoro TTS service?")) return;
  kokoroServiceBusy = true;
  updateKokoroUI();

  try {
    if (kokoroServiceRunning) {
      await fetch("/api/kokoro/stop", { method: "POST" });
    } else {
      const res = await fetch("/api/kokoro/start", { method: "POST" });
      if (res.ok && ttsProvider === "kokoro") {
        populateKokoroVoices();
      }
    }
  } catch {
    // ignore â€“ status check below will update UI
  }

  const wasStarting = !kokoroServiceRunning;
  kokoroServiceBusy = false;
  await checkKokoroStatus();
  if (wasStarting && kokoroServiceRunning) {
    kokoroJustStarted = true;
    updateServiceToasts();
    setTimeout(() => { kokoroJustStarted = false; updateServiceToasts(); }, 3000);
  }
}

if (kokoroToggleBtn) {
  kokoroToggleBtn.addEventListener("click", toggleKokoroService);
}

checkKokoroStatus();

// â”€â”€ ComfyUI image service management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let comfyuiServiceRunning = false;
let comfyuiServiceAvailable = false;
let comfyuiServiceBusy = false;
let comfyuiCurrentCheckpoint = "";
let comfyuiResolutions = ["1024x1024"];

function updateComfyUIUI() {
  if (!comfyuiToggleBtn || !comfyuiStatusDot || !comfyuiStatusText) return;

  comfyuiStatusDot.classList.remove("running", "stopped", "unavailable");
  hdrComfyuiDot?.classList.remove("running", "stopped", "unavailable");

  if (!comfyuiServiceAvailable) {
    comfyuiStatusDot.classList.add("unavailable");
    hdrComfyuiDot?.classList.add("unavailable");
    comfyuiStatusText.textContent = "Unavailable";
    comfyuiToggleBtn.textContent = "Launch";
    comfyuiToggleBtn.disabled = true;
  } else if (comfyuiServiceBusy) {
    comfyuiStatusDot.classList.add("stopped");
    hdrComfyuiDot?.classList.add("stopped");
    comfyuiStatusText.textContent = comfyuiServiceRunning ? "Stopping…" : "Starting…";
    comfyuiToggleBtn.textContent = comfyuiServiceRunning ? "Stop Service" : "Launch";
    comfyuiToggleBtn.disabled = true;
  } else if (comfyuiServiceRunning) {
    comfyuiStatusDot.classList.add("running");
    hdrComfyuiDot?.classList.add("running");
    comfyuiStatusText.textContent = "Running";
    comfyuiToggleBtn.textContent = "Stop Service";
    comfyuiToggleBtn.disabled = false;
  } else {
    comfyuiStatusDot.classList.add("stopped");
    hdrComfyuiDot?.classList.add("stopped");
    comfyuiStatusText.textContent = "Stopped";
    comfyuiToggleBtn.textContent = "Launch";
    comfyuiToggleBtn.disabled = false;
  }
  updateServiceToasts();
}

async function checkComfyUIStatus() {
  try {
    const res = await fetch("/api/comfyui/status");
    if (!res.ok) throw new Error();
    const data = await res.json();
    comfyuiServiceRunning = !!data.running;
    comfyuiServiceAvailable = !!data.available;
  } catch {
    comfyuiServiceRunning = false;
    comfyuiServiceAvailable = false;
  }
  updateComfyUIUI();
}

async function toggleComfyUIService() {
  if (comfyuiServiceBusy) return;
  if (comfyuiServiceRunning && !confirm("Stop the ComfyUI image service?")) return;
  comfyuiServiceBusy = true;
  updateComfyUIUI();
  try {
    if (comfyuiServiceRunning) {
      await fetch("/api/comfyui/stop", { method: "POST" });
    } else {
      await fetch("/api/comfyui/start", { method: "POST" });
    }
  } catch {
    // ignore
  }
  const wasStarting = !comfyuiServiceRunning;
  comfyuiServiceBusy = false;
  await checkComfyUIStatus();
  if (wasStarting && comfyuiServiceRunning) {
    comfyuiJustStarted = true;
    updateServiceToasts();
    setTimeout(() => { comfyuiJustStarted = false; updateServiceToasts(); }, 3000);
  }
}

async function loadComfyUIModels() {
  if (!comfyuiCheckpointSelect) return;
  try {
    const [modelsRes, activeRes] = await Promise.all([
      fetch("/api/comfyui/models"),
      fetch("/api/comfyui/active-model"),
    ]);
    const modelsData = modelsRes.ok ? await modelsRes.json() : { models: [] };
    const activeData = activeRes.ok ? await activeRes.json() : { checkpoint: "" };
    const models = modelsData.models || [];
    comfyuiCurrentCheckpoint = activeData.checkpoint || "";

    comfyuiCheckpointSelect.innerHTML = "";
    if (models.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No checkpoints found";
      comfyuiCheckpointSelect.appendChild(opt);
      if (comfyuiModelSettingsForm) comfyuiModelSettingsForm.style.display = "none";
      return;
    }
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === comfyuiCurrentCheckpoint) opt.selected = true;
      comfyuiCheckpointSelect.appendChild(opt);
    });
    // If active checkpoint not in list, default to first
    if (!models.includes(comfyuiCurrentCheckpoint)) {
      comfyuiCurrentCheckpoint = models[0];
      comfyuiCheckpointSelect.value = comfyuiCurrentCheckpoint;
    }
    await loadComfyUIModelSettings(comfyuiCurrentCheckpoint);
  } catch {
    // ignore
  }
}

function renderComfyUIResolutions() {
  if (!comfyuiResolutionList) return;
  comfyuiResolutionList.innerHTML = "";
  comfyuiResolutions.forEach((res, i) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = res;
    inp.style.cssText = "flex:1;font-size:13px";
    inp.addEventListener("input", () => { comfyuiResolutions[i] = inp.value.trim(); });
    const del = document.createElement("button");
    del.className = "small";
    del.textContent = "Ã—";
    del.addEventListener("click", () => {
      comfyuiResolutions.splice(i, 1);
      renderComfyUIResolutions();
    });
    row.appendChild(inp);
    row.appendChild(del);
    comfyuiResolutionList.appendChild(row);
  });
}

async function loadComfyUIModelSettings(checkpoint) {
  if (!checkpoint || !comfyuiModelSettingsForm) return;
  try {
    const res = await fetch(`/api/comfyui/model-settings/${encodeURIComponent(checkpoint)}`);
    if (!res.ok) return;
    const s = await res.json();
    if (comfyuiStepsInput) comfyuiStepsInput.value = s.steps ?? 20;
    if (comfyuiCfgInput) comfyuiCfgInput.value = s.cfg ?? 7;
    if (comfyuiSamplerInput) comfyuiSamplerInput.value = s.sampler ?? "euler";
    if (comfyuiSchedulerInput) comfyuiSchedulerInput.value = s.scheduler ?? "normal";
    comfyuiResolutions = Array.isArray(s.resolutions) && s.resolutions.length ? [...s.resolutions] : ["1024x1024"];
    renderComfyUIResolutions();
    if (comfyuiWorkflowJsonTextarea) comfyuiWorkflowJsonTextarea.value = s.workflow_json || "";
    if (comfyuiValidateResult) comfyuiValidateResult.textContent = "";
    comfyuiModelSettingsForm.style.display = "block";
  } catch {
    // ignore
  }
}

if (comfyuiToggleBtn) {
  comfyuiToggleBtn.addEventListener("click", toggleComfyUIService);
}

if (comfyuiCheckpointSelect) {
  comfyuiCheckpointSelect.addEventListener("change", () => {
    comfyuiCurrentCheckpoint = comfyuiCheckpointSelect.value;
    loadComfyUIModelSettings(comfyuiCurrentCheckpoint);
  });
}

if (comfyuiRefreshModelsBtn) {
  comfyuiRefreshModelsBtn.addEventListener("click", loadComfyUIModels);
}

if (comfyuiAddResolutionBtn) {
  comfyuiAddResolutionBtn.addEventListener("click", () => {
    comfyuiResolutions.push("512x512");
    renderComfyUIResolutions();
  });
}

if (comfyuiValidateWorkflowBtn) {
  comfyuiValidateWorkflowBtn.addEventListener("click", async () => {
    if (!comfyuiWorkflowJsonTextarea || !comfyuiValidateResult) return;
    const wj = comfyuiWorkflowJsonTextarea.value.trim();
    if (!wj) {
      comfyuiValidateResult.textContent = "No workflow JSON entered.";
      comfyuiValidateResult.style.color = "var(--muted)";
      return;
    }
    comfyuiValidateResult.textContent = "Validating\u2026";
    comfyuiValidateResult.style.color = "var(--muted)";
    try {
      const res = await fetch("/api/comfyui/validate-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_json: wj }),
      });
      const data = await res.json();
      if (data.error) {
        comfyuiValidateResult.textContent = data.error;
        comfyuiValidateResult.style.color = "#f0a020";
      } else if (data.valid) {
        comfyuiValidateResult.textContent = "âœ… All nodes available";
        comfyuiValidateResult.style.color = "#4caf50";
      } else {
        comfyuiValidateResult.textContent = `âŒ Missing nodes: ${data.missing_nodes.join(", ")}`;
        comfyuiValidateResult.style.color = "#c44";
      }
    } catch {
      comfyuiValidateResult.textContent = "Validation request failed.";
      comfyuiValidateResult.style.color = "#c44";
    }
  });
}

if (comfyuiSaveSettingsBtn) {
  comfyuiSaveSettingsBtn.addEventListener("click", async () => {
    const checkpoint = comfyuiCheckpointSelect ? comfyuiCheckpointSelect.value : "";
    if (!checkpoint) return;
    const wj = comfyuiWorkflowJsonTextarea ? comfyuiWorkflowJsonTextarea.value.trim() : null;
    const payload = {
      steps: parseInt(comfyuiStepsInput ? comfyuiStepsInput.value : 20, 10),
      cfg: parseFloat(comfyuiCfgInput ? comfyuiCfgInput.value : 7),
      sampler: comfyuiSamplerInput ? comfyuiSamplerInput.value.trim() : "euler",
      scheduler: comfyuiSchedulerInput ? comfyuiSchedulerInput.value.trim() : "normal",
      resolutions: comfyuiResolutions.filter(Boolean),
      workflow_json: wj || null,
    };
    try {
      // Save active checkpoint
      await fetch("/api/comfyui/active-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint }),
      });
      // Save model-specific settings
      await fetch(`/api/comfyui/model-settings/${encodeURIComponent(checkpoint)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      comfyuiCurrentCheckpoint = checkpoint;
      if (comfyuiSaveSettingsBtn) {
        const orig = comfyuiSaveSettingsBtn.textContent;
        comfyuiSaveSettingsBtn.textContent = "Saved!";
        setTimeout(() => { comfyuiSaveSettingsBtn.textContent = orig; }, 1500);
      }
    } catch {
      // ignore
    }
  });
}

checkComfyUIStatus();
loadComfyUIModels();


updateSearchMethodUI();

if (settingsBtn) {
  settingsBtn.addEventListener("click", openSettings);
}

function openSettingsToService(scrollId) {
  openSettings();
  const servicesTab = document.querySelector('.settings-tab[data-settings-tab="services"]');
  if (servicesTab) servicesTab.click();
  if (scrollId) {
    requestAnimationFrame(() => {
      document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

const hdrKokoroPill = document.getElementById('hdrKokoroPill');
if (hdrKokoroPill) {
  hdrKokoroPill.style.cursor = 'pointer';
  hdrKokoroPill.addEventListener('click', () => openSettingsToService('kokoroServiceCard'));
}

const hdrComfyuiPill = document.getElementById('hdrComfyuiPill');
if (hdrComfyuiPill) {
  hdrComfyuiPill.style.cursor = 'pointer';
  hdrComfyuiPill.addEventListener('click', () => openSettingsToService('comfyuiServiceCard'));
}

if (settingsClose) {
  settingsClose.addEventListener("click", closeSettings);
}

if (settingsBackdrop) {
  settingsBackdrop.addEventListener("click", (e) => {
    if (e.target === settingsBackdrop) closeSettings();
  });
}

if (searchMethodToggle) {
  searchMethodToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".setting-option");
    if (!btn) return;
    searchMethod = btn.dataset.value;
    localStorage.setItem(SEARCH_METHOD_KEY, searchMethod);
    saveConfigKey('searchMethod', searchMethod);
    updateSearchMethodUI();
  });
}

const chatMaxHistoryInput = document.getElementById("chatMaxHistoryInput");
if (chatMaxHistoryInput) {
  chatMaxHistoryInput.addEventListener("change", () => {
    const val = parseInt(chatMaxHistoryInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      chatMaxHistory = val;
      localStorage.setItem(CHAT_MAX_HISTORY_KEY, val);
      saveConfigKey('chatMaxHistory', val);
    }
  });
}

const contextMaxTokensInput = document.getElementById("contextMaxTokensInput");
if (contextMaxTokensInput) {
  contextMaxTokensInput.addEventListener("change", () => {
    const val = parseInt(contextMaxTokensInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      contextMaxTokens = val * 1000;
      localStorage.setItem(CONTEXT_MAX_TOKENS_KEY, contextMaxTokens);
      saveConfigKey('contextMaxTokens', contextMaxTokens);
    }
  });
}

const ragTopKInput = document.getElementById("ragTopKInput");
if (ragTopKInput) {
  ragTopKInput.addEventListener("change", () => {
    const val = parseInt(ragTopKInput.value, 10);
    if (!isNaN(val) && val >= 0) {
      ragTopK = val;
      localStorage.setItem(RAG_TOP_K_KEY, val);
      saveConfigKey('ragTopK', val);
    }
  });
}

// â”€â”€ Personality system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadPersonalities() {
  const stored = _cfg('personalities', null);
  if (stored !== null && Array.isArray(stored)) {
    personalities = stored;
  } else {
    try {
      personalities = JSON.parse(localStorage.getItem(PERSONALITIES_KEY) || '[]');
    } catch (_) {
      personalities = [];
    }
  }
  if (!personalities.find((p) => p.id === "default")) {
    personalities.unshift({ ...DEFAULT_PERSONALITY });
  }
}

function savePersonalities() {
  localStorage.setItem(PERSONALITIES_KEY, JSON.stringify(personalities));
  saveConfigKey('personalities', personalities);
}

function getActivePersonality() {
  return personalities.find((p) => p.id === activePersonalityId) || personalities[0] || DEFAULT_PERSONALITY;
}

function applyPersonalityTts(p) {
  const provider = p.ttsProvider || "browser";
  if (p.ttsVoice) {
    // Write to localStorage before setTtsProvider so that populateKokoroVoices
    // (which reads localStorage after its async fetch) picks up the right voice.
    localStorage.setItem(getTtsVoiceStorageKey(provider), p.ttsVoice);
    const cfgKey = provider === 'kokoro' ? 'ttsVoiceKokoro' : 'ttsVoice';
    saveConfigKey(cfgKey, p.ttsVoice);
  }
  setTtsProvider(provider);
}

function renderPersonalitySelect() {
  if (!personalitySelect) return;
  const current = personalitySelect.value || activePersonalityId;
  personalitySelect.innerHTML = "";
  personalities.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    personalitySelect.appendChild(opt);
  });
  const toSelect = personalities.find((p) => p.id === current) ? current : "default";
  personalitySelect.value = toSelect;
}

function renderPersonalityList() {
  if (!personalityList) return;
  personalityList.innerHTML = "";
  if (personalities.length === 0) {
    personalityList.innerHTML = '<div class="session-empty">No personalities yet.</div>';
    return;
  }
  personalities.forEach((p) => {
    const card = document.createElement("div");
    card.className = "personality-card";
    const nameEl = document.createElement("span");
    nameEl.className = "personality-card-name";
    nameEl.textContent = p.name;
    card.appendChild(nameEl);
    if (p.id === "default") {
      const badge = document.createElement("span");
      badge.className = "personality-card-badge";
      badge.textContent = "default";
      card.appendChild(badge);
    } else {
      const actions = document.createElement("div");
      actions.className = "personality-card-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "ghost small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openPersonalityEditor(p.id));
      const delBtn = document.createElement("button");
      delBtn.className = "ghost small danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deletePersonality(p.id));
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
    }
    personalityList.appendChild(card);
  });
}

function peUpdateTtsProviderUI() {
  if (!peTtsProviderToggle) return;
  peTtsProviderToggle.querySelectorAll(".setting-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === peTtsProvider);
  });
  populatePeVoiceSelect();
}

function populatePeVoiceSelect(selectedVoice) {
  if (!peTtsVoiceSelect) return;
  peTtsVoiceSelect.innerHTML = '<option value="">â€” none â€”</option>';
  if (peTtsProvider === "kokoro") {
    kokoroVoices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      peTtsVoiceSelect.appendChild(opt);
    });
  } else {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = v.name;
      peTtsVoiceSelect.appendChild(opt);
    });
  }
  if (selectedVoice) peTtsVoiceSelect.value = selectedVoice;
}

function showPersonalityEditor(show) {
  if (settingsMain) settingsMain.hidden = show;
  if (personalityEditor) personalityEditor.hidden = !show;
}

function openPersonalityEditor(id) {
  peEditingId = id || null;
  if (id) {
    const p = personalities.find((x) => x.id === id);
    if (!p) return;
    if (personalityEditorTitle) personalityEditorTitle.textContent = "Edit Personality";
    if (peNameInput) peNameInput.value = p.name;
    if (peToneInput) peToneInput.value = p.toneContext || DEFAULT_TONE_CONTEXT;
    peTtsProvider = p.ttsProvider || "browser";
    peUpdateTtsProviderUI();
    populatePeVoiceSelect(p.ttsVoice || "");
    if (peSeparateMemory) peSeparateMemory.checked = !!p.separateMemory;
    const bgEl = document.getElementById("peBgColor");
    const bdEl = document.getElementById("peBorderColor");
    const txEl = document.getElementById("peTextColor");
    const nmEl = document.getElementById("peNameColor");
    if (bgEl) bgEl.value = p.bubbleBg || "#1a3d36";
    if (bdEl) bdEl.value = p.bubbleBorder || "#3fa08c";
    if (txEl) txEl.value = p.bubbleText || "#e8ddd0";
    if (nmEl) nmEl.value = p.bubbleName || "#7ecfc0";
  } else {
    if (personalityEditorTitle) personalityEditorTitle.textContent = "New Personality";
    if (peNameInput) peNameInput.value = "";
    if (peToneInput) peToneInput.value = DEFAULT_TONE_CONTEXT;
    peTtsProvider = "browser";
    peUpdateTtsProviderUI();
    populatePeVoiceSelect("");
    if (peSeparateMemory) peSeparateMemory.checked = false;
    const bgEl = document.getElementById("peBgColor");
    const bdEl = document.getElementById("peBorderColor");
    const txEl = document.getElementById("peTextColor");
    const nmEl = document.getElementById("peNameColor");
    if (bgEl) bgEl.value = "#1a3d36";
    if (bdEl) bdEl.value = "#3fa08c";
    if (txEl) txEl.value = "#e8ddd0";
    if (nmEl) nmEl.value = "#7ecfc0";
  }
  showPersonalityEditor(true);
  updatePeColorPreview();
}

function _refreshChatBubbleColors() {
  document.querySelectorAll(".chat-item.assistant").forEach((item) => {
    const meta = item.querySelector(".meta");
    // Match by data-personality attribute (reliable) or fall back to meta text
    const pName = item.dataset.personality || (meta ? meta.textContent.trim() : "");
    const p = pName ? personalities.find((x) => x.name === pName) : null;
    if (p) {
      item.style.background = p.bubbleBg || "";
      item.style.borderColor = p.bubbleBorder || "";
      item.style.color = p.bubbleText || "";
      if (meta) meta.style.color = p.bubbleName || "";
    } else {
      item.style.background = "";
      item.style.borderColor = "";
      item.style.color = "";
      if (meta) meta.style.color = "";
    }
  });
}

function savePersonalityEditor() {
  const name = peNameInput ? peNameInput.value.trim() : "";
  if (!name) {
    if (peNameInput) peNameInput.focus();
    return;
  }
  const toneContext = peToneInput ? peToneInput.value.trim() : "";
  const ttsVoice = peTtsVoiceSelect ? peTtsVoiceSelect.value : "";
  const separateMemory = peSeparateMemory ? peSeparateMemory.checked : false;
  const bubbleBg = (document.getElementById("peBgColor"))?.value || "";
  const bubbleBorder = (document.getElementById("peBorderColor"))?.value || "";
  const bubbleText = (document.getElementById("peTextColor"))?.value || "";
  const bubbleName = (document.getElementById("peNameColor"))?.value || "";

  if (peEditingId) {
    const idx = personalities.findIndex((p) => p.id === peEditingId);
    if (idx !== -1) {
      personalities[idx] = { ...personalities[idx], name, toneContext, ttsProvider: peTtsProvider, ttsVoice, separateMemory, bubbleBg, bubbleBorder, bubbleText, bubbleName };
    }
  } else {
    personalities.push({
      id: crypto.randomUUID(),
      name,
      toneContext,
      ttsProvider: peTtsProvider,
      ttsVoice,
      separateMemory,
      bubbleBg,
      bubbleBorder,
      bubbleText,
      bubbleName,
    });
  }
  savePersonalities();
  renderPersonalityList();
  renderPersonalitySelect();
  _refreshChatBubbleColors();
  showPersonalityEditor(false);
}

async function deletePersonality(id) {
  const p = personalities.find((x) => x.id === id);
  if (!p || p.id === "default") return;
  if (!confirm(`Delete personality "${p.name}"? This cannot be undone.`)) return;
  try {
    await fetch(`/api/personality/${encodeURIComponent(id)}/memory`, { method: "DELETE" });
  } catch (_) {}
  personalities = personalities.filter((x) => x.id !== id);
  if (activePersonalityId === id) {
    activePersonalityId = "default";
    localStorage.setItem(ACTIVE_PERSONALITY_KEY, activePersonalityId);
    applyPersonalityTts(getActivePersonality());
  }
  savePersonalities();
  renderPersonalityList();
  renderPersonalitySelect();
}

// Personalities initialized in initApp() after loadBackendConfig()

if (personalitySelect) {
  personalitySelect.addEventListener("change", () => {
    activePersonalityId = personalitySelect.value;
    localStorage.setItem(ACTIVE_PERSONALITY_KEY, activePersonalityId);
    applyPersonalityTts(getActivePersonality());
  });
}

if (personalityAddBtn) {
  personalityAddBtn.addEventListener("click", () => openPersonalityEditor(null));
}

if (peSaveBtn) {
  peSaveBtn.addEventListener("click", savePersonalityEditor);
}

const peColorReset = document.getElementById("peColorReset");
if (peColorReset) {
  peColorReset.addEventListener("click", () => {
    const bgEl = document.getElementById("peBgColor");
    const bdEl = document.getElementById("peBorderColor");
    const txEl = document.getElementById("peTextColor");
    const nmEl = document.getElementById("peNameColor");
    if (bgEl) bgEl.value = "#1a3d36";
    if (bdEl) bdEl.value = "#3fa08c";
    if (txEl) txEl.value = "#e8ddd0";
    if (nmEl) nmEl.value = "#7ecfc0";
    updatePeColorPreview();
  });
}

function updatePeColorPreview() {
  const preview = document.getElementById("peColorPreview");
  const previewName = document.getElementById("pePreviewName");
  const previewText = document.getElementById("pePreviewText");
  if (!preview) return;
  const bg = document.getElementById("peBgColor")?.value || "";
  const border = document.getElementById("peBorderColor")?.value || "";
  const text = document.getElementById("peTextColor")?.value || "";
  const name = document.getElementById("peNameColor")?.value || "";
  const nameInput = document.getElementById("peNameInput")?.value.trim() || "Personality Name";
  if (bg) preview.style.background = bg;
  if (border) preview.style.borderColor = border;
  if (text && previewText) previewText.style.color = text;
  if (name && previewName) previewName.style.color = name;
  if (previewName) previewName.textContent = nameInput;
}

["peBgColor", "peBorderColor", "peTextColor", "peNameColor"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updatePeColorPreview);
});
const peNameInputEl = document.getElementById("peNameInput");
if (peNameInputEl) peNameInputEl.addEventListener("input", updatePeColorPreview);

if (peCancelBtn) {
  peCancelBtn.addEventListener("click", () => showPersonalityEditor(false));
}

if (peTtsProviderToggle) {
  peTtsProviderToggle.addEventListener("click", (e) => {
    const btn = e.target.closest(".setting-option");
    if (!btn) return;
    peTtsProvider = btn.dataset.value;
    peUpdateTtsProviderUI();
  });
}

// Personality session picker
function openPersonalityPicker() {
  if (!personalityPickerSelect) return;
  personalityPickerSelect.innerHTML = "";
  personalities.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    personalityPickerSelect.appendChild(opt);
  });
  if (personalityPicker) personalityPicker.hidden = false;
}

function closePersonalityPicker() {
  if (personalityPicker) personalityPicker.hidden = true;
}

if (sessionNewPersonalityBtn) {
  sessionNewPersonalityBtn.addEventListener("click", openPersonalityPicker);
}

if (personalityPickerCancel) {
  personalityPickerCancel.addEventListener("click", closePersonalityPicker);
}

if (personalityPickerCreate) {
  personalityPickerCreate.addEventListener("click", () => {
    const chosenId = personalityPickerSelect ? personalityPickerSelect.value : null;
    if (!chosenId) return;
    closePersonalityPicker();
    const newId = crypto.randomUUID();
    sessionId = newId;
    localStorage.setItem("sessionId", newId);
    const p = personalities.find((x) => x.id === chosenId);
    const sessionName = p ? `${p.name} session` : "Personality session";
    const now = Date.now();
    const sessions = getSessions();
    const newSessionObj = { id: newId, name: sessionName, personalityId: chosenId, createdAt: now, updatedAt: now };
    sessions.push(newSessionObj);
    saveSessions(sessions);
    _sessionCache = _sessionCache.filter(s => s.id !== newId);
    _sessionCache.unshift(newSessionObj);
    upsertSessionToBackend(newSessionObj);
    setSessionStatusById(newId);
    editingSessionId = null;
    editingSessionDraft = "";
    chatLog.innerHTML = "";
    updateThinkingPanel([]);
    clearThinkingMessages();
    setThinkingContext("");
    setThinkingScreenshot("", "");
    clearChatHistory(newId);
    applySessionPersonalityLock(newId);
    renderSessionList();
    setSessionPanelOpen(true);
  });
}

if (sessionToggle) {
  sessionToggle.addEventListener("click", () => {
    setSessionPanelOpen(!isSessionPanelOpen);
  });
}

if (sessionScrim) {
  sessionScrim.addEventListener("click", () => setSessionPanelOpen(false));
}

if (sessionClose) {
  sessionClose.addEventListener("click", () => setSessionPanelOpen(false));
}

if (sessionNewBtn) {
  sessionNewBtn.addEventListener("click", () => {
    newSession();
    setSessionPanelOpen(true);
  });
}

if (providerToggle) {
  providerToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-provider]");
    if (!button) {
      return;
    }
    const provider = normalizeProvider(button.dataset.provider);
    if (provider === currentProvider) {
      return;
    }
    currentProvider = provider;
    localStorage.setItem("llmProvider", currentProvider);
    saveConfigKey('llmProvider', currentProvider);
    updateProviderButtons(currentProvider);
    loadModels();
  });
}

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    const selected = modelSelect.value;
    if (selected) {
      localStorage.setItem(getModelStorageKey(currentProvider), selected);
      const cfgKey = currentProvider === 'openrouter' ? 'openrouterModel' : 'ollamaModel';
      saveConfigKey(cfgKey, selected);
      setModelStatus(`Model (${providerLabel(currentProvider)}): ${selected}`);
    } else {
      setModelStatus(`Model (${providerLabel(currentProvider)}): default`);
    }
  });
}

if (voiceSelect) {
  voiceSelect.addEventListener("change", () => {
    if (voiceSelect.value) {
      localStorage.setItem(getTtsVoiceStorageKey(ttsProvider), voiceSelect.value);
      const cfgKey = ttsProvider === 'kokoro' ? 'ttsVoiceKokoro' : 'ttsVoice';
      saveConfigKey(cfgKey, voiceSelect.value);
    }
  });
}

if (voiceTestBtn) {
  voiceTestBtn.addEventListener("click", () => {
    speak("test");
  });
}

if (ttsToggle) {
  ttsToggle.addEventListener("click", () => {
    setTtsEnabled(!ttsEnabled);
  });
}

if (ttsProviderToggle) {
  ttsProviderToggle.addEventListener("click", () => {
    const next = ttsProvider === "browser" ? "kokoro" : "browser";
    setTtsProvider(next);
  });
}

if (screenCaptureBtn) {
  screenCaptureBtn.addEventListener("click", async () => {
    if (screenStream) {
      stopScreenCapture();
      return;
    }
    await startScreenCapture();
  });
}

if (idleCaptureToggle) {
  idleCaptureToggle.addEventListener("click", () => {
    setIdleCaptureEnabled(!idleCaptureEnabled);
  });
}

if (imageUploadBtn && imageInput) {
  imageUploadBtn.addEventListener("click", () => {
    imageInput.click();
  });
}

if (imageInput) {
  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];
    attachImageFile(file);
  });
}

if (imageClearBtn) {
  imageClearBtn.addEventListener("click", () => {
    clearImage();
  });
}

document.addEventListener("paste", (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard || !clipboard.items) {
    return;
  }
  const items = Array.from(clipboard.items);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }
  const file = imageItem.getAsFile();
  attachImageFile(file);
});

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

const SLASH_COMMANDS = [
  {
    name: "/cleanvram",
    desc: "Unload all Ollama models and free ComfyUI VRAM",
    async execute() {
      addChat("user", "/cleanvram");
      try {
        const r = await fetch("/api/cleanvram", { method: "POST" });
        if (r.ok) {
          addChat("assistant", "VRAM cleared â€” all models unloaded.");
        } else {
          addChat("assistant", `Error: ${r.status} ${r.statusText}`);
        }
      } catch (e) {
        addChat("assistant", `Error: ${e.message}`);
      }
    },
  },
  {
    name: "/generateimage",
    desc: 'Generate an image â€” /generateimage "prompt" [--res 1024x1024] [--raw]',
    requiresInput: true,
    async execute(args = "") {
      args = args.trim();
      const rawFlag = /--raw(?=\s|$)/.test(args);
      const resMatch = args.match(/--res\s+(\d+x\d+)/);
      const resolution = resMatch ? resMatch[1] : undefined;
      let argsClean = args
        .replace(/\s*--raw(?=\s|$)/, "")
        .replace(/\s*--res\s+\d+x\d+/, "")
        .trim();
      const quotedMatch = argsClean.match(/^"([\s\S]+)"$/);
      const prompt = quotedMatch ? quotedMatch[1] : argsClean;
      if (!prompt) {
        addChat("assistant", 'Usage: /generateimage "your prompt here" [--res 1024x1024] [--raw]');
        return;
      }
      const flags = [resolution ? `--res ${resolution}` : null, rawFlag ? "--raw" : null].filter(Boolean).join(" ");
      const displayArgs = flags ? `"${prompt}" ${flags}` : `"${prompt}"`;
      addChat("user", `/generateimage ${displayArgs}`);
      // Reset image group state so this command always gets its own group entry
      _currentImageGroupItem = null;
      _currentImageGroupGrid = null;
      _currentImageGroupCount = 0;
      _imageGenTotal = 0;
      _currentImageGroupSaveId = null;
      _currentImageGroupDataUrls = [];
      addGeneratingStatus(rawFlag ? "Generating image\u2026" : "Enhancing prompt\u2026");

      const _clearStatus = () => {
        if (_generatingStatusItem && _generatingStatusItem.parentNode) {
          _generatingStatusItem.parentNode.removeChild(_generatingStatusItem);
          _generatingStatusItem = null;
        }
      };

      try {
        const model = modelSelect ? modelSelect.value : undefined;
        const r = await fetch("/api/generateimage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            raw: rawFlag,
            resolution: resolution || undefined,
            model: model || undefined,
            provider: currentProvider || undefined,
          }),
        });

        if (!r.ok || !r.body) {
          _clearStatus();
          const errText = await r.text().catch(() => r.statusText);
          addChat("assistant", `Error: ${errText}`);
          return;
        }

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let enhanced_prompt = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let msg;
            try { msg = JSON.parse(trimmed); } catch (_) { continue; }

            if (msg.type === "status") {
              addGeneratingStatus(msg.text);
            } else if (msg.type === "enhanced_prompt") {
              enhanced_prompt = msg.prompt;
              addGeneratingStatus(`Generating image\u2026`);
              addChat("assistant", `**Enhanced prompt:** ${msg.prompt}`);
            } else if (msg.type === "image_ready") {
              _clearStatus();
              addToImageGroup(msg.url);
              addChat("assistant", "Image generated.");
            } else if (msg.type === "error") {
              _clearStatus();
              addChat("assistant", `Error: ${msg.detail}`);
            }
          }
        }
        _clearStatus();
      } catch (e) {
        _clearStatus();
        addChat("assistant", `Error: ${e.message}`);
      }
    },
  },
];

const slashMenu = document.getElementById("slashMenu");
const slashList = document.getElementById("slashList");
let slashActive = -1;
let slashFiltered = [];

function slashMenuVisible() {
  return !slashMenu.hidden;
}

function renderSlashMenu(filtered) {
  slashFiltered = filtered;
  slashList.innerHTML = "";
  filtered.forEach((cmd, i) => {
    const li = document.createElement("li");
    li.className = "slash-item" + (i === slashActive ? " active" : "");
    li.innerHTML = `<span class="slash-item-name">${cmd.name}</span><span class="slash-item-desc">${cmd.desc}</span>`;
    li.addEventListener("mousedown", e => {
      e.preventDefault();
      applySlashCommand(cmd);
    });
    slashList.appendChild(li);
  });
  slashMenu.hidden = filtered.length === 0;
}

function updateSlashActive(idx) {
  slashActive = idx;
  Array.from(slashList.children).forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });
}

function applySlashCommand(cmd) {
  slashMenu.hidden = true;
  slashActive = -1;
  if (cmd.requiresInput) {
    textInput.value = cmd.name + " ";
    textInput.focus();
  } else {
    textInput.value = "";
    cmd.execute();
  }
}

function tryDispatchSlashCommand(value) {
  const trimmed = value.trim();
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed === cmd.name || trimmed.startsWith(cmd.name + " ")) {
      const args = trimmed.slice(cmd.name.length).trim();
      cmd.execute(args);
      return true;
    }
  }
  return false;
}

textInput.addEventListener("input", () => {
  const val = textInput.value;
  if (!val.startsWith("/")) {
    slashMenu.hidden = true;
    slashActive = -1;
    return;
  }
  const query = val.toLowerCase();
  const filtered = SLASH_COMMANDS.filter(c => c.name.startsWith(query));
  slashActive = filtered.length > 0 ? 0 : -1;
  renderSlashMenu(filtered);
});

textInput.addEventListener("blur", () => {
  setTimeout(() => { slashMenu.hidden = true; slashActive = -1; }, 120);
});

sendBtn.addEventListener("click", () => {
  if (sendBtn.classList.contains("cancel")) {
    cancelActiveRequest();
    return;
  }
  const value = textInput.value;
  textInput.value = "";
  if (tryDispatchSlashCommand(value)) {
    resetThinkingTimer();
    resetIdleCaptureTimer();
    return;
  }
  sendText(value);
  resetThinkingTimer();
  resetIdleCaptureTimer();
});

textInput.addEventListener("keydown", (event) => {
  if (slashMenuVisible()) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateSlashActive((slashActive + 1) % slashFiltered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      updateSlashActive((slashActive - 1 + slashFiltered.length) % slashFiltered.length);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const cmd = slashFiltered[slashActive >= 0 ? slashActive : 0];
      if (cmd) {
        textInput.value = cmd.name + " ";
        textInput.focus();
        slashMenu.hidden = true;
        slashActive = -1;
      }
      return;
    }
    if (event.key === "Enter" && slashActive >= 0) {
      event.preventDefault();
      const cmd = slashFiltered[slashActive] || slashFiltered[0];
      if (cmd) applySlashCommand(cmd);
      return;
    }
    if (event.key === "Escape") {
      slashMenu.hidden = true;
      slashActive = -1;
      return;
    }
  }
  if (event.key === "Enter") {
    const value = textInput.value;
    textInput.value = "";
    if (tryDispatchSlashCommand(value)) {
      resetThinkingTimer();
      resetIdleCaptureTimer();
      return;
    }
    sendText(value);
    resetThinkingTimer();
    resetIdleCaptureTimer();
  }
});

const storedPanelState = localStorage.getItem("thinkingPanelOpen");
setThinkingPanelOpen(storedPanelState !== "false");
const storedSessionPanelState = localStorage.getItem("sessionPanelOpen");
setSessionPanelOpen(storedSessionPanelState === "true");

initRecognition();

// Migration button handler
const migrateSettingsBtn = document.getElementById('migrateSettingsBtn');
const migrateSettingsStatus = document.getElementById('migrateSettingsStatus');
if (migrateSettingsBtn) {
  migrateSettingsBtn.addEventListener('click', async () => {
    migrateSettingsBtn.disabled = true;
    if (migrateSettingsStatus) migrateSettingsStatus.textContent = 'Migrating…';
    try {
      // 1. Migrate user config (all localStorage keys)
      const rawConfig = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) rawConfig[k] = localStorage.getItem(k);
      }
      await fetch('/api/config/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: rawConfig }),
      });

      // 2. Migrate sessions
      let sessions = [];
      try { sessions = JSON.parse(localStorage.getItem('chatSessions') || '[]'); } catch (_) { sessions = []; }
      if (Array.isArray(sessions) && sessions.length > 0) {
        await fetch('/api/sessions/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions }),
        });
      }

      // 3. Migrate image chat
      const rawImgChat = localStorage.getItem('imageWorkspace:chatMessages');
      if (rawImgChat) {
        let imgChatMsgs = [];
        try { imgChatMsgs = JSON.parse(rawImgChat); } catch (_) { imgChatMsgs = []; }
        if (Array.isArray(imgChatMsgs) && imgChatMsgs.length > 0) {
          await fetch('/api/image-chat', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(imgChatMsgs),
          });
        }
      }

      // 4. Migrate code workspace state
      const rawCodeWs = localStorage.getItem('codeWorkspace_v1');
      if (rawCodeWs) {
        let codeWsState = null;
        try { codeWsState = JSON.parse(rawCodeWs); } catch (_) { codeWsState = null; }
        if (codeWsState && typeof codeWsState === 'object') {
          await fetch('/api/code/workspace-state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(codeWsState),
          });
        }
      }

      // 5. Reload config cache
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        _backendConfig = await cfgRes.json();
        window._backendConfig = _backendConfig;
      }

      if (migrateSettingsStatus) migrateSettingsStatus.textContent = 'Migration complete.';
    } catch (err) {
      if (migrateSettingsStatus) migrateSettingsStatus.textContent = 'Migration failed: ' + (err.message || 'unknown error');
    } finally {
      migrateSettingsBtn.disabled = false;
    }
  });
}

async function initApp() {
  await loadBackendConfig();

  // Re-apply config-file values over the synchronous localStorage defaults
  socialModeEnabled = _cfg('socialModeEnabled', socialModeEnabled);
  searchMethod      = _cfg('searchMethod', searchMethod);
  chatMaxHistory    = _cfg('chatMaxHistory', chatMaxHistory);
  contextMaxTokens  = _cfg('contextMaxTokens', contextMaxTokens);
  ragTopK           = _cfg('ragTopK', ragTopK);

  loadPersonalities();  // MUST come after loadBackendConfig — reads _cfg('personalities')
  activePersonalityId = localStorage.getItem(ACTIVE_PERSONALITY_KEY) || "default";
  if (!personalities.find((p) => p.id === activePersonalityId)) {
    activePersonalityId = "default";
  }
  renderPersonalitySelect();
  renderPersonalityList();

  sessionId = loadSession();
  applySessionPersonalityLock(sessionId);
  updateThinkingPanel([]);
  clearThinkingMessages();
  setThinkingContext("");
  setThinkingScreenshot("", "");
  clearImage();

  currentProvider = normalizeProvider(_cfg('llmProvider', localStorage.getItem("llmProvider")));
  updateProviderButtons(currentProvider);
  setProviderBadge(currentProvider);
  loadModels();

  ttsProvider = normalizeTtsProvider(_cfg('ttsProvider', localStorage.getItem(TTS_PROVIDER_STORAGE_KEY)));
  setTtsProvider(ttsProvider);
  initVoices();
  // Apply active personality TTS after voices are initialized
  setTimeout(() => applyPersonalityTts(getActivePersonality()), 600);

  setScreenStatus("Screen: off");
  const storedIdle = localStorage.getItem("idleCaptureEnabled");
  setIdleCaptureEnabled(storedIdle === "true");
  startIdleWatcher();
  loadChatHistory();
  const storedTts = localStorage.getItem("ttsEnabled");
  setTtsEnabled(storedTts !== "false");
  const storedThinkingLoop = localStorage.getItem("thinkingLoopEnabled");
  if (storedThinkingLoop === "false") {
    thinkingLoopEnabled = false;
    if (thinkingLoopToggle) {
      thinkingLoopToggle.classList.remove("active");
      thinkingLoopToggle.classList.add("off");
      thinkingLoopToggle.setAttribute("aria-pressed", "false");
      thinkingLoopToggle.textContent = "Thinking loop: off";
    }
  }

  await refreshSessionCache();
  renderSessionList();

  if (sessionPanel && isSessionPanelOpen) {
    renderSessionList();
  }
}

initApp();

// Settings tab switching
(function initSettingsTabs() {
  const tabs = document.querySelectorAll(".settings-tab[data-settings-tab]");
  const panes = document.querySelectorAll(".settings-pane[data-settings-pane]");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.settingsTab;
      tabs.forEach(t => {
        t.classList.toggle("active", t.dataset.settingsTab === target);
        t.setAttribute("aria-selected", String(t.dataset.settingsTab === target));
      });
      panes.forEach(p => { p.hidden = p.dataset.settingsPane !== target; });
    });
  });
})();

// Workspace tab switching
(function initWorkspaceTabs() {
  const tabs = document.querySelectorAll(".workspace-tab[data-workspace]");
  const workspaces = document.querySelectorAll(".workspace[data-workspace]");

  function activate(target) {
    tabs.forEach(t => {
      t.classList.toggle("active", t.dataset.workspace === target);
      t.setAttribute("aria-pressed", String(t.dataset.workspace === target));
    });
    workspaces.forEach(w => { w.hidden = w.dataset.workspace !== target; });
    localStorage.setItem("activeWorkspace", target);
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => activate(tab.dataset.workspace));
  });

  // Restore last active workspace, defaulting to the first tab
  const saved = localStorage.getItem("activeWorkspace");
  const initial = saved && [...tabs].some(t => t.dataset.workspace === saved)
    ? saved
    : tabs[0]?.dataset.workspace;
  if (initial) activate(initial);
})();

// Interval controls
const thinkingIntervalInput = document.getElementById("thinkingIntervalInput");
const screenshotIntervalInput = document.getElementById("screenshotIntervalInput");

if (thinkingIntervalInput) {
  // Load saved value
  const savedThinking = localStorage.getItem("thinkingIntervalSeconds");
  if (savedThinking) {
    const seconds = parseInt(savedThinking, 10);
    thinkingIntervalInput.value = seconds;
    THINKING_INTERVAL_MS = seconds * 1000;
  }

  thinkingIntervalInput.addEventListener("change", () => {
    const seconds = parseInt(thinkingIntervalInput.value, 10);
    if (seconds >= 5 && seconds <= 300) {
      THINKING_INTERVAL_MS = seconds * 1000;
      localStorage.setItem("thinkingIntervalSeconds", seconds.toString());
      // Reset timer with new interval
      if (thinkingLoopEnabled && isListening) {
        scheduleNextThinkingTick();
      }
    }
  });
}

if (screenshotIntervalInput) {
  // Load saved value
  const savedScreenshot = localStorage.getItem("screenshotIntervalSeconds");
  if (savedScreenshot) {
    const seconds = parseInt(savedScreenshot, 10);
    screenshotIntervalInput.value = seconds;
    IDLE_CAPTURE_MS = seconds * 1000;
  }

  screenshotIntervalInput.addEventListener("change", () => {
    const seconds = parseInt(screenshotIntervalInput.value, 10);
    if (seconds >= 10 && seconds <= 600) {
      IDLE_CAPTURE_MS = seconds * 1000;
      localStorage.setItem("screenshotIntervalSeconds", seconds.toString());
      // Reset timer with new interval
      if (idleCaptureEnabled && isListening) {
        scheduleNextIdleCapture();
      }
    }
  });
}


// Social Mode toggle
(function initSocialMode() {
  const socialModeToggle = document.getElementById('socialModeToggle');
  const socialModeSettingsEl = document.getElementById('socialModeSettings');

  function applySocialMode(enabled) {
    socialModeEnabled = enabled;
    localStorage.setItem('socialModeEnabled', String(enabled));
    saveConfigKey('socialModeEnabled', enabled);
    socialModeToggle?.querySelectorAll('.setting-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === (enabled ? 'on' : 'off'));
    });
    if (socialModeSettingsEl) socialModeSettingsEl.hidden = !enabled;
    if (!enabled) {
      setIdleCaptureEnabled(false);
      if (thinkingLoopEnabled) {
        thinkingLoopEnabled = false;
        localStorage.setItem('thinkingLoopEnabled', 'false');
      }
    } else {
      setIdleCaptureEnabled(true);
      if (!thinkingLoopEnabled) {
        thinkingLoopEnabled = true;
        localStorage.setItem('thinkingLoopEnabled', 'true');
        if (thinkingLoopToggle) {
          thinkingLoopToggle.classList.remove('off');
          thinkingLoopToggle.classList.add('active');
          thinkingLoopToggle.setAttribute('aria-pressed', 'true');
          thinkingLoopToggle.textContent = 'Thinking loop: on';
        }
      }
    }
    window.dispatchEvent(new CustomEvent('chat:stateUpdate', {
      detail: { socialMode: enabled, idleOn: idleCaptureEnabled, loopOn: thinkingLoopEnabled }
    }));
  }

  applySocialMode(socialModeEnabled);

  socialModeToggle?.addEventListener('click', e => {
    const btn = e.target.closest('.setting-option');
    if (btn) applySocialMode(btn.dataset.value === 'on');
  });
}());
// â”€â”€ VRAM indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function updateVramIndicator() {
  try {
    const res = await fetch("/api/vram");
    if (!res.ok) return;
    const { used_gb, total_gb } = await res.json();
    if (used_gb === null || total_gb === null || total_gb === 0) {
      if (thinkingVramLabel) thinkingVramLabel.textContent = "VRAM â€”";
      return;
    }
    const pct = used_gb / total_gb;
    const circumference = 2 * Math.PI * 8; // r=8
    const filled = pct * circumference;
    if (thinkingVramArc) {
      thinkingVramArc.setAttribute("stroke-dasharray", `${filled.toFixed(2)} ${circumference.toFixed(2)}`);
    }
    if (thinkingVramLabel) {
      thinkingVramLabel.textContent = `VRAM ${used_gb}/${total_gb} GB`;
    }
  } catch (_) {}
}

updateVramIndicator();
setInterval(updateVramIndicator, 5000);

// ---------------------------------------------------------------------------
// chatBridge – exposed to React ChatWorkspace via window.chatBridge
// ---------------------------------------------------------------------------
window.chatBridge = {
  getSlashCommands() {
    return SLASH_COMMANDS.map(c => ({ name: c.name, desc: c.desc, requiresInput: !!c.requiresInput }));
  },
  tryExecuteSlashCommand(text) {
    return tryDispatchSlashCommand(text);
  },
  getState() {
    return {
      isListening,
      screenOn: Boolean(screenStream),
      idleOn: idleCaptureEnabled,
      loopOn: thinkingLoopEnabled,
      ttsOn: ttsEnabled,
      isProcessing: Boolean(activeAbortController),
      socialMode: socialModeEnabled,
      attachedImage: attachedImage
        ? { dataUrl: attachedImage.dataUrl, name: attachedImage.name }
        : null,
    };
  },
  getHistory() {
    const key = getChatHistoryKey(sessionId);
    if (!key) return [];
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  },
  sendText(text, opts) {
    // Intercept slash commands when no special options are present
    if (!opts && tryDispatchSlashCommand(text)) return;
    return sendText(text, opts);
  },
  toggleMic() {
    if (!recognition) return;
    if (isListening) {
      isListening = false;
      recognition.stop();
      startBtn?.classList.remove('active');
      startBtn?.setAttribute('aria-pressed', 'false');
    } else {
      isListening = true;
      startBtn?.classList.add('active');
      startBtn?.setAttribute('aria-pressed', 'true');
      markSpeechActivity();
      try { recognition.start(); } catch(_) { isListening = false; }
    }
    window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { isListening } }));
  },
  toggleScreen() { if (screenStream) stopScreenCapture(); else startScreenCapture(); },
  toggleIdle()   { setIdleCaptureEnabled(!idleCaptureEnabled); },
  toggleLoop() {
    thinkingLoopEnabled = !thinkingLoopEnabled;
    if (thinkingLoopToggle) {
      thinkingLoopToggle.classList.toggle('off', !thinkingLoopEnabled);
      thinkingLoopToggle.classList.toggle('active', thinkingLoopEnabled);
      thinkingLoopToggle.setAttribute('aria-pressed', String(thinkingLoopEnabled));
      thinkingLoopToggle.textContent = `Thinking loop: ${thinkingLoopEnabled ? 'on' : 'off'}`;
    }
    localStorage.setItem('thinkingLoopEnabled', String(thinkingLoopEnabled));
    window.dispatchEvent(new CustomEvent('chat:stateUpdate', { detail: { loopOn: thinkingLoopEnabled } }));
  },
  toggleTts()     { setTtsEnabled(!ttsEnabled); },
  newChat()       { newSession(); },
  openAttach()    { if (imageInput) imageInput.click(); },
  clearAttach()   { clearImage(); },
  cancelRequest() { cancelActiveRequest(); },
};

// Called by the Code workspace React hook after each API response
window.updateCodeThinking = function(data) {
  const toolCallsMade = Array.isArray(data.tool_calls_made) ? data.tool_calls_made : [];
  updateThinkingPanel(toolCallsMade);
  setRawOutput(data.raw_output || '');
  setThinkingContext(data.context_debug || '');
  updateThinkingTokenEstimate(data.context_debug || '');
};

// ---------------------------------------------------------------------------
// imageChatBridge – exposed to React ImageWorkspace via window.imageChatBridge
// ---------------------------------------------------------------------------
window.imageChatBridge = {
  sendText(text) {
    if (!text || !text.trim()) return;
    const msgId = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Show user message
    window.dispatchEvent(new CustomEvent('image-chat:add', {
      detail: { id: msgId + '-u', role: 'user', text },
    }));
    // Show typing indicator
    const typingId = msgId + '-t';
    window.dispatchEvent(new CustomEvent('image-chat:add', {
      detail: { id: typingId, role: 'typing', variant: 'typing' },
    }));

    const model = modelSelect ? modelSelect.value : null;
    const provider = currentProvider || 'ollama';

    fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        text,
        model,
        provider,
        workspace: 'image',
        hidden: false,
      }),
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        window.dispatchEvent(new CustomEvent('image-chat:add', {
          detail: { id: msgId + '-e', role: 'status', text: `Error: ${res.status}` },
        }));
        return;
      }
      const streamId = msgId + '-ai';
      window.dispatchEvent(new CustomEvent('image-chat:streamStart', {
        detail: { id: streamId },
      }));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            const obj = JSON.parse(t);
            if (obj.type === 'token') {
              const channel = obj.channel || 'spoken';
              if (channel === 'spoken') {
                window.dispatchEvent(new CustomEvent('image-chat:token', {
                  detail: { id: streamId, token: obj.text || '' },
                }));
              } else {
                // silent channel → thinking panel
                addThinkingMessage(obj.text || '', true);
              }
            } else if (obj.type === 'status') {
              window.dispatchEvent(new CustomEvent('image-chat:add', {
                detail: { id: `${msgId}-s-${Date.now()}`, role: 'status', text: obj.text || '' },
              }));
            } else if (obj.type === 'image_ready') {
              window.dispatchEvent(new CustomEvent('image-chat:imageReady', {
                detail: { url: obj.url },
              }));
              window.dispatchEvent(new CustomEvent('image:library_updated'));
            } else if (obj.type === 'done') {
              updateThinkingPanel(obj.tool_calls_made || []);
              updateThinkingTokenEstimate(obj.context_debug || '');
              setThinkingContext(obj.context_debug || '');
              if (typeof setRawOutput === 'function') setRawOutput(obj.raw_output || '');
            } else if (obj.type === 'error') {
              window.dispatchEvent(new CustomEvent('image-chat:add', {
                detail: { id: `${msgId}-e`, role: 'status', text: `Error: ${obj.detail}` },
              }));
            }
          } catch (_) {}
        }
      }
      window.dispatchEvent(new CustomEvent('image-chat:streamEnd', {
        detail: { id: streamId },
      }));
    }).catch(err => {
      window.dispatchEvent(new CustomEvent('image-chat:add', {
        detail: { id: msgId + '-e', role: 'status', text: `Error: ${err.message}` },
      }));
    });
  },
};

// ---------------------------------------------------------------------------
// Image lightbox
// ---------------------------------------------------------------------------
(function () {
  const backdrop = document.getElementById('lightboxBackdrop');
  const stage    = document.getElementById('lightboxStage');
  const img      = document.getElementById('lightboxImg');
  const zoomInBtn  = document.getElementById('lightboxZoomIn');
  const zoomOutBtn = document.getElementById('lightboxZoomOut');
  const zoomLabel  = document.getElementById('lightboxZoomLabel');
  const closeBtn   = document.getElementById('lightboxClose');

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN  = 0.25;
  const ZOOM_MAX  = 4;

  // State: translate + scale with transform-origin 0 0
  let scale = 1, tx = 0, ty = 0;

  function commit() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  // Zoom around a stage-relative point (stageX, stageY)
  function zoomAt(newScale, stageX, stageY) {
    newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newScale));
    // Image-space point that is currently under (stageX, stageY)
    const ix = (stageX - tx) / scale;
    const iy = (stageY - ty) / scale;
    // After zoom, keep that image-space point under the same stage point
    tx = stageX - ix * newScale;
    ty = stageY - iy * newScale;
    scale = newScale;
    commit();
  }

  // Zoom around viewport center (for toolbar buttons / keyboard)
  function zoomCenter(newScale) {
    zoomAt(newScale, stage.clientWidth / 2, stage.clientHeight / 2);
  }

  function initTransform() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const iw = img.naturalWidth  || img.width;
    const ih = img.naturalHeight || img.height;
    // Fit to 90% of the stage, never upscale beyond 1Ã—
    scale = Math.min(1, sw * 0.9 / iw, sh * 0.9 / ih);
    img.style.width  = iw + 'px';
    img.style.height = ih + 'px';
    // Center
    tx = (sw - iw * scale) / 2;
    ty = (sh - ih * scale) / 2;
    commit();
  }

  function open(src) {
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    if (img.src === src && img.complete) {
      initTransform();
    } else {
      img.src = src;
    }
  }

  function close() {
    backdrop.hidden = true;
    img.src = '';
    document.body.style.overflow = '';
    stage.classList.remove('panning');
  }

  img.addEventListener('load', initTransform);

  // Multi-image navigation state
  let _lbImages = [];
  let _lbIdx = 0;
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');
  const lbCounter = document.getElementById('lightboxCounter');

  function updateNav() {
    const multi = _lbImages.length > 1;
    if (prevBtn) prevBtn.style.display = multi ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = multi ? 'flex' : 'none';
    if (lbCounter) {
      lbCounter.style.display = multi ? 'block' : 'none';
      if (multi) lbCounter.textContent = `${_lbIdx + 1} / ${_lbImages.length}`;
    }
  }

  function loadIdx(idx) {
    const len = _lbImages.length;
    _lbIdx = len > 0 ? ((idx % len) + len) % len : 0;
    const src = _lbImages[_lbIdx];
    if (img.src === src && img.complete) {
      initTransform();
    } else {
      img.src = src;
    }
    updateNav();
  }

  function openFromElement(imgEl) {
    const grid = imgEl.closest('.image-grid');
    if (grid) {
      _lbImages = Array.from(grid.querySelectorAll('img.generated-image')).map(el => el.src);
    } else {
      _lbImages = [imgEl.src];
    }
    _lbIdx = Math.max(0, _lbImages.indexOf(imgEl.src));
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIdx(_lbIdx);
  }

  function openAtOverflow(grid) {
    _lbImages = Array.from(grid.querySelectorAll('img.generated-image')).map(el => el.src);
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIdx(2);
  }

  function navLightbox(delta) {
    loadIdx(_lbIdx + delta);
  }

  function open(src) {
    _lbImages = [src];
    _lbIdx = 0;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIdx(0);
  }

  function close() {
    backdrop.hidden = true;
    img.src = '';
    _lbImages = [];
    _lbIdx = 0;
    document.body.style.overflow = '';
    stage.classList.remove('panning');
    updateNav();
  }

  // Open on any chat image click (overflow badge opens at image 3)
  document.addEventListener('click', e => {
    const overflow = e.target.closest('.image-grid-overflow');
    if (overflow) {
      const grid = overflow.closest('.image-grid');
      if (grid) openAtOverflow(grid);
      return;
    }
    const target = e.target.closest('.chat-item img.generated-image');
    if (target) openFromElement(target);
  });

  closeBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
  if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); navLightbox(-1); });
  if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); navLightbox(1); });

  zoomInBtn.addEventListener('click', e => {
    e.stopPropagation();
    zoomCenter(scale + ZOOM_STEP);
  });
  zoomOutBtn.addEventListener('click', e => {
    e.stopPropagation();
    zoomCenter(scale - ZOOM_STEP);
  });

  // Wheel zoom at cursor
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Drag-to-pan + click-to-zoom (with didDrag guard)
  let dragging = false, didDrag = false;
  let dragStartX = 0, dragStartY = 0, txStart = 0, tyStart = 0;

  stage.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true;
    didDrag  = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    txStart = tx;
    tyStart = ty;
    stage.classList.add('panning');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!didDrag && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) didDrag = true;
    tx = txStart + dx;
    ty = tyStart + dy;
    commit();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('panning');
  });

  // Click image â†’ zoom in at click point; click bare stage â†’ close
  stage.addEventListener('click', e => {
    if (didDrag) { didDrag = false; return; }
    if (e.target === img) {
      const r = stage.getBoundingClientRect();
      zoomAt(scale + ZOOM_STEP, e.clientX - r.left, e.clientY - r.top);
    } else if (e.target === stage) {
      close();
    }
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (backdrop.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === '+' || e.key === '=') zoomCenter(scale + ZOOM_STEP);
    if (e.key === '-') zoomCenter(scale - ZOOM_STEP);
    if (e.key === 'ArrowLeft') { e.preventDefault(); navLightbox(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navLightbox(1); }
  });
}());

localStorage.removeItem('chatLogHeight');
setInterval(updateVramIndicator, 5000);

// ---------------------------------------------------------------------------
// Context menu (right-click actions on most-recent chat messages)
// ---------------------------------------------------------------------------
(function () {
  const ctxMenu = document.getElementById('ctxMenu');
  if (!ctxMenu) return;

  let ctxTarget = null;   // the DOM element being acted on
  let ctxRole   = null;   // 'user' | 'assistant'

  // â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getLastRealItem(role) {
    // Last non-status chat-item with the given role
    const items = Array.from(chatLog.querySelectorAll(`.chat-item.${role}`))
      .filter(el => !el.classList.contains('status') && !el.classList.contains('typing'));
    return items.length ? items[items.length - 1] : null;
  }

  function isLastRealItem(el, role) {
    return el && el === getLastRealItem(role);
  }

  /** Remove the last entry with the given role from localStorage chat history */
  function removeLastFromHistory(role) {
    const key = getChatHistoryKey(sessionId);
    if (!key) return;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { history = []; }
    if (!Array.isArray(history)) history = [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === role) {
        history.splice(i, 1);
        break;
      }
    }
    localStorage.setItem(key, JSON.stringify(history));
  }

  /** Remove the last assistant + last user entries from localStorage */
  function removeLastExchangeFromHistory() {
    removeLastFromHistory('assistant');
    removeLastFromHistory('user');
  }

  // â”€â”€ context menu display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function hideMenu() {
    ctxMenu.hidden = true;
    if (ctxTarget) {
      ctxTarget.classList.remove('ctx-target');
      ctxTarget = null;
    }
    ctxRole = null;
  }

  function buildMenuItem(label, cls, onClick) {
    const item = document.createElement('div');
    item.className = 'ctx-menu-item' + (cls ? ' ' + cls : '');
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    item.addEventListener('mousedown', e => { e.preventDefault(); });
    item.addEventListener('click', () => { hideMenu(); onClick(); });
    return item;
  }

  function buildSep() {
    const sep = document.createElement('div');
    sep.className = 'ctx-menu-sep';
    return sep;
  }

  function showMenu(x, y, items) {
    ctxMenu.innerHTML = '';
    items.forEach(item => {
      if (item === 'sep') {
        ctxMenu.appendChild(buildSep());
      } else {
        ctxMenu.appendChild(buildMenuItem(item.label, item.cls || '', item.action));
      }
    });
    ctxMenu.hidden = false;

    // Position within viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = ctxMenu.offsetWidth || 190;
    const mh = ctxMenu.offsetHeight || 100;
    ctxMenu.style.left = Math.min(x, vw - mw - 8) + 'px';
    ctxMenu.style.top  = Math.min(y, vh - mh - 8) + 'px';
  }

  // â”€â”€ actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async function actionRegenerateAssistant() {
    const prompt = lastUserPrompt;
    if (!prompt) return;

    // 1. Delete last assistant message from backend DB
    const activeP = getActivePersonality();
    try {
      await fetch(
        `/api/session/${encodeURIComponent(sessionId)}/last_assistant?personality_id=${encodeURIComponent(activeP.id)}`,
        { method: 'DELETE' }
      );
    } catch (_) {}

    // 2. Notify React to remove last AI message from state
    window.dispatchEvent(new CustomEvent('chat:removeLastRole', { detail: { role: 'ai' } }));

    // 3. Legacy DOM removal (no-op after React migration)
    const lastA = getLastRealItem('assistant');
    if (lastA) lastA.remove();

    // 4. Remove last assistant entry from localStorage
    removeLastFromHistory('assistant');

    // 5. Re-send the same prompt without re-adding user to DB
    await sendText(prompt, { regenerate: true });
  }

  async function actionDeleteAssistant() {
    const activeP = getActivePersonality();

    // 1. Delete last assistant from backend DB
    try {
      await fetch(
        `/api/session/${encodeURIComponent(sessionId)}/last_assistant?personality_id=${encodeURIComponent(activeP.id)}`,
        { method: 'DELETE' }
      );
    } catch (_) {}

    // 2. Notify React to remove last AI message from state
    window.dispatchEvent(new CustomEvent('chat:removeLastRole', { detail: { role: 'ai' } }));

    // 3. Legacy DOM removal (no-op after React migration)
    const lastA = getLastRealItem('assistant');
    if (lastA) lastA.remove();

    // 4. Remove from localStorage
    removeLastFromHistory('assistant');
  }

  async function actionDeleteExchange() {
    const activeP = getActivePersonality();

    // 1. Delete last user + assistant from backend DB
    try {
      await fetch(
        `/api/session/${encodeURIComponent(sessionId)}/last_exchange?personality_id=${encodeURIComponent(activeP.id)}`,
        { method: 'DELETE' }
      );
    } catch (_) {}

    // 2. Notify React to remove last AI and user messages from state
    window.dispatchEvent(new CustomEvent('chat:removeLastRole', { detail: { role: 'ai' } }));
    window.dispatchEvent(new CustomEvent('chat:removeLastRole', { detail: { role: 'user' } }));

    // 3. Legacy DOM removal (no-op after React migration)
    const lastA = getLastRealItem('assistant');
    if (lastA) lastA.remove();
    const lastU = getLastRealItem('user');
    if (lastU) lastU.remove();

    // 4. Remove from localStorage
    removeLastExchangeFromHistory();
  }

  function actionEditUser(el) {
    // Get current text from the body div (second child after .meta)
    const bodyEl = el.querySelector(':scope > div:not(.meta):not(.image-grid)');
    const originalText = bodyEl ? bodyEl.textContent : '';

    // Build inline edit UI
    const wrap = document.createElement('div');
    wrap.className = 'chat-edit-wrap';

    const textarea = document.createElement('textarea');
    textarea.className = 'chat-edit-input';
    textarea.value = originalText;
    textarea.rows = Math.max(2, originalText.split('\n').length);

    const actions = document.createElement('div');
    actions.className = 'chat-edit-actions';

    const sendEditBtn = document.createElement('button');
    sendEditBtn.type = 'button';
    sendEditBtn.className = 'primary small';
    sendEditBtn.textContent = 'Resend';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost small';
    cancelBtn.textContent = 'Cancel';

    actions.appendChild(sendEditBtn);
    actions.appendChild(cancelBtn);
    wrap.appendChild(textarea);
    wrap.appendChild(actions);

    // Hide existing body and show edit wrap
    if (bodyEl) bodyEl.hidden = true;
    el.appendChild(wrap);
    textarea.focus();
    textarea.select();

    function cancelEdit() {
      wrap.remove();
      if (bodyEl) bodyEl.hidden = false;
    }

    cancelBtn.addEventListener('click', cancelEdit);

    async function submitEdit() {
      const newText = textarea.value.trim();
      if (!newText) return;
      cancelEdit();
      await actionDeleteExchange();
      await sendText(newText);
      resetThinkingTimer();
      resetIdleCaptureTimer();
    }

    sendEditBtn.addEventListener('click', submitEdit);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === 'Escape') {
        cancelEdit();
      }
    });
  }

  // â”€â”€ right-click handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  chatLog.addEventListener('contextmenu', e => {
    const item = e.target.closest('.chat-item');
    if (!item) return;

    // Only allow on most-recent assistant or user item (no status items)
    const isAssistant = item.classList.contains('assistant') && !item.classList.contains('status');
    const isUser      = item.classList.contains('user')      && !item.classList.contains('status');
    if (!isAssistant && !isUser) return;

    const role = isAssistant ? 'assistant' : 'user';
    if (!isLastRealItem(item, role)) return;

    e.preventDefault();
    hideMenu();

    ctxTarget = item;
    ctxRole   = role;
    item.classList.add('ctx-target');

    const menuItems = isAssistant
      ? [
          { label: 'â†º  Regenerate response', action: actionRegenerateAssistant },
          'sep',
          { label: 'âœ•  Delete response', cls: 'danger', action: actionDeleteAssistant },
        ]
      : [
          { label: 'âœŽ  Edit & resend', action: () => { actionEditUser(item); } },
          'sep',
          { label: 'âœ•  Delete message', cls: 'danger', action: actionDeleteExchange },
        ];

    showMenu(e.clientX, e.clientY, menuItems);
  });

  // â”€â”€ close on outside click / scroll / Escape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  document.addEventListener('click', e => {
    if (!ctxMenu.hidden && !ctxMenu.contains(e.target)) hideMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !ctxMenu.hidden) hideMenu();
  });

  document.addEventListener('scroll', () => { if (!ctxMenu.hidden) hideMenu(); }, true);

  // Expose actions to the React workspace via chatBridge
  window.chatBridge.regenerateAssistant = actionRegenerateAssistant;
  window.chatBridge.deleteLastAssistant  = actionDeleteAssistant;
  window.chatBridge.deleteLastExchange   = actionDeleteExchange;
  window.chatBridge.resendText = async (text) => {
    await actionDeleteExchange();
    await sendText(text);
    resetThinkingTimer();
    resetIdleCaptureTimer();
  };
}());

