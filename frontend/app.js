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
const thinkingSummary = document.getElementById("thinkingSummary");
const thinkingSilentList = document.getElementById("thinkingSilentList");
const thinkingMemory = document.getElementById("thinkingMemory");
const thinkingSearchQuery = document.getElementById("thinkingSearchQuery");
const thinkingSearchResults = document.getElementById("thinkingSearchResults");

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
const SESSION_STORAGE_KEY = "chatSessions";
let editingSessionId = null;
let editingSessionDraft = "";
let screenshotRequestInProgress = false;
let lastUserPrompt = "";

function isSpeechActive() {
  // Check if user is actively speaking (has pending transcript)
  if (pendingTranscript) {
    return true;
  }
  // Check if TTS is currently speaking
  if (window.speechSynthesis && speechSynthesis.speaking) {
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
  updateThinkingPanel("", [], "", []);
  clearThinkingMessages();
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
    if (!enabled) {
      voiceTestBtn.disabled = true;
    }
  }
  if (voiceSelect) {
    if (!enabled) {
      voiceSelect.disabled = true;
    } else if (window.speechSynthesis) {
      voiceSelect.disabled = speechSynthesis.getVoices().length === 0;
    }
  }
  if (enabled && voiceTestBtn && window.speechSynthesis) {
    voiceTestBtn.disabled = speechSynthesis.getVoices().length === 0;
  }
  localStorage.setItem("ttsEnabled", String(enabled));
  if (!enabled && window.speechSynthesis) {
    speechSynthesis.cancel();
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

function ensureSessionEntry(id) {
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
    sessions.push(entry);
    saveSessions(sessions);
  }
  return entry;
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
  editingSessionId = null;
  editingSessionDraft = "";
  pendingTranscript = "";
  interimText.textContent = "...";
  chatLog.innerHTML = "";
  updateThinkingPanel("", [], "", []);
  clearThinkingMessages();
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

      actions.appendChild(openBtn);
      actions.appendChild(renameBtn);
    }

    item.appendChild(main);
    item.appendChild(actions);
    sessionList.appendChild(item);
  });
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

function updateThinkingPanel(summary, memoryUsed, searchQuery, searchResults) {
  if (thinkingSummary) {
    thinkingSummary.textContent = summary || "No summary yet.";
  }
  if (thinkingSearchQuery) {
    thinkingSearchQuery.textContent = searchQuery
      ? `Query: ${searchQuery}`
      : "No search yet.";
  }
  if (thinkingSearchResults) {
    thinkingSearchResults.innerHTML = "";
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      searchResults.forEach((item) => {
        const li = document.createElement("li");
        const title = item.title || item.url || "Result";
        if (item.url) {
          const link = document.createElement("a");
          link.href = item.url;
          link.textContent = title;
          link.target = "_blank";
          link.rel = "noreferrer";
          li.appendChild(link);
        } else {
          li.textContent = title;
        }
        if (item.snippet) {
          const snippet = document.createElement("div");
          snippet.textContent = item.snippet;
          li.appendChild(snippet);
        }
        thinkingSearchResults.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No results.";
      thinkingSearchResults.appendChild(li);
    }
  }
  if (thinkingMemory) {
    thinkingMemory.innerHTML = "";
    if (Array.isArray(memoryUsed) && memoryUsed.length > 0) {
      memoryUsed.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        thinkingMemory.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No memory used.";
      thinkingMemory.appendChild(li);
    }
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
  const storedVoice = localStorage.getItem("ttsVoice");
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
  if (!window.speechSynthesis) {
    return;
  }
  if (!ttsEnabled) {
    return;
  }
  if (interrupt && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  speechSynthesis.speak(buildUtterance(text));
}

function queueSpeech(text) {
  if (!window.speechSynthesis) {
    return;
  }
  if (!ttsEnabled) {
    return;
  }
  speechSynthesis.speak(buildUtterance(text));
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
  if (data.request_screenshot) {
    await requestScreenshotFromAssistant({
      promptText: sourceText,
      reason: data.request_reason,
    });
    return;
  }

  const summary = data.thinking_summary;
  const memoryUsed = Array.isArray(data.memory_used) ? data.memory_used : [];
  const searchQuery = data.search_query || "";
  const searchResults = Array.isArray(data.search_results)
    ? data.search_results
    : [];
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

  updateThinkingPanel(summary, searchQuery, searchResults, memoryUsed);
  // Double requestAnimationFrame ensures scroll happens after layout is complete
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
    });
  });

  updateThinkingPanel(summary, memoryUsed, searchQuery, searchResults);
  if (requestedScreenshot) {
    requestScreenshotFromAssistant({ promptText: sourceText });
  }
  if (shouldClearAttachment) {
    clearImage();
  }
}

async function sendText(text, options = {}) {
  const trimmed = (text || "").trim();
  const hidden = Boolean(options.hidden);
  const screenshotFollowup = Boolean(options.screenshotFollowup);
  const overrideImage = (options.imageBase64 || "").trim();
  const usingAttachment = !overrideImage && attachedImage && attachedImage.base64;
  const imageBase64 = overrideImage || (usingAttachment ? attachedImage.base64 : "");
  if (!trimmed && !imageBase64) {
    return;
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
  if (window.speechSynthesis && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const payload = { session_id: sessionId };
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
    let lastSummary = "";
    let lastMemory = [];
    let streamHadError = false;
    speechBuffer = "";
    let requestedScreenshot = false;
    let requestReason = "";

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
          lastSummary = message.thinking_summary || "";
          lastMemory = Array.isArray(message.memory_used)
            ? message.memory_used
            : [];
          const searchQuery = message.search_query || "";
          const searchResults = Array.isArray(message.search_results)
            ? message.search_results
            : [];
          updateThinkingPanel(lastSummary, lastMemory, searchQuery, searchResults);
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
              silentDraftItem.textContent = silentText.trim();
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
          assistantItem.body.textContent = spokenText.trim();
          const speechChunk = message.text
            .split(SCREENSHOT_REQUEST_TOKEN)
            .join(" ");
          speechBuffer += speechChunk;
          flushSpeechBuffer(false);
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
            requestScreenshotFromAssistant({
              promptText: trimmed,
              reason: requestReason,
            });
          }
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

function populateVoices() {
  if (!voiceSelect || !window.speechSynthesis) {
    return;
  }
  const voices = speechSynthesis.getVoices();
  if (!voices.length) {
    return;
  }
  voiceSelect.innerHTML = "";
  const storedVoice = localStorage.getItem("ttsVoice");
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
    localStorage.setItem("ttsVoice", selectedVoice.name);
  }
  const isDisabled = !ttsEnabled || voices.length === 0;
  voiceSelect.disabled = isDisabled;
  if (voiceTestBtn) {
    voiceTestBtn.disabled = isDisabled;
  }
}

function initVoices() {
  if (!voiceSelect || !voiceTestBtn) {
    return;
  }
  voiceSelect.disabled = true;
  voiceTestBtn.disabled = true;
  if (!window.speechSynthesis) {
    return;
  }
  populateVoices();
  speechSynthesis.addEventListener("voiceschanged", populateVoices);
  populateVoices();
  speechSynthesis.addEventListener("voiceschanged", populateVoices);
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
      localStorage.setItem("ttsVoice", voiceSelect.value);
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
updateThinkingPanel("", [], "", []);
clearThinkingMessages();
clearImage();
currentProvider = normalizeProvider(localStorage.getItem("llmProvider"));
updateProviderButtons(currentProvider);
setProviderBadge(currentProvider);
loadModels();
initVoices();
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
