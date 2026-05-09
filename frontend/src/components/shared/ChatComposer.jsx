import { useState, useEffect } from 'react';
import Toggle from './Toggle.jsx';

export default function ChatComposer({
  text, onTextChange, onSend, onKeyDown,
  micActive, onMicToggle,
  onAttach, attachedImage, onClearAttach,
  screenOn, onScreenToggle,
  idleOn, onIdleToggle,
  loopOn, onLoopToggle,
  ttsOn, onTtsToggle,
  onNewChat,
  isProcessing, onCancel,
  socialOn,
}) {
  const [slashItems, setSlashItems] = useState([]);
  const [slashActive, setSlashActive] = useState(0);

  // Recompute slash menu whenever the text changes
  useEffect(() => {
    if (!text.startsWith('/')) {
      setSlashItems([]);
      return;
    }
    const cmds = window.chatBridge?.getSlashCommands?.() || [];
    const query = text.toLowerCase();
    const filtered = cmds.filter(c => c.name.startsWith(query));
    setSlashItems(filtered);
    setSlashActive(filtered.length > 0 ? 0 : -1);
  }, [text]);

  function applySlashCmd(cmd) {
    setSlashItems([]);
    if (cmd.requiresInput) {
      onTextChange(cmd.name + ' ');
    } else {
      onTextChange('');
      window.chatBridge?.sendText?.(cmd.name);
    }
  }

  function handleKeyDownWrapper(e) {
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
        if (cmd) { setSlashItems([]); onTextChange(cmd.name + ' '); }
        return;
      }
      if (e.key === 'Enter' && slashActive >= 0) {
        e.preventDefault();
        const cmd = slashItems[slashActive] || slashItems[0];
        if (cmd) applySlashCmd(cmd);
        return;
      }
      if (e.key === 'Escape') {
        setSlashItems([]);
        return;
      }
    }
    onKeyDown?.(e);
  }

  function handleBlur() {
    // Delay to let mousedown on menu items fire first
    setTimeout(() => setSlashItems([]), 150);
  }

  return (
    <div className="chat-composer">
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
                onMouseDown={e => { e.preventDefault(); applySlashCmd(cmd); }}
              >
                <span className="slash-item-name">{cmd.name}</span>
                <span className="slash-item-desc">{cmd.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Attached image preview */}
      {attachedImage && (
        <div className="chat-composer-image-row">
          <img
            src={attachedImage.dataUrl}
            alt={attachedImage.name || 'Attached'}
            className="chat-composer-preview-img"
          />
          <button type="button" className="ghost small" onClick={onClearAttach}>
            Clear
          </button>
        </div>
      )}

      {/* Main input row */}
      <div className="chat-composer-row">
        <button
          type="button"
          className={'composer-mic hdr-icon-btn' + (micActive ? ' active' : '')}
          onClick={onMicToggle}
          aria-label="Toggle microphone"
          title="Click to dictate"
        >
          <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
            <rect x="3.5" y="0.5" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M1 8c0 3.03 2.46 5.5 5.5 5.5S12 11.03 12 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1="6.5" y1="13.5" x2="6.5" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        <textarea
          className="chat-composer-input"
          placeholder="Type a message…"
          rows={1}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={handleKeyDownWrapper}
          onBlur={handleBlur}
          autoComplete="off"
        />

        <button
          type="button"
          className="hdr-icon-btn chat-attach-btn"
          onClick={onAttach}
          title="Attach image"
          aria-label="Attach image"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M12.5 8L7 13.5a3.9 3.9 0 01-5.5-5.5L7 2.5a2.6 2.6 0 013.67 3.67L5.5 11.5A1.3 1.3 0 013.67 9.67L8.5 4.5"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {isProcessing ? (
          <button type="button" className="primary cancel chat-send-btn" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="primary chat-send-btn" onClick={onSend}>
            Send
          </button>
        )}
      </div>

      {/* Toggle chip strip */}
      <div className="chat-composer-chips">
        <Toggle label="Screen"        active={screenOn} onClick={onScreenToggle} />
        {socialOn && <Toggle label="Idle capture"  active={idleOn}   onClick={onIdleToggle} />}
        {socialOn && <Toggle label="Thinking loop" active={loopOn}   onClick={onLoopToggle} />}
        <Toggle label="TTS"           active={ttsOn}    onClick={onTtsToggle} />
        <div className="chat-composer-divider" />
        <button type="button" className="chat-new-chat-btn" onClick={onNewChat}>
          New chat
        </button>
      </div>
    </div>
  );
}
