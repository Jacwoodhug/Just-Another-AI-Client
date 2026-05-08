export default function ImageCard({ img, selected, onStar, onEdit, onClick, onToggleSelect }) {
  function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', img.filename);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      className={`image-card${selected ? ' selected' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={e => {
        // Don't open detail when clicking star/edit/checkbox
        if (e.target.closest('.img-card-star, .img-card-edit, .img-card-check')) return;
        onClick(img);
      }}
    >
      <img src={img.url} alt={img.prompt || 'Generated image'} className="img-card-img" loading="lazy" />

      {/* Selection tint */}
      {selected && <div className="img-card-tint" />}

      {/* Checkbox */}
      <button
        className="img-card-check"
        title="Select"
        onClick={e => { e.stopPropagation(); onToggleSelect(img.filename); }}
        aria-pressed={selected}
      >
        {selected ? '✓' : ''}
      </button>

      {/* Star */}
      <button
        className={`img-card-star${img.starred ? ' active' : ''}`}
        title={img.starred ? 'Unstar' : 'Star'}
        onClick={e => { e.stopPropagation(); onStar(img.filename); }}
      >
        ★
      </button>

      {/* Edit */}
      <button
        className="img-card-edit"
        title="Edit / Remix"
        onClick={e => { e.stopPropagation(); onEdit(img); }}
      >
        ✏
      </button>

      {/* Bottom overlay */}
      <div className="img-card-overlay">
        {img.prompt && <div className="img-card-prompt">{img.prompt.slice(0, 80)}{img.prompt.length > 80 ? '…' : ''}</div>}
        <div className="img-card-meta">
          {img.resolution && <span>{img.resolution}</span>}
          {img.seed != null && <span>seed {img.seed}</span>}
        </div>
      </div>
    </div>
  );
}
