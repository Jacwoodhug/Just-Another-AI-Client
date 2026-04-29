import { useRef, useEffect, useState } from 'react';
import ChatBubble from '../shared/ChatBubble.jsx';
import ListeningIndicator from '../shared/ListeningIndicator.jsx';

function ContextMenu({ x, y, role, onAction }) {
  const ref = useRef(null);

  // Nudge into viewport after mount once we know the menu size
  useEffect(() => {
    if (!ref.current) return;
    const { offsetWidth: mw, offsetHeight: mh } = ref.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + mw + 8 > vw) ref.current.style.left = (vw - mw - 8) + 'px';
    if (y + mh + 8 > vh) ref.current.style.top  = (vh - mh - 8) + 'px';
  }, [x, y]);

  const aiItems = [
    { label: '↺  Regenerate response', action: 'regenerate' },
    'sep',
    { label: '✕  Delete response', action: 'delete-assistant', cls: 'danger' },
  ];
  const userItems = [
    { label: '✎  Edit & resend', action: 'edit' },
    'sep',
    { label: '✕  Delete message', action: 'delete-exchange', cls: 'danger' },
  ];
  const items = role === 'ai' ? aiItems : userItems;

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} ref={ref} role="menu">
      {items.map((item, i) =>
        item === 'sep'
          ? <div key={i} className="ctx-menu-sep" />
          : (
            <div
              key={i}
              className={`ctx-menu-item${item.cls ? ` ${item.cls}` : ''}`}
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onAction(item.action)}
            >
              {item.label}
            </div>
          )
      )}
    </div>
  );
}

export default function ChatLog({ messages, micActive, onRegenerate, onDeleteAssistant, onDeleteExchange, onResendText }) {
  const bottomRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, role, msgId }
  const [editingMsgId, setEditingMsgId] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Last real (non-status/typing/generating) message id per role
  const lastAiId = [...messages].reverse().find(m => m.role === 'ai')?.id ?? null;
  const lastUserId = [...messages].reverse().find(m => m.role === 'user')?.id ?? null;

  function openMenu(e, msg) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, role: msg.role, msgId: msg.id });
  }

  function closeMenu() { setCtxMenu(null); }

  useEffect(() => {
    if (!ctxMenu) return;
    const onClickOutside = () => closeMenu();
    const onKey = e => { if (e.key === 'Escape') closeMenu(); };
    const onScroll = () => closeMenu();
    document.addEventListener('click', onClickOutside);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', onClickOutside);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [ctxMenu]);

  function handleMenuAction(action) {
    const msgId = ctxMenu?.msgId;
    closeMenu();
    if (action === 'regenerate')       onRegenerate?.();
    else if (action === 'delete-assistant') onDeleteAssistant?.();
    else if (action === 'delete-exchange')  onDeleteExchange?.();
    else if (action === 'edit')        setEditingMsgId(msgId);
  }

  return (
    <div className="chat-log-react" id="chatLog">
      {messages.length === 0 && (
        <div className="chat-log-empty">Start a conversation…</div>
      )}
      {messages.map(msg => {
        const isLast = (msg.role === 'ai'   && msg.id === lastAiId) ||
                       (msg.role === 'user' && msg.id === lastUserId);
        return (
          <ChatBubble
            key={msg.id}
            id={msg.id}
            role={msg.role}
            text={msg.text}
            imageDataUrl={msg.imageDataUrl}
            imageDataUrls={msg.imageDataUrls}
            personalityName={msg.personalityName}
            onContextMenu={isLast ? e => openMenu(e, msg) : undefined}
            isEditing={editingMsgId === msg.id}
            onEditSubmit={text => { setEditingMsgId(null); onResendText?.(text); }}
            onEditCancel={() => setEditingMsgId(null)}
          />
        );
      })}
      {micActive && <ListeningIndicator />}
      <div ref={bottomRef} />
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          role={ctxMenu.role}
          onAction={handleMenuAction}
        />
      )}
    </div>
  );
}
