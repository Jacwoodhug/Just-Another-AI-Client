import { useState } from 'react';

function NavRow({ label, count, active, onClick, onDelete, isDrop, onDragOver, onDrop, onDragEnter, onDragLeave }) {
  return (
    <div
      className={`lib-nav-row${active ? ' active' : ''}${isDrop ? ' drop-over' : ''}`}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <span className="lib-nav-label">{label}</span>
      {count != null && <span className="lib-nav-count">{count}</span>}
      {onDelete && (
        <button
          className="lib-nav-delete"
          title="Delete folder"
          onClick={e => { e.stopPropagation(); onDelete(); }}
        >✕</button>
      )}
    </div>
  );
}

export default function LibraryNav({
  images, folders, activeFolder, showStarred,
  onSetFolder, onToggleStarred, onAddFolder, onDeleteFolder,
  addingFolder, newFolderName, onNewFolderName, onConfirmFolder, onCancelFolder,
  onDropToFolder,
}) {
  const [dragOverFolder, setDragOverFolder] = useState(null);

  const allCount = images.length;
  const starredCount = images.filter(img => img.starred).length;

  return (
    <aside className="library-nav">
      <div className="lib-nav-section">
        <NavRow
          label="All Images"
          count={allCount}
          active={!showStarred && activeFolder === 'all'}
          onClick={() => { onSetFolder('all'); if (showStarred) onToggleStarred(); }}
        />
        <NavRow
          label="★ Starred"
          count={starredCount}
          active={showStarred}
          onClick={() => { onToggleStarred(); onSetFolder('all'); }}
        />
      </div>

      <div className="lib-nav-divider" />

      <div className="lib-nav-section-header">
        <span>Folders</span>
        <button className="lib-nav-add-btn" title="New folder" onClick={onAddFolder}>+</button>
      </div>

      {addingFolder && (
        <div className="lib-nav-new-folder">
          <input
            className="lib-nav-folder-input"
            autoFocus
            value={newFolderName}
            onChange={e => onNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onConfirmFolder(newFolderName);
              if (e.key === 'Escape') onCancelFolder();
            }}
            placeholder="Folder name…"
          />
          <button className="lib-nav-confirm" onClick={() => onConfirmFolder(newFolderName)}>✓</button>
          <button className="lib-nav-cancel" onClick={onCancelFolder}>✕</button>
        </div>
      )}

      {folders.map(folder => (
        <NavRow
          key={folder}
          label={folder}
          count={images.filter(img => img.folder === folder).length}
          active={!showStarred && activeFolder === folder}
          onClick={() => { onSetFolder(folder); if (showStarred) onToggleStarred(); }}
          onDelete={() => onDeleteFolder(folder)}
          isDrop={dragOverFolder === folder}
          onDragOver={e => e.preventDefault()}
          onDragEnter={() => setDragOverFolder(folder)}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={e => {
            e.preventDefault();
            setDragOverFolder(null);
            const filename = e.dataTransfer.getData('text/plain');
            if (filename) onDropToFolder(filename, folder);
          }}
        />
      ))}

      <div className="lib-nav-footer">{allCount} image{allCount !== 1 ? 's' : ''}</div>
    </aside>
  );
}
