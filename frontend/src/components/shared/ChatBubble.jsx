import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function InlineEdit({ initialText, onSubmit, onCancel }) {
  const [value, setValue] = useState(initialText);
  const taRef = useRef(null);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);

  function submit() {
    const t = value.trim();
    if (t) onSubmit(t);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="chat-edit-wrap">
      <textarea
        ref={taRef}
        className="chat-edit-input"
        value={value}
        rows={Math.max(2, value.split('\n').length)}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="chat-edit-actions">
        <button type="button" className="primary small" onClick={submit}>Resend</button>
        <button type="button" className="ghost small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function ChatBubble({ id, role, text, imageDataUrl, imageDataUrls, personalityName, onContextMenu, isEditing, onEditSubmit, onEditCancel }) {

  if (role === 'user') {
    return (
      <div className="chat-item user" onContextMenu={onContextMenu}>
        {imageDataUrl && (
          <img src={imageDataUrl} alt="Attached" className="generated-image" />
        )}
        {isEditing
          ? <InlineEdit initialText={text} onSubmit={onEditSubmit} onCancel={onEditCancel} />
          : text && <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
        }
      </div>
    );
  }

  if (role === 'typing') {
    return (
      <div className="chat-item status">
        <span className="typing-indicator">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </div>
    );
  }

  if (role === 'status') {
    return <div className="chat-item status">{text}</div>;
  }

  if (role === 'generating') {
    return (
      <div className="chat-item status generating">
        <div>
          <span className="gen-spinner" />
          <span>{text || 'Generating…'}</span>
        </div>
      </div>
    );
  }

  // AI message
  const displayText = (text && text !== '[Generated images]') ? text.replace(/^\n+/, '') : null;
  const hasImages = imageDataUrls && imageDataUrls.length > 0;
  const hasOverflow = hasImages && imageDataUrls.length > 3;
  const visibleCount = hasOverflow ? 3 : (hasImages ? imageDataUrls.length : 0);

  return (
    <div className="chat-item assistant" onContextMenu={onContextMenu}>
      {personalityName && <div className="meta">{personalityName}</div>}
      {hasImages && (
        <div className="image-grid" data-count={visibleCount}>
          {imageDataUrls.slice(0, visibleCount).map((url, i) => (
            <div key={i} className="image-grid-cell">
              <img src={url} alt="Generated" className="generated-image" />
              {i === 2 && hasOverflow && (
                <div className="image-grid-overflow">
                  +{imageDataUrls.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {imageDataUrl && !hasImages && (
        <div className="image-grid" data-count="1">
          <div className="image-grid-cell">
            <img src={imageDataUrl} alt="Attached" className="generated-image" />
          </div>
        </div>
      )}
      {displayText && (
        <div className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
        </div>
      )}
      {!displayText && hasImages && <div>Image generated.</div>}
    </div>
  );
}
