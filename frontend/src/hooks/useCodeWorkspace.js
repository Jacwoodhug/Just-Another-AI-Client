import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../api/code.js';
import { getCodeWorkspaceState, putCodeWorkspaceState } from '../api/config.js';

const LS_KEY = 'codeWorkspace_v1';

function genId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
}

function genSessionId() {
  return 'code_' + genId();
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

// Compute initial projects + activeProjectId once (cached across two useState calls)
const _initCache = { value: null };
function getInitProjectState() {
  if (_initCache.value) return _initCache.value;
  const saved = loadState();
  if (saved?.projects && saved.projects.length > 0) {
    _initCache.value = {
      projects: saved.projects,
      activeProjectId: saved.activeProjectId || saved.projects[0].id,
    };
  } else if (saved?.dirs && saved.dirs.length > 0) {
    const id = genId();
    _initCache.value = {
      projects: [{ id, name: 'Default', directories: saved.dirs, color: 'var(--accent)' }],
      activeProjectId: id,
    };
  } else {
    _initCache.value = { projects: [], activeProjectId: null };
  }
  return _initCache.value;
}

function makeEntry(type, extra) {
  return { type, id: crypto.randomUUID(), ...extra };
}

function expireApprovals(log) {
  return log.map(e =>
    e.type === 'approval' && !['approved', 'denied', 'expired'].includes(e.status)
      ? { ...e, status: 'expired' }
      : e
  );
}

export function useCodeWorkspace() {
  const saved = loadState();

  // ── Feature 3: Projects system ───────────────────────────────────────────
  const [projects, setProjects] = useState(() => getInitProjectState().projects);
  const [activeProjectId, setActiveProjectId] = useState(() => getInitProjectState().activeProjectId);
  const [globalFiles, setGlobalFiles] = useState(() => saved?.globalFiles || []);

  // Derived: dirs of active project
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeDirs = activeProject?.directories || [];

  const [sessionId] = useState(() => saved?.sessionId || genSessionId());
  const [selected,  setSelected]  = useState(() => new Set(saved?.sel  || []));
  const [prevented, setPrevented] = useState(() => new Set(saved?.prev || []));
  const [hidden,    setHidden]    = useState(() => new Set(saved?.hid  || []));
  const [runTimeout,  setRunTimeout]  = useState(() => saved?.to  ?? 30);
  const [runOutCap,   setRunOutCap]   = useState(() => saved?.cap ?? 50);

  const [treeData, setTreeData] = useState([]);
  const [log, setLog] = useState(() => {
    if (!saved?.log) return [];
    return expireApprovals(saved.log);
  });
  const [pendingApproval, setPendingApproval] = useState(null);
  const [running, setRunning]     = useState(false);
  const [undoSummary, setUndoSummary] = useState(null);
  const [redoSummary, setRedoSummary] = useState(null);
  const [histUsage, setHistUsage] = useState({ used: 0, limit: 1_073_741_824 });

  // Feature 6: first-undo notice
  const [hasSeenUndoNotice, setHasSeenUndoNotice] = useState(
    () => localStorage.getItem('codeWorkspace_seenUndoNotice') === 'true'
  );

  // Feature 7: group tagging for undo/redo message removal
  const pendingGroupTagRef = useRef(null);
  const undoneEntriesRef   = useRef({});

  // Persist state
  const saveRef = useRef(null);
  useEffect(() => {
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      const state = {
        sessionId,
        projects,
        activeProjectId,
        globalFiles,
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
  }, [sessionId, projects, activeProjectId, globalFiles, selected, prevented, hidden, runTimeout, runOutCap, log]);

  // Load state from backend on mount (overrides localStorage)
  useEffect(() => {
    getCodeWorkspaceState().then(s => {
      if (!s || typeof s !== 'object') return;
      // Projects migration: prefer projects array, fall back to dirs
      if (Array.isArray(s.projects) && s.projects.length > 0) {
        setProjects(s.projects);
        setActiveProjectId(s.activeProjectId || s.projects[0].id);
      } else if (Array.isArray(s.dirs) && s.dirs.length > 0) {
        const id = genId();
        setProjects([{ id, name: 'Default', directories: s.dirs, color: 'var(--accent)' }]);
        setActiveProjectId(id);
      }
      if (Array.isArray(s.globalFiles)) setGlobalFiles(s.globalFiles);
      if (Array.isArray(s.sel)) setSelected(new Set(s.sel));
      if (Array.isArray(s.prev)) setPrevented(new Set(s.prev));
      if (Array.isArray(s.hid)) setHidden(new Set(s.hid));
      if (s.to !== undefined) setRunTimeout(s.to);
      if (s.cap !== undefined) setRunOutCap(s.cap);
      if (Array.isArray(s.log)) setLog(expireApprovals(s.log));
    }).catch(() => {});
    // Reset init cache so next mount re-reads localStorage
    _initCache.value = null;
  }, []);

  // ── Tree ────────────────────────────────────────────────────────────────
  const allProjectDirs = projects.flatMap(p => p.directories);
  const allTreePaths = [...new Set([...allProjectDirs, ...globalFiles])];

  const refreshTree = useCallback(async () => {
    const dirs = projects.flatMap(p => p.directories);
    const paths = [...new Set([...dirs, ...globalFiles])];
    if (!paths.length) { setTreeData([]); return; }
    try {
      const data = await api.getFiles(paths);
      setTreeData(data);
    } catch (err) {
      setLog(prev => [...prev, makeEntry('text', { text: 'File tree error: ' + err.message })]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(projects.flatMap(p => p.directories)), JSON.stringify(globalFiles)]);

  useEffect(() => { if (allTreePaths.length) refreshTree(); else setTreeData([]); }, [refreshTree]);

  // ── Auto-refresh tree on filesystem changes (poll every 5s) ─────────────
  const runningRef = useRef(false);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => {
    if (!allTreePaths.length) return;
    const POLL_MS = 5000;
    const id = setInterval(() => {
      // Skip poll while the AI is actively running (it will refresh on response)
      // Also skip when not on the code workspace tab
      if (!runningRef.current && localStorage.getItem('activeWorkspace') === 'code') refreshTree();
    }, POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTree]);

  // ── Project management (Feature 3) ──────────────────────────────────────
  const createProject = useCallback((name) => {
    const id = genId();
    setProjects(prev => [...prev, { id, name: name || 'New Project', directories: [], color: 'var(--accent)' }]);
    setActiveProjectId(id);
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    setActiveProjectId(prev => prev === id ? null : prev);
  }, []);

  const renameProject = useCallback((id, newName) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  }, []);

  const addDirToProject = useCallback((projectId, dir) => {
    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === projectId);
      if (idx < 0) return prev;
      const updated = [...prev];
      if (!updated[idx].directories.includes(dir)) {
        updated[idx] = { ...updated[idx], directories: [...updated[idx].directories, dir] };
      }
      return updated;
    });
  }, []);

  const addGlobalFile = useCallback((path) => {
    setGlobalFiles(prev => prev.includes(path) ? prev : [...prev, path]);
  }, []);

  const removeGlobalFile = useCallback((path) => {
    setGlobalFiles(prev => prev.filter(f => f !== path));
  }, []);

  // ── Folder picker ────────────────────────────────────────────────────────
  const pickFolder = useCallback(async (targetProjectId) => {
    try {
      const d = await api.pickFolder();
      if (d.path) {
        const projId = targetProjectId || activeProjectId;
        if (projId) {
          addDirToProject(projId, d.path);
        } else {
          // No active project — create a default one
          const id = genId();
          setProjects(prev => [...prev, { id, name: 'Default', directories: [d.path], color: 'var(--accent)' }]);
          setActiveProjectId(id);
        }
      } else if (d.error) {
        setLog(prev => [...prev, makeEntry('text', { text: 'Folder picker error: ' + d.error })]);
      }
    } catch (err) {
      setLog(prev => [...prev, makeEntry('text', { text: 'Folder picker error: ' + err.message })]);
    }
  }, [activeProjectId, addDirToProject]);

  const removeDir = useCallback((projectId, dir) => {
    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === projectId);
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], directories: updated[idx].directories.filter(d => d !== dir) };
      return updated;
    });
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

    const tag = pendingGroupTagRef.current;
    const entries = [];

    for (const ae of (data.auto_executed || [])) {
      if (ae.tool_name === 'runCommand') {
        entries.push(makeEntry('console', { text: ae.result_text, groupTag: tag }));
      } else {
        entries.push(makeEntry('info', { toolName: ae.tool_name, args: ae.args, text: ae.result_text, groupTag: tag }));
      }
    }

    if (data.original_content !== undefined && data.original_content !== null) {
      entries.push(makeEntry('diff', {
        original: data.original_content,
        next: data.new_content,
        path: lastApprovalPath || '',
        groupTag: tag,
      }));
    }

    if (data.assistant_text) {
      entries.push(makeEntry('text', { text: data.assistant_text, groupTag: tag }));
    }

    if (entries.length) setLog(prev => [...prev, ...entries]);

    // Feature 7: when change_id arrives, rename pendingGroupTag → change_id
    if (data.change_id) {
      const changeId = data.change_id;
      if (tag) {
        setLog(prev => prev.map(e => e.groupTag === tag ? { ...e, groupTag: changeId } : e));
        pendingGroupTagRef.current = null;
      }
      refreshTree();
    }

    setUndoSummary(data.next_undo_summary || null);
    setRedoSummary(data.next_redo_summary || null);

    if (data.pending_tool_approval) {
      setPendingApproval(data.pending_tool_approval);
      setLog(prev => [...prev, makeEntry('approval', {
        approval: data.pending_tool_approval,
        groupTag: tag,
      })]);
    } else {
      setPendingApproval(null);
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    text = text.trim();
    if (!text || running) return;
    setRunning(true);

    // Feature 7: assign a group tag for this request's log entries
    const groupTag = crypto.randomUUID();
    pendingGroupTagRef.current = groupTag;

    setLog(prev => [...prev, makeEntry('user', { text, groupTag })]);

    const payload = {
      workspace: 'code',
      code_session_id: sessionId,
      is_code_session: true,  // Feature 8
      text,
      workspace_dirs: activeDirs,
      pre_approved_read_paths: [...selected],
      prevented_paths: [...prevented],
      hidden_paths: [...hidden],
      run_timeout_seconds: runTimeout,
      run_output_cap_kb: runOutCap,
    };
    const modelEl = document.getElementById('modelSelect');
    if (modelEl?.value) payload.model = modelEl.value;
    const provBtn = document.querySelector('.seg-btn[aria-pressed="true"]');
    if (provBtn?.dataset?.provider) payload.provider = provBtn.dataset.provider;

    try {
      const data = await api.sendChat(payload);
      _handleResp(data, null);
    } catch (err) {
      setLog(prev => [...prev, makeEntry('text', { text: 'Error: ' + err.message, groupTag })]);
    } finally {
      setRunning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sessionId, JSON.stringify(activeDirs), selected, prevented, hidden, runTimeout, runOutCap]);

  // ── Approve / Deny (Feature 4: action string) ────────────────────────────
  const sendApproval = useCallback(async (callId, action, pathOrCmd) => {
    if (action === 'deny') {
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
      const data = await api.approve(sessionId, callId, action);
      _handleResp(data, pathOrCmd);
      // Feature 4: allow_add_scope — add parent dir of pathOrCmd to active project
      if (action === 'allow_add_scope' && pathOrCmd) {
        const parentDir = pathOrCmd.replace(/[/\\][^/\\]+$/, '');
        if (parentDir && activeProjectId) {
          addDirToProject(activeProjectId, parentDir);
        }
      }
    } catch (err) {
      setLog(prev => [...prev, makeEntry('text', { text: 'Approval error: ' + err.message })]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, activeProjectId, addDirToProject]);

  // ── Undo (Feature 6: notice, Feature 7: remove tagged entries) ──────────
  const doUndo = useCallback(async () => {
    // Feature 6: show first-time undo notice
    if (!hasSeenUndoNotice) {
      setHasSeenUndoNotice(true);
      localStorage.setItem('codeWorkspace_seenUndoNotice', 'true');
      setLog(prev => [...prev, makeEntry('info', {
        toolName: 'notice',
        text: 'Undo reverts to a stored file snapshot. Any edits you made outside this chat since the last AI change will be overwritten.',
      })]);
    }
    try {
      const d = await api.undo(sessionId);
      if (d.ok) {
        const changeId = d.change_id;
        if (changeId) {
          // Feature 7: remove tagged log entries and save them for redo
          setLog(prev => {
            const tagged = prev.filter(e => e.groupTag === changeId);
            const firstIdx = prev.findIndex(e => e.groupTag === changeId);
            if (tagged.length > 0) {
              undoneEntriesRef.current[changeId] = { entries: tagged, idx: firstIdx };
            }
            return prev.filter(e => e.groupTag !== changeId);
          });
        }
        refreshTree();
        setUndoSummary(d.next_undo_summary || null);
        setRedoSummary(d.next_redo_summary || null);
      }
    } catch {}
  }, [sessionId, hasSeenUndoNotice, refreshTree]);

  // ── Redo (Feature 7: restore tagged entries) ─────────────────────────────
  const doRedo = useCallback(async () => {
    try {
      const d = await api.redo(sessionId);
      if (d.ok) {
        const changeId = d.change_id;
        if (changeId) {
          // Feature 7: restore tagged log entries at their original position
          const saved = undoneEntriesRef.current[changeId];
          if (saved) {
            delete undoneEntriesRef.current[changeId];
            setLog(prev => {
              const newLog = [...prev];
              newLog.splice(saved.idx, 0, ...saved.entries);
              return newLog;
            });
          }
        }
        refreshTree();
        setUndoSummary(d.next_undo_summary || null);
        setRedoSummary(d.next_redo_summary || null);
      }
    } catch {}
  }, [sessionId, refreshTree]);

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
    // Feature 3: projects API
    projects, activeProjectId, activeProject, activeDirs, globalFiles,
    createProject, deleteProject, renameProject,
    addDirToProject, addGlobalFile, removeGlobalFile,
    setActiveProject: setActiveProjectId,
    pickFolder, removeDir,
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

