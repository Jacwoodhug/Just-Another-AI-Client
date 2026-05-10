import { useEffect, useState, useCallback } from 'react';
import { readFile } from '../../api/code.js';

export default function FileRawModal({ path, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError]     = useState(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    setContent(null);
    setError(null);
    setCopied(false);
    readFile(path)
      .then(r => setContent(r.content ?? ''))
      .catch(() => setError('Failed to load file.'));
  }, [path]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  function handleCopy() {
    if (content == null) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) handleClose();
  }

  const filename = path.split(/[\\/]/).pop();
  const lines = content != null ? content.split('\n') : [];
  const lineCount = content != null ? lines.length : 0;
  const charCount = content != null ? content.length : 0;

  return (
    <div className="code-raw-modal-overlay" onClick={handleOverlayClick}>
      <div className="code-raw-modal" role="dialog" aria-modal="true" aria-label={`View: ${filename}`}>
        <div className="code-raw-modal-header">
          <span className="code-raw-modal-title" title={path}>{filename}</span>
          <div className="code-raw-modal-actions">
            <button className="code-raw-copy-btn" onClick={handleCopy} disabled={content == null}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="code-raw-close-btn" onClick={handleClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="code-raw-modal-body">
          {error ? (
            <div className="code-raw-error">{error}</div>
          ) : content == null ? (
            <div className="code-raw-loading">Loading…</div>
          ) : (
            <div className="code-raw-content">
              <div className="code-raw-gutter" aria-hidden="true">
                {lines.map((_, i) => (
                  <div key={i} className="code-raw-lineno">{i + 1}</div>
                ))}
              </div>
              <pre className="code-raw-pre">{content}</pre>
            </div>
          )}
        </div>
        {content != null && (
          <div className="code-raw-modal-footer">
            <span>{lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'}</span>
            <span className="code-raw-footer-sep">·</span>
            <span>{charCount.toLocaleString()} {charCount === 1 ? 'char' : 'chars'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

