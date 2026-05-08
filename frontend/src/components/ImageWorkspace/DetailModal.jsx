export default function DetailModal({ img, onClose, onStar, onEdit, onDelete }) {
  if (!img) return null;

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleBackdrop} style={{ zIndex: 150 }}>
      <div className="detail-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="detail-modal-body">
          {/* Image column */}
          <div className="detail-img-col">
            <img src={img.url} alt={img.prompt} className="detail-img" />
          </div>

          {/* Metadata column */}
          <div className="detail-meta-col">
            <div className="detail-actions">
              <button
                className={`detail-star-btn${img.starred ? ' active' : ''}`}
                onClick={() => onStar(img.filename)}
              >{img.starred ? '★ Starred' : '☆ Star'}</button>
              <button className="detail-edit-btn" onClick={() => { onClose(); onEdit(img); }}>✏ Edit</button>
              <button className="detail-delete-btn" onClick={() => { onDelete(img.filename); onClose(); }}>🗑 Delete</button>
            </div>

            <div className="detail-meta-section">
              <div className="detail-meta-title">{img.enhancedPrompt ? 'Original Prompt' : 'Prompt'}</div>
              <div className="detail-meta-value">{img.prompt || '—'}</div>
            </div>

            {img.enhancedPrompt && (
              <div className="detail-meta-section">
                <div className="detail-meta-title">Enhanced Prompt</div>
                <div className="detail-meta-value detail-meta-small">{img.enhancedPrompt}</div>
              </div>
            )}

            {img.negPrompt && (
              <div className="detail-meta-section">
                <div className="detail-meta-title">Negative Prompt</div>
                <div className="detail-meta-value detail-meta-small">{img.negPrompt}</div>
              </div>
            )}

            <div className="detail-meta-grid">
              {img.resolution && <MetaRow label="Resolution" value={img.resolution} />}
              {img.seed != null && <MetaRow label="Seed" value={img.seed} />}
              {img.model && <MetaRow label="Model" value={img.model} />}
              {img.timestamp && <MetaRow label="Created" value={new Date(img.timestamp).toLocaleString()} />}
              {img.folder && <MetaRow label="Folder" value={img.folder} />}
              {img.source && <MetaRow label="Source" value={img.source === 'manual' ? 'Manual' : 'Agent'} />}
              {img.workspace && <MetaRow label="Workspace" value={img.workspace.charAt(0).toUpperCase() + img.workspace.slice(1)} />}
              {img.personality && <MetaRow label="Personality" value={img.personality} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="detail-meta-row">
      <span className="detail-meta-label">{label}</span>
      <span className="detail-meta-val">{value}</span>
    </div>
  );
}
