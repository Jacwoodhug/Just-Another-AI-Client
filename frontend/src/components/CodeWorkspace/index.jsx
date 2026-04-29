import { useState, useEffect, useRef } from 'react';
import { useCodeWorkspace } from '../../hooks/useCodeWorkspace.js';
import FileTree       from './FileTree.jsx';
import CodeLog        from './CodeLog.jsx';
import HistorySettings from './HistorySettings.jsx';
import './CodeWorkspace.css';

export default function CodeWorkspace() {
  const ws = useCodeWorkspace();
  const [showSettings, setShowSettings] = useState(false);
  const [recording, setRecording] = useState(false);
  const [slashItems, setSlashItems] = useState([]);
  const [slashActive, setSlashActive] = useState(0);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Fetch undo/redo state on mount
  useEffect(() => { ws.fetchUndoRedo(); }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      const activeTab = document.querySelector('.workspace-tab.active');
      if (!activeTab || activeTab.dataset.workspace !== 'code') return;
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); ws.doUndo(); }
      if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) { e.preventDefault(); ws.doRedo(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ws.doUndo, ws.doRedo]);

  function handleSend() {
    const text = inputRef.current?.value || '';
    if (!text.trim()) return;
    if (inputRef.current) inputRef.current.value = '';
    setSlashItems([]);
    // Route slash commands through the chat bridge
    if (text.trim().startsWith('/')) {
      const handled = window.chatBridge?.tryExecuteSlashCommand?.(text.trim());
      if (handled) return;
    }
    ws.sendMessage(text);
  }

  function handleInput() {
    const val = inputRef.current?.value || '';
    if (!val.startsWith('/')) {
      setSlashItems([]);
      return;
    }
    const cmds = window.chatBridge?.getSlashCommands?.() || [];
    const query = val.toLowerCase();
    const filtered = cmds.filter(c => c.name.startsWith(query));
    setSlashItems(filtered);
    setSlashActive(filtered.length > 0 ? 0 : -1);
  }

  function applyCodeSlashCmd(cmd) {
    setSlashItems([]);
    if (cmd.requiresInput) {
      if (inputRef.current) { inputRef.current.value = cmd.name + ' '; inputRef.current.focus(); }
    } else {
      if (inputRef.current) inputRef.current.value = '';
      window.chatBridge?.sendText?.(cmd.name);
    }
  }

  function handleKeyDown(e) {
    if (slashItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActive(i => (i + 1) % slashItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActive(i => (i - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const cmd = slashItems[slashActive >= 0 ? slashActive : 0];
        if (cmd) { setSlashItems([]); if (inputRef.current) { inputRef.current.value = cmd.name + ' '; inputRef.current.focus(); } }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && slashActive >= 0) {
        e.preventDefault();
        const cmd = slashItems[slashActive] || slashItems[0];
        if (cmd) applyCodeSlashCmd(cmd);
        return;
      }
      if (e.key === 'Escape') {
        setSlashItems([]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInputBlur() {
    setTimeout(() => setSlashItems([]), 150);
  }

  function handleApprove(callId, pathOrCmd) { ws.sendApproval(callId, true, pathOrCmd); }
  function handleDeny(callId)               { ws.sendApproval(callId, false, ''); }

  function handleMicMouseDown() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = e => {
      const t = Array.from(e.results)
        .slice(e.resultIndex)
        .map(r => r[0].transcript)
        .join('')
        .trim();
      if (t && inputRef.current) {
        inputRef.current.value = (inputRef.current.value ? inputRef.current.value + ' ' : '') + t;
      }
    };
    rec.onend = () => { setRecording(false); recognitionRef.current = null; };
    rec.onerror = () => { setRecording(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    try { rec.start(); setRecording(true); } catch {}
  }

  function handleMicMouseUp() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setRecording(false);
  }

  return (
    <>
      {/* Left panel: file tree */}
      <FileTree
        treeData={ws.treeData}
        dirs={ws.dirs}
        selected={ws.selected}
        prevented={ws.prevented}
        hidden={ws.hidden}
        onPickFolder={ws.pickFolder}
        onRemoveDir={ws.removeDir}
        onToggleSelected={ws.toggleSelected}
        onTogglePrevented={ws.togglePrevented}
        onToggleHidden={ws.toggleHidden}
        onSettingsClick={() => setShowSettings(s => !s)}
      />

      {/* Middle panel: log + composer */}
      <div className="code-main">
        {/* Undo / Redo toolbar */}
        <div className="code-undo-redo" id="codeUndoRedo">
          <button
            className="code-undo-btn"
            id="codeUndoBtn"
            type="button"
            disabled={!ws.undoSummary}
            title={ws.undoSummary ? `Undo: ${ws.undoSummary}` : 'Nothing to undo'}
            onClick={ws.doUndo}
          >
            ↶ Undo
          </button>
          <button
            className="code-redo-btn"
            id="codeRedoBtn"
            type="button"
            disabled={!ws.redoSummary}
            title={ws.redoSummary ? `Redo: ${ws.redoSummary}` : 'Nothing to redo'}
            onClick={ws.doRedo}
          >
            ↷ Redo
          </button>
        </div>

        {/* Log */}
        <CodeLog log={ws.log} onApprove={handleApprove} onDeny={handleDeny} />

        {/* Composer */}
        <div className="code-composer" id="codeComposer">
          {/* Slash command menu */}
          {slashItems.length > 0 && (
            <div className="slash-menu" role="listbox" aria-label="Slash commands">
              <ul className="slash-list">
                {slashItems.map((cmd, i) => (
                  <li
                    key={cmd.name}
                    className={'slash-item' + (i === slashActive ? ' active' : '')}
                    role="option"
                    aria-selected={i === slashActive}
                    onMouseDown={e => { e.preventDefault(); applyCodeSlashCmd(cmd); }}
                  >
                    <span className="slash-item-name">{cmd.name}</span>
                    <span className="slash-item-desc">{cmd.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="code-composer-row">
            <button
              className={'composer-mic code-composer-mic' + (recording ? ' active' : '')}
              id="codeMicBtn"
              type="button"
              aria-label="Hold to dictate"
              title="Hold to dictate"
              onMouseDown={handleMicMouseDown}
              onMouseUp={handleMicMouseUp}
              onMouseLeave={handleMicMouseUp}
            >
              {recording && <span className="code-mic-blink-dot" />}
              <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                <rect x="3.5" y="0.5" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M1 8c0 3.03 2.46 5.5 5.5 5.5S12 11.03 12 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="6.5" y1="13.5" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <textarea
              ref={inputRef}
              className={recording ? 'code-composer-input recording' : 'code-composer-input'}
              id="codeInput"
              placeholder={recording ? 'Recording… release to stop' : 'Ask AI to edit files…'}
              rows={1}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onBlur={handleInputBlur}
            />
            <button
              className="composer-send primary code-run-btn"
              id="codeRunBtn"
              type="button"
              disabled={ws.running}
              onClick={handleSend}
            >
              {ws.running ? '…' : 'Run'}
            </button>
          </div>
        </div>
      </div>

      {/* History settings panel */}
      {showSettings && (
        <HistorySettings
          onClose={() => setShowSettings(false)}
          runTimeout={ws.runTimeout}
          onRunTimeoutChange={ws.setRunTimeout}
          runOutCap={ws.runOutCap}
          onRunOutCapChange={ws.setRunOutCap}
          histUsage={ws.histUsage}
          onSaveLimit={ws.saveLimit}
          onClearSession={() => { if (confirm('Clear history for this session?')) ws.doClearHistory(true); }}
          onClearAll={() => { if (confirm('Clear ALL code workspace history? This cannot be undone.')) ws.doClearHistory(false); }}
        />
      )}
    </>
  );
}
