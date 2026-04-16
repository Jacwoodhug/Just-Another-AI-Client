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
const thinkingContextToggle = document.getElementById("contextToggle");
const thinkingContextBody = document.getElementById("thinkingContext");
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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isListening = false;
let sessionId = null;
let pendingTranscript = "";
let sendTimeoutId = null;
let speechBuffer = "";
let attachedImage = null;
let screenStream = null;
let screenVideo = null;
let idleCaptureEnabled = false;
let idleCaptureTimerId = null;
let idleCaptureInProgress = false;
let lastSpeechTime = Date.now();
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
let kokoroAbortController = null;
let kokoroCurrentAudio = null;
const SESSION_STORAGE_KEY = "chatSessions";
const SEARCH_METHOD_KEY = "searchMethod";
let searchMethod = localStorage.getItem(SEARCH_METHOD_KEY) || "searxng";
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
let pendingScreenshotDataUrl = "";
let pendingScreenshotLabel = "";

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
  setSessionStatusById(newId);
  editingSessionId = null;
  editingSessionDraft = "";
  chatLog.innerHTML = "";
  updateThinkingPanel([]);
  clearThinkingMessages();
  setThinkingContext("");
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
  if (voicePill) {
    voicePill.classList.toggle("tts-hidden", !enabled);
    voicePill.setAttribute("aria-hidden", String(!enabled));
  }
  if (voiceTestBtn) {
    voiceTestBtn.classList.toggle("tts-hidden", !enabled);
    voiceTestBtn.setAttribute("aria-hidden", String(!enabled));
  }
  updateTtsControls();
  localStorage.setItem("ttsEnabled", String(enabled));
  if (!enabled) {
    stopTtsPlayback();
  }
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
    voiceSelect.disabled = !ttsEnabled || !hasVoices;
  }
  if (voiceTestBtn) {
    voiceTestBtn.disabled = !ttsEnabled || !hasVoices;
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
    !layout.classList.contains("sessions-collapsed") &&
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
  return `${entry.id.slice(0, 8)} • ${stamp}`;
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
  updateThinkingPanel([]);
  clearThinkingMessages();
  setThinkingContext("");
  setThinkingScreenshot("", "");
  loadChatHistory();
  renderSessionList();
}

function renderSessionList() {
  if (!sessionList) {
    return;
  }
  const sessions = getSessions().sort(
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
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "small";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
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

      actions.appendChild(openBtn);
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
    `Delete session "${name}"? This cannot be undone.`
  );
  if (!confirmDelete) {
    return;
  }

  const sessions = getSessions().filter((session) => session.id !== id);
  saveSessions(sessions);
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
  if (!layout || !sessionPanel) {
    return;
  }
  layout.classList.toggle("sessions-collapsed", !open);
  sessionPanel.setAttribute("aria-hidden", String(!open));
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

function saveChatMessage(role, text) {
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
  history.push({ role, text: trimmed });
  if (history.length > CHAT_HISTORY_LIMIT) {
    history = history.slice(-CHAT_HISTORY_LIMIT);
  }
  localStorage.setItem(key, JSON.stringify(history));
  touchSession(sessionId);
}

function loadChatHistory() {
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
  if (!Array.isArray(history) || history.length === 0) {
    return;
  }
  chatLog.innerHTML = "";
  history.forEach((item) => {
    if (!item || !item.text) {
      return;
    }
    const role = item.role === "assistant" ? "assistant" : "user";
    createChatItem(role, item.text);
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
  }
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
  }
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
  if (!layout || !thinkingPanel) {
    return;
  }
  layout.classList.toggle("panel-collapsed", !open);
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
  };
  reader.readAsDataURL(file);
}

function createChatItem(role, text, variant) {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  if (variant) {
    item.classList.add(variant);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = role === "user" ? "You" : "Assistant";

  const body = document.createElement("div");
  body.textContent = text;

  item.appendChild(meta);
  item.appendChild(body);
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return { item, body };
}

function addChat(role, text) {
  createChatItem(role, text);
  saveChatMessage(role, text);
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
  if (kokoroAbortController) {
    kokoroAbortController.abort();
    kokoroAbortController = null;
  }
  clearKokoroQueue();
  if (kokoroCurrentAudio) {
    if (kokoroCurrentAudio.src.startsWith("blob:")) {
      URL.revokeObjectURL(kokoroCurrentAudio.src);
    }
    kokoroCurrentAudio.pause();
    kokoroCurrentAudio.src = "";
    kokoroCurrentAudio = null;
  }
}

function clearKokoroQueue() {
  kokoroQueue.forEach((item) => {
    if (item.prefetchController) {
      item.prefetchController.abort();
    }
    if (item.audioUrl) {
      URL.revokeObjectURL(item.audioUrl);
    }
  });
  kokoroQueue = [];
}

async function fetchKokoroAudio(text, signal) {
  const voice = voiceSelect ? voiceSelect.value : "";
  const payload = { text: sanitizeTtsText(text) };
  if (voice) {
    payload.voice = voice;
  }
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const errorText = await response.text();
    createChatItem(
      "assistant",
      `Kokoro TTS error: ${errorText || response.statusText}`,
      "status"
    );
    return "";
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
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
    audioUrl: "",
    prefetchPromise: null,
    prefetchController: null,
  });
  if (!kokoroPlaying) {
    playNextKokoro();
  } else {
    prefetchNextKokoro();
  }
}

function prefetchNextKokoro() {
  const next = kokoroQueue[0];
  if (!next || next.audioUrl || next.prefetchPromise) {
    return;
  }
  const controller = new AbortController();
  next.prefetchController = controller;
  next.prefetchPromise = fetchKokoroAudio(next.text, controller.signal)
    .then((url) => {
      if (next.generation !== kokoroGeneration) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        return "";
      }
      next.audioUrl = url;
      return url;
    })
    .catch(() => "");
}

async function playNextKokoro() {
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
  let audioUrl = "";
  try {
    if (item.audioUrl) {
      audioUrl = item.audioUrl;
    } else if (item.prefetchPromise) {
      audioUrl = await item.prefetchPromise;
    } else {
      const controller = new AbortController();
      kokoroAbortController = controller;
      audioUrl = await fetchKokoroAudio(item.text, controller.signal);
      kokoroAbortController = null;
    }
  } catch (error) {
    audioUrl = "";
  }
  if (!audioUrl || item.generation !== kokoroGeneration) {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    playNextKokoro();
    return;
  }
  const audio = new Audio(audioUrl);
  kokoroCurrentAudio = audio;
  audio.onended = () => {
    URL.revokeObjectURL(audioUrl);
    if (item.generation === kokoroGeneration) {
      playNextKokoro();
    }
  };
  audio.onerror = () => {
    URL.revokeObjectURL(audioUrl);
    if (item.generation === kokoroGeneration) {
      playNextKokoro();
    }
  };
  audio.play().catch(() => {
    URL.revokeObjectURL(audioUrl);
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

    if (force || working.length > 200) {
      let cut = working.lastIndexOf(" ", 180);
      if (cut < 40) {
        cut = Math.min(working.length, 180);
      }
      chunks.push(working.slice(0, cut).trim());
      working = working.slice(cut).trimStart();
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
    addChat("assistant", spokenText);
    speak(spokenText);
  }
  if (silentText) {
    addThinkingMessage(silentText);
  } else if (!spokenText && !requestedScreenshot) {
    addThinkingMessage("Assistant chose to stay silent.");
  }

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
  if (!hidden) {
    addChat("user", userLabel);
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

  let assistantItem = null;
  let silentDraftItem = null;

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      await sendTextNonStream(payload, shouldClearAttachment, trimmed);
      return;
    }

    let spokenText = "";
    let silentText = "";
    let receivedMeta = false;
    let streamHadError = false;
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
          const toolCalls = Array.isArray(message.tool_calls_made)
            ? message.tool_calls_made
            : [];
          updateThinkingPanel(toolCalls);
          setThinkingContext(message.context_debug || "");
          updateThinkingTokenEstimate(message.context_debug || "");
          silentDraftItem = null;
          silentText = "";
          continue;
        }

        if (message.type === "status") {
          if (message.text) {
            addStatus(message.text);
          }
          continue;
        }

        if (message.type === "request_screenshot") {
          requestedScreenshot = true;
          requestReason = message.reason || "";
          continue;
        }

        if (message.type === "token") {
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
            assistantItem = createChatItem("assistant", "");
          }
          const spokenDisplay = spokenText.trimEnd();
          assistantItem.body.textContent = spokenDisplay;
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
          if (!spokenText.trim() && !silentText.trim() && !requestedScreenshot) {
            addThinkingMessage("Assistant chose to stay silent.");
          }
          if (spokenText.trim()) {
            saveChatMessage("assistant", spokenText);
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
    await sendTextNonStream(payload, shouldClearAttachment, trimmed);
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
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  recognition.onend = () => {
    setMic("Mic: idle");
    if (isListening) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      recognition.start();
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  };

  recognition.onerror = () => {
    setMic("Mic: error");
    if (isListening) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      return;
    }
    startBtn.disabled = false;
    stopBtn.disabled = true;
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
  const storedVoice = localStorage.getItem(getTtsVoiceStorageKey("browser"));
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
    const storedVoice = localStorage.getItem(getTtsVoiceStorageKey("kokoro"));
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
    thinkingLoopToggle.textContent = `Thinking loop: ${thinkingLoopEnabled ? "on" : "off"}`;
  });
}

startBtn.addEventListener("click", () => {
  if (!recognition) {
    return;
  }
  if (isListening) {
    return;
  }
  isListening = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  markSpeechActivity();
  try {
    recognition.start();
  } catch (error) {
    isListening = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

stopBtn.addEventListener("click", () => {
  if (!recognition) {
    return;
  }
  if (!isListening) {
    return;
  }
  isListening = false;
  recognition.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

newChatBtn.addEventListener("click", () => {
  newSession();
});

if (thinkingToggle) {
  thinkingToggle.addEventListener("click", () => {
    const isOpen =
      layout && !layout.classList.contains("panel-collapsed");
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

// Settings modal
function updateSearchMethodUI() {
  if (!searchMethodToggle) return;
  searchMethodToggle.querySelectorAll(".setting-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === searchMethod);
  });
}

function openSettings() {
  if (settingsBackdrop) settingsBackdrop.hidden = false;
  checkKokoroStatus();
}

function closeSettings() {
  if (settingsBackdrop) settingsBackdrop.hidden = true;
}

// ── Kokoro TTS service management ───────────────────────────────────────────

let kokoroServiceRunning = false;
let kokoroServiceAvailable = false;
let kokoroServiceBusy = false;

function updateKokoroUI() {
  if (!kokoroToggleBtn || !kokoroStatusDot || !kokoroStatusText) return;

  kokoroStatusDot.classList.remove("running", "stopped", "unavailable");

  if (!kokoroServiceAvailable) {
    kokoroStatusDot.classList.add("unavailable");
    kokoroStatusText.textContent = "Unavailable";
    kokoroToggleBtn.textContent = "Launch";
    kokoroToggleBtn.disabled = true;
  } else if (kokoroServiceBusy) {
    kokoroStatusDot.classList.add("stopped");
    kokoroStatusText.textContent = kokoroServiceRunning ? "Stopping…" : "Starting…";
    kokoroToggleBtn.textContent = kokoroServiceRunning ? "Close" : "Launch";
    kokoroToggleBtn.disabled = true;
  } else if (kokoroServiceRunning) {
    kokoroStatusDot.classList.add("running");
    kokoroStatusText.textContent = "Running";
    kokoroToggleBtn.textContent = "Close";
    kokoroToggleBtn.disabled = false;
  } else {
    kokoroStatusDot.classList.add("stopped");
    kokoroStatusText.textContent = "Stopped";
    kokoroToggleBtn.textContent = "Launch";
    kokoroToggleBtn.disabled = false;
  }
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
    // ignore – status check below will update UI
  }

  kokoroServiceBusy = false;
  await checkKokoroStatus();
}

if (kokoroToggleBtn) {
  kokoroToggleBtn.addEventListener("click", toggleKokoroService);
}

checkKokoroStatus();

updateSearchMethodUI();

if (settingsBtn) {
  settingsBtn.addEventListener("click", openSettings);
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
    updateSearchMethodUI();
  });
}

// ── Personality system ──────────────────────────────────────────────────────

function loadPersonalities() {
  try {
    personalities = JSON.parse(localStorage.getItem(PERSONALITIES_KEY) || "[]");
  } catch (_) {
    personalities = [];
  }
  if (!personalities.find((p) => p.id === "default")) {
    personalities.unshift({ ...DEFAULT_PERSONALITY });
  }
}

function savePersonalities() {
  localStorage.setItem(PERSONALITIES_KEY, JSON.stringify(personalities));
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
  peTtsVoiceSelect.innerHTML = '<option value="">— none —</option>';
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
  } else {
    if (personalityEditorTitle) personalityEditorTitle.textContent = "New Personality";
    if (peNameInput) peNameInput.value = "";
    if (peToneInput) peToneInput.value = DEFAULT_TONE_CONTEXT;
    peTtsProvider = "browser";
    peUpdateTtsProviderUI();
    populatePeVoiceSelect("");
    if (peSeparateMemory) peSeparateMemory.checked = false;
  }
  showPersonalityEditor(true);
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

  if (peEditingId) {
    const idx = personalities.findIndex((p) => p.id === peEditingId);
    if (idx !== -1) {
      personalities[idx] = { ...personalities[idx], name, toneContext, ttsProvider: peTtsProvider, ttsVoice, separateMemory };
    }
  } else {
    personalities.push({
      id: crypto.randomUUID(),
      name,
      toneContext,
      ttsProvider: peTtsProvider,
      ttsVoice,
      separateMemory,
    });
  }
  savePersonalities();
  renderPersonalityList();
  renderPersonalitySelect();
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

// Init personalities
loadPersonalities();
activePersonalityId = localStorage.getItem(ACTIVE_PERSONALITY_KEY) || "default";
if (!personalities.find((p) => p.id === activePersonalityId)) {
  activePersonalityId = "default";
}
renderPersonalitySelect();
renderPersonalityList();

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
    sessions.push({ id: newId, name: sessionName, personalityId: chosenId, createdAt: now, updatedAt: now });
    saveSessions(sessions);
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
    const isOpen =
      layout && !layout.classList.contains("sessions-collapsed");
    setSessionPanelOpen(!isOpen);
  });
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
    updateProviderButtons(currentProvider);
    loadModels();
  });
}

if (modelSelect) {
  modelSelect.addEventListener("change", () => {
    const selected = modelSelect.value;
    if (selected) {
      localStorage.setItem(getModelStorageKey(currentProvider), selected);
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

sendBtn.addEventListener("click", () => {
  const value = textInput.value;
  textInput.value = "";
  sendText(value);
  resetThinkingTimer();
  resetIdleCaptureTimer();
});

textInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const value = textInput.value;
    textInput.value = "";
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
sessionId = loadSession();
applySessionPersonalityLock(sessionId);
updateThinkingPanel([]);
clearThinkingMessages();
setThinkingContext("");
setThinkingScreenshot("", "");
clearImage();
currentProvider = normalizeProvider(localStorage.getItem("llmProvider"));
updateProviderButtons(currentProvider);
setProviderBadge(currentProvider);
loadModels();
ttsProvider = normalizeTtsProvider(localStorage.getItem(TTS_PROVIDER_STORAGE_KEY));
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
if (sessionPanel && !layout.classList.contains("sessions-collapsed")) {
  renderSessionList();
}

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
