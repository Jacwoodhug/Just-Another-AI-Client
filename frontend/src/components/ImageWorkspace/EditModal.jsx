import { useState, useEffect, useRef } from 'react';
import { generateImage } from '../../api/image.js';

export default function EditModal({ img, onClose, onSaveToLibrary }) {
  const [analyzing, setAnalyzing] = useState(true);
  const [editPrompt, setEditPrompt] = useState('');
  const [editNegPrompt, setEditNegPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [resultFilename, setResultFilename] = useState(null);
  const [resultRes, setResultRes] = useState(null);
  const [status, setStatus] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setAnalyzing(false);
      setEditPrompt(img.enhancedPrompt || img.prompt || '');
      setEditNegPrompt(img.negPrompt || '');
    }, 1200);
    return () => clearTimeout(t);
  }, [img]);

  async function handleRegenerate() {
    if (!editPrompt.trim() || generating) return;
    setGenerating(true);
    setResultUrl(null);
    setResultFilename(null);
    setStatus('Starting…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await generateImage(
        {
          prompt: editPrompt,
          negative_prompt: editNegPrompt,
          resolution: img.resolution || '1024x1024',
          raw: true, // use the prompt as-is since user already edited it
        },
        (chunk) => {
          if (chunk.type === 'status') setStatus(chunk.text);
          else if (chunk.type === 'image_ready') {
            const fn = chunk.url.split('/').pop();
            setResultUrl(chunk.url);
            setResultFilename(fn);
            setResultRes(img.resolution || '1024x1024');
            setStatus('');
          } else if (chunk.type === 'error') {
            setStatus(`Error: ${chunk.detail}`);
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (err.name !== 'AbortError') setStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleSave() {
    if (!resultFilename || !resultUrl) return;
    onSaveToLibrary({
      filename: resultFilename,
      url: resultUrl,
      prompt: editPrompt,
      negPrompt: editNegPrompt,
      resolution: resultRes,
      timestamp: new Date().toISOString(),
      starred: false,
      folder: null,
    });
    onClose();
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) {
      abortRef.current?.abort();
      onClose();
    }
  }

  if (!img) return null;

  return (
    <div className="modal-overlay" onClick={handleBackdrop} style={{ zIndex: 200 }}>
      <div className="edit-modal">
        <button className="modal-close" onClick={() => { abortRef.current?.abort(); onClose(); }}>✕</button>
        <div className="edit-modal-body">

          {/* Original */}
          <div className="edit-col">
            <div className="edit-col-title">Original</div>
            <img src={img.url} alt="Original" className="edit-img" />
            <div className="edit-img-label">{img.resolution}</div>
          </div>

          {/* Controls */}
          <div className="edit-col edit-controls-col">
            <div className="edit-col-title">Edit</div>
            {analyzing ? (
              <div className="edit-analyzing">
                <span className="gen-spinner" />
                <span>Analyzing image…</span>
              </div>
            ) : (
              <>
                <label className="edit-label">Prompt</label>
                <textarea
                  className="edit-prompt-input"
                  rows={5}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                />
                <label className="edit-label">Negative</label>
                <input
                  className="edit-neg-input"
                  type="text"
                  value={editNegPrompt}
                  onChange={e => setEditNegPrompt(e.target.value)}
                  placeholder="What to exclude…"
                />
                <button
                  className="edit-generate-btn primary"
                  disabled={!editPrompt.trim() || generating}
                  onClick={handleRegenerate}
                >{generating ? 'Generating…' : 'Generate'}</button>
                {status && <div className="edit-status">{status}</div>}
              </>
            )}
          </div>

          {/* Result */}
          <div className="edit-col">
            <div className="edit-col-title">Result</div>
            {resultUrl ? (
              <>
                <img src={resultUrl} alt="Result" className="edit-img" />
                <div className="edit-img-label">{resultRes}</div>
                <button className="edit-save-btn btn-teal" onClick={handleSave}>Save to library</button>
              </>
            ) : (
              <div className="edit-result-empty">
                {generating
                  ? <><span className="gen-spinner" /><span>{status || 'Generating…'}</span></>
                  : 'Result will appear here'}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
