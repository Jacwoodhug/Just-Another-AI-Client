import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../api/code.js';
import { getCodeWorkspaceState, putCodeWorkspaceState } from '../api/config.js';

const LS_KEY = 'codeWorkspace_v1';

function genSessionId() {
  return 'code_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

export function useCodeWorkspace() {
  const saved = loadState();

  const [sessionId]     = useState(() => saved?.sessionId || genSessionId());
  const [dirs, setDirs] = useState(() => saved?.dirs || []);
  // Sets stored as arrays in localStorage, converted to Set in state
  const [selected,  setSelected]  = useState(() => new Set(saved?.sel  || []));
  const [prevented, setPrevented] = useState(() => new Set(saved?.prev || []));
  const [hidden,    setHidden]    = useState(() => new Set(saved?.hid  || []));
  const [runTimeout, setRunTimeout]   = useState(() => saved?.to  ?? 30);
  const [runOutCap,  setRunOutCap]    = useState(() => saved?.cap ?? 50);

  const [treeData, setTreeData]             = useState([]);
  const [log, setLog]                       = useState(() => {
    if (!saved?.log) return [];
    // Pending approvals can't be acted on after a reload — mark them expired
    return saved.log.map(e =>
      e.type === 'approval' && !['approved', 'denied', 'expired'].includes(e.status)
        ? { ...e, status: 'expired' }
        : e
    );
  });
  const [pendingApproval, setPendingApproval] = useState(null);
  const [running, setRunning]               = useState(false);
  const [undoSummary, setUndoSummary]       = useState(null);
  const [redoSummary, setRedoSummary]       = useState(null);
  const [histUsage, setHistUsage]           = useState({ used: 0, limit: 1_073_741_824 });

  // Persist whenever these change
  const saveRef = useRef(null);
  useEffect(() => {
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      const state = {
        sessionId,
        dirs,
        sel:  [...selected],
        prev: [...prevented],
        hid:  [...hidden],
        to:   runTimeout,
        cap:  runOutCap,
        log,
      };
      saveState(state);
      putCodeWorkspaceState(state).catch(() => {});
    }, 200);
  }, [sessionId, dirs, selected, prevented, hidden, runTimeout, runOutCap, log]);

  // Load state from backend on mount (overrides localStorage)
  useEffect(() => {
    getCodeWorkspaceState().then(s => {
      if (!s || typeof s !== 'object') return;
      if (Array.isArray(s.dirs)) setDirs(s.dirs);
      if (Array.isArray(s.sel)) setSelected(new Set(s.sel));
      if (Array.isArray(s.prev)) setPrevented(new Set(s.prev));
      if (Array.isArray(s.hid)) setHidden(new Set(s.hid));
      if (s.to !== undefined) setRunTimeout(s.to);
      if (s.cap !== undefined) setRunOutCap(s.cap);
      if (Array.isArray(s.log)) {
        setLog(s.log.map(e =>
          e.type === 'approval' && !['approved', 'denied', 'expired'].includes(e.status)
            ? { ...e, status: 'expired' }
            : e
        ));
      }
    }).catch(() => {});
  }, []);

  // ── Tree ────────────────────────────────────────────────────────────────
  const refreshTree = useCallback(async () => {
    if (!dirs.length) { setTreeData([]); return; }
    try {
      const data = await api.getFiles(dirs);
      setTreeData(data);
    } catch (err) {
      setLog(prev => [...prev, { type: 'text', text: 'File tree error: ' + err.message }]);
    }
  }, [dirs]);

  useEffect(() => { if (dirs.length) refreshTree(); }, [dirs]);

  // ── Folder picker ────────────────────────────────────────────────────────
  const pickFolder = useCallback(async () => {
    try {
      const d = await api.pickFolder();
      if (d.path) {
        setDirs(prev => prev.includes(d.path) ? prev : [...prev, d.path]);
      } else if (d.error) {
        setLog(prev => [...prev, { type: 'text', text: 'Folder picker error: ' + d.error }]);
      }
    } catch (err) {
      setLog(prev => [...prev, { type: 'text', text: 'Folder picker error: ' + err.message }]);
    }
  }, []);

  const removeDir = useCallback(path => {
    setDirs(prev => prev.filter(d => d !== path));
  }, []);

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleSelected  = useCallback(path => setSelected(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; }), []);
  const togglePrevented = useCallback(path => setPrevented(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; }), []);
  const toggleHidden    = useCallback(path => setHidden(s => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; }), []);

  // ── Undo/Redo state ──────────────────────────────────────────────────────
  const fetchUndoRedo = useCallback(async () => {
    try {
      const d = await api.getUndoRedoState(sessionId);
      setUndoSummary(d.next_undo_summary || null);
      setRedoSummary(d.next_redo_summary || null);
    } catch {}
  }, [sessionId]);

  // ── Response handler ─────────────────────────────────────────────────────
  function _handleResp(data, lastApprovalPath) {
    window.updateCodeThinking?.(data);

    const entries = [];

    for (const ae of (data.auto_executed || [])) {
      if (ae.tool_name === 'runCommand') {
        entries.push({ type: 'console', text: ae.result_text });
      } else {
        entries.push({ type: 'info', toolName: ae.tool_name, args: ae.args, text: ae.result_text });
      }
    }

    if (data.original_content !== undefined && data.original_content !== null) {
      entries.push({
        type: 'diff',
        original: data.original_content,
        next: data.new_content,
        path: lastApprovalPath || '',
      });
    }

    if (data.assistant_text) {
      entries.push({ type: 'text', text: data.assistant_text });
    }

    if (entries.length) setLog(prev => [...prev, ...entries]);

    if (data.change_id) refreshTree();

    setUndoSummary(data.next_undo_summary || null);
    setRedoSummary(data.next_redo_summary || null);

    if (data.pending_tool_approval) {
      setPendingApproval(data.pending_tool_approval);
      setLog(prev => [...prev, { type: 'approval', approval: data.pending_tool_approval }]);
    } else {
      setPendingApproval(null);
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    text = text.trim();
    if (!text || running) return;
    setRunning(true);
    setLog(prev => [...prev, { type: 'user', text }]);

    const payload = {
      workspace: 'code',
      code_session_id: sessionId,
      text,
      workspace_dirs: dirs,
      pre_approved_read_paths: [...selected],
      prevented_paths: [...prevented],
      hidden_paths: [...hidden],
      run_timeout_seconds: runTimeout,
      run_output_cap_kb: runOutCap,
    };
    // Reuse global model/provider from vanilla JS if available
    const modelEl = document.getElementById('modelSelect');
    if (modelEl?.value) payload.model = modelEl.value;
    const provBtn = document.querySelector('.seg-btn[aria-pressed="true"]');
    if (provBtn?.dataset?.provider) payload.provider = provBtn.dataset.provider;

    try {
      const data = await api.sendChat(payload);
      _handleResp(data, null);
    } catch (err) {
      setLog(prev => [...prev, { type: 'text', text: 'Error: ' + err.message }]);
    } finally {
      setRunning(false);
    }
  }, [running, sessionId, dirs, selected, prevented, hidden, runTimeout, runOutCap]);

  // ── Approve / Deny ───────────────────────────────────────────────────────
  const sendApproval = useCallback(async (callId, approved, pathOrCmd) => {
    if (!approved) {
      setPendingApproval(null);
      setLog(prev => prev.map(e =>
        e.type === 'approval' && e.approval?.call_id === callId
          ? { ...e, status: 'denied' }
          : e
      ));
      return;
    }
    setLog(prev => prev.map(e =>
      e.type === 'approval' && e.approval?.call_id === callId
        ? { ...e, status: 'approved' }
        : e
    ));
    try {
      const data = await api.approve(sessionId, callId, true);
      _handleResp(data, pathOrCmd);
    } catch (err) {
      setLog(prev => [...prev, { type: 'text', text: 'Approval error: ' + err.message }]);
    }
  }, [sessionId]);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const doUndo = useCallback(async () => {
    try {
      const d = await api.undo(sessionId);
      if (d.ok) {
        setLog(prev => [...prev, { type: 'text', text: '↶ Undid changes to: ' + (d.restored_files || []).join(', ') }]);
        refreshTree();
        fetchUndoRedo();
      }
    } catch {}
  }, [sessionId, refreshTree, fetchUndoRedo]);

  // ── Redo ─────────────────────────────────────────────────────────────────
  const doRedo = useCallback(async () => {
    try {
      const d = await api.redo(sessionId);
      if (d.ok) {
        setLog(prev => [...prev, { type: 'text', text: '↷ Redid changes to: ' + (d.restored_files || []).join(', ') }]);
        refreshTree();
        fetchUndoRedo();
      }
    } catch {}
  }, [sessionId, refreshTree, fetchUndoRedo]);

  // ── History settings ─────────────────────────────────────────────────────
  const saveLimit = useCallback(async (gb) => {
    try {
      const d = await api.setLimit(Math.round(gb * 1_073_741_824));
      setHistUsage({ used: d.total_bytes, limit: d.limit_bytes });
    } catch {}
  }, []);

  const doClearHistory = useCallback(async (sessionOnly) => {
    try {
      await api.clearHistory(sessionOnly ? sessionId : null);
      setLog([]);
      fetchUndoRedo();
    } catch {}
  }, [sessionId, fetchUndoRedo]);

  return {
    sessionId,
    dirs, setDirs, removeDir, pickFolder,
    treeData, refreshTree,
    selected, prevented, hidden,
    toggleSelected, togglePrevented, toggleHidden,
    runTimeout, setRunTimeout,
    runOutCap, setRunOutCap,
    log, setLog,
    pendingApproval,
    running,
    undoSummary, redoSummary,
    fetchUndoRedo,
    sendMessage,
    sendApproval,
    doUndo, doRedo,
    histUsage, setHistUsage,
    saveLimit, doClearHistory,
  };
}
