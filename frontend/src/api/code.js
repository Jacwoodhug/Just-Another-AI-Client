// Thin fetch wrappers for all /api/code/* endpoints.
// All functions return parsed JSON (or throw on HTTP error).

async function _post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function _get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  return r.json();
}

/** Open native folder picker, returns { path, error } */
export function pickFolder() {
  return _get('/api/code/pick-folder');
}

/** Recursive file tree for the given root paths */
export function getFiles(paths) {
  const p = new URLSearchParams();
  paths.forEach(d => p.append('paths', d));
  return _get('/api/code/files?' + p);
}

/** Read raw file content */
export function readFile(path) {
  return _get('/api/code/read?path=' + encodeURIComponent(path));
}

/**
 * Approve or deny the pending tool call.
 * action: 'allow_once' | 'allow_add_scope' | 'deny'
 */
export function approve(codeSessionId, callId, action) {
  return _post('/api/code/approve', { code_session_id: codeSessionId, call_id: callId, action });
}

/** Open a file location in the system file explorer */
export function openLocation(path) {
  return _get('/api/code/open-location?path=' + encodeURIComponent(path));
}

/** Undo the last change group */
export function undo(codeSessionId) {
  return _post('/api/code/undo', { code_session_id: codeSessionId });
}

/** Redo the last undone change group */
export function redo(codeSessionId) {
  return _post('/api/code/redo', { code_session_id: codeSessionId });
}

/** Revert a single file to its before-state from a specific change */
export function revert(codeSessionId, changeId, path) {
  return _post('/api/code/revert', { code_session_id: codeSessionId, change_id: changeId, path });
}

/** List change groups for a session */
export function getHistory(codeSessionId) {
  return _get('/api/code/history?code_session_id=' + encodeURIComponent(codeSessionId));
}

/** Clear history (pass null sessionId to clear all) */
export function clearHistory(codeSessionId) {
  return _post('/api/code/history/clear', { code_session_id: codeSessionId ?? null });
}

/** Set storage limit in bytes */
export function setLimit(limitBytes) {
  return _post('/api/code/history/limit', { limit_bytes: limitBytes });
}

/** Get current undo/redo summaries */
export function getUndoRedoState(codeSessionId) {
  return _get('/api/code/undo-redo-state?code_session_id=' + encodeURIComponent(codeSessionId));
}

/** Send a chat message in code workspace mode */
export function sendChat(payload) {
  return _post('/api/chat', payload);
}
