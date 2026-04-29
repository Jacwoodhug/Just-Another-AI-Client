import { useState, useEffect, useRef } from 'react';
import { useCodeWorkspace } from '../../hooks/useCodeWorkspace.js';
import FileTree       from './FileTree.jsx';
import CodeLog        from './CodeLog.jsx';
import HistorySettings from './HistorySettings.jsx';
import './CodeWorkspace.css';

export default function CodeWorkspace() {
  const ws = useCodeWorkspace();
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef(null);
  const micRef = useRef(null);
  let _cmicRec = null, _cmicActive = false;

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
    ws.sendMessage(text);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleApprove(callId, pathOrCmd) { ws.sendApproval(callId, true, pathOrCmd); }
  function handleDeny(callId)               { ws.sendApproval(callId, false, ''); }

  function handleMicClick() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (!_cmicRec) {
      _cmicRec = new SR();
      _cmicRec.continuous = false;
      _cmicRec.interimResults = false;
      _cmicRec.lang = 'en-US';
      _cmicRec.onstart = () => { micRef.current?.classList.add('active'); };
      _cmicRec.onresult = e => {
        const t = e.results[0][0].transcript.trim();
        if (inputRef.current) inputRef.current.value = (inputRef.current.value ? inputRef.current.value + ' ' : '') + t;
      };
      _cmicRec.onend = () => { _cmicActive = false; micRef.current?.classList.remove('active'); };
      _cmicRec.onerror = () => { _cmicActive = false; micRef.current?.classList.remove('active'); };
    }
    if (_cmicActive) { _cmicRec.stop(); _cmicActive = false; }
    else { try { _cmicRec.start(); _cmicActive = true; } catch {} }
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
          <div className="code-composer-row">
            <button
              ref={micRef}
              className="composer-mic code-composer-mic"
              id="codeMicBtn"
              type="button"
              aria-label="Toggle microphone"
              title="Click to dictate"
              onClick={handleMicClick}
            >
              <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                <rect x="3.5" y="0.5" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M1 8c0 3.03 2.46 5.5 5.5 5.5S12 11.03 12 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <line x1="6.5" y1="13.5" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
            <textarea
              ref={inputRef}
              className="code-composer-input"
              id="codeInput"
              placeholder="Ask AI to edit files…"
              rows={1}
              onKeyDown={handleKeyDown}
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
