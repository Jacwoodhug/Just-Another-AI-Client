import ImageCard from './ImageCard.jsx';

function BulkActionBar({ count, folders, onBulkDelete, onBulkSetFolder, onClearSelection }) {
  return (
    <div className="bulk-action-bar">
      <span className="bulk-count">{count} selected</span>
      <span className="bulk-sep">·</span>
      <span>Move to</span>
      <select
        className="bulk-folder-select"
        defaultValue=""
        onChange={e => { if (e.target.value) { onBulkSetFolder(e.target.value); e.target.value = ''; } }}
      >
        <option value="" disabled>folder ▾</option>
        <option value={null}>— None —</option>
        {folders.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <button className="bulk-delete-btn" onClick={onBulkDelete}>Delete</button>
      <button className="bulk-clear-btn ghost-btn" onClick={onClearSelection}>Clear</button>
    </div>
  );
}

export default function ImageGrid({
  images, activeFolder, showStarred, selectedImages, folders,
  onStar, onEdit, onCardClick, onToggleSelect, onBulkDelete, onBulkSetFolder, onClearSelection,
}) {
  let filtered = images;
  if (showStarred) {
    filtered = filtered.filter(img => img.starred);
  } else if (activeFolder !== 'all') {
    filtered = filtered.filter(img => img.folder === activeFolder);
  }

  return (
    <div className="image-grid-area">
      {selectedImages.size > 0 && (
        <BulkActionBar
          count={selectedImages.size}
          folders={folders}
          onBulkDelete={onBulkDelete}
          onBulkSetFolder={onBulkSetFolder}
          onClearSelection={onClearSelection}
        />
      )}

      {filtered.length === 0 ? (
        <div className="image-grid-empty">
          {showStarred
            ? 'No starred images yet. Click ★ on an image to star it.'
            : activeFolder !== 'all'
              ? `No images in "${activeFolder}" folder.`
              : 'No images yet. Generate something!'}
        </div>
      ) : (
        <div className="image-masonry">
          {filtered.map(img => (
            <ImageCard
              key={img.filename}
              img={img}
              selected={selectedImages.has(img.filename)}
              onStar={onStar}
              onEdit={onEdit}
              onClick={onCardClick}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
