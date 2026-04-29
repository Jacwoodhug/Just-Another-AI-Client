import { useState, useRef, useEffect } from 'react';

function TreeNode({ node, depth, selected, prevented, hidden, onToggleSelected, onTogglePrevented, onToggleHidden, onRemoveDir, isRoot, onOpenCtx }) {
  const [open, setOpen] = useState(isRoot); // root dirs start expanded
  const path = node.path;
  const isDir = node.type === 'directory';

  const cls = [
    'code-tree-item',
    isDir ? 'code-tree-dir' : '',
    prevented.has(path) ? 'code-prevented' : '',
    hidden.has(path) ? 'code-hidden' : '',
    (!isDir && selected.has(path)) ? 'selected' : '',
  ].filter(Boolean).join(' ');

  function handleClick(e) {
    e.stopPropagation();
    if (isDir) setOpen(o => !o);
    else onToggleSelected(path);
  }

  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    onOpenCtx({ x: e.clientX, y: e.clientY, path, isDir, isRoot });
  }

  const sortedChildren = open && isDir
    ? [...(node.children || [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <>
      <div
        className={cls}
        style={{ paddingLeft: 8 + depth * 14 }}
        data-path={path}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {hidden.has(path) && <span className="code-hidden-icon">⊘ </span>}
        {isDir && <span className="code-tree-arrow">{open ? '▼ ' : '▶ '}</span>}
        <span>{node.name}{isDir ? '/' : ''}</span>
      </div>

      {sortedChildren.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          prevented={prevented}
          hidden={hidden}
          onToggleSelected={onToggleSelected}
          onTogglePrevented={onTogglePrevented}
          onToggleHidden={onToggleHidden}
          onRemoveDir={onRemoveDir}
          isRoot={false}
          onOpenCtx={onOpenCtx}
        />
      ))}
    </>
  );
}

export default function FileTree({ treeData, dirs, selected, prevented, hidden, onPickFolder, onRemoveDir, onToggleSelected, onTogglePrevented, onToggleHidden, onSettingsClick }) {
  const fileCount = countFiles(treeData);

  // Shared context menu state — only one can be open at a time
  const [ctx, setCtx] = useState(null); // { x, y, path, isDir, isRoot } | null
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!ctx) return;
    const handler = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtx(null);
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [ctx]);

  function closeCtx() { setCtx(null); }

  const sorted = [...treeData].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="code-file-tree" id="codeFileTree">
      <div className="code-tree-header">
        <span className="code-tree-header-label">FILES</span>
        <button
          className={dirs.length === 0 ? 'primary small' : 'code-add-dir-btn ghost-btn'}
          type="button"
          title="Add directory"
          onClick={onPickFolder}
        >
          {dirs.length === 0 ? 'Select Folder' : '+ Add Dir'}
        </button>
      </div>

      <div className="code-tree-body" id="codeTreeBody">
        {dirs.length === 0 ? (
          <div className="code-tree-empty" id="codeTreeEmpty" />
        ) : (
          sorted.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selected={selected}
              prevented={prevented}
              hidden={hidden}
              onToggleSelected={onToggleSelected}
              onTogglePrevented={onTogglePrevented}
              onToggleHidden={onToggleHidden}
              onRemoveDir={onRemoveDir}
              isRoot={dirs.includes(node.path)}
              onOpenCtx={setCtx}
            />
          ))
        )}
      </div>

      {/* Single shared context menu rendered at FileTree level */}
      {ctx && (
        <div
          ref={ctxRef}
          className="code-ctx-menu"
          style={{ position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 9999 }}
          role="menu"
        >
          {!ctx.isDir && (
            <div className="code-ctx-item" onClick={() => { onToggleSelected(ctx.path); closeCtx(); }}>
              {selected.has(ctx.path) ? 'Deselect (remove from LLM context)' : 'Select (add to LLM context)'}
            </div>
          )}
          <div className="code-ctx-item" onClick={() => { onTogglePrevented(ctx.path); closeCtx(); }}>
            {prevented.has(ctx.path) ? 'Allow agent edits' : 'Prevent agent edits'}
          </div>
          <div className="code-ctx-item" onClick={() => { onToggleHidden(ctx.path); closeCtx(); }}>
            {hidden.has(ctx.path) ? 'Unhide from LLM' : 'Hide from LLM'}
          </div>
          {ctx.isRoot && (
            <div className="code-ctx-item" onClick={() => { onRemoveDir(ctx.path); closeCtx(); }}>
              Remove root from tree
            </div>
          )}
        </div>
      )}

      <div className="code-tree-footer">
        <span className="code-tree-file-count" id="codeFileCount">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
        <button
          className="hdr-icon-btn code-tree-settings-btn"
          id="codeHistorySettingsBtn"
          type="button"
          title="History settings"
          aria-label="History settings"
          onClick={onSettingsClick}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

function countFiles(nodes) {
  let n = 0;
  for (const nd of nodes) {
    if (nd.type === 'file') n++;
    if (nd.children) n += countFiles(nd.children);
  }
  return n;
}
