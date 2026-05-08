import { useRef, useEffect } from 'react';
import ChatBubble from '../shared/ChatBubble.jsx';

export default function AgentChat({ messages, chatInput, onInputChange, onSend }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="image-agent-chat">
      <div className="image-agent-chat-header">Image Agent</div>
      <div className="image-agent-chat-log" ref={logRef}>
        {messages.map((msg, i) => (
          <ChatBubble key={msg.id || i} {...msg} />
        ))}
        {messages.length === 0 && (
          <div className="image-agent-empty">Ask the agent to help with your images…</div>
        )}
      </div>
      <div className="image-agent-chat-input-row">
        <textarea
          className="image-agent-input"
          placeholder="Ask agent…"
          rows={1}
          value={chatInput}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="image-agent-send primary" onClick={onSend} disabled={!chatInput.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
