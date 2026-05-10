import { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../../api/code.js';

// ── Utilities ────────────────────────────────────────────────────────────────

/** Abbreviate C:\Users\<username>\rest → C:\Users\...\rest */
function abbreviatePath(fullPath) {
  if (!fullPath) return fullPath;
  // Windows: C:\Users\username\...
  const winMatch = fullPath.match(/^([A-Za-z]:\\Users\\)[^\\]+(\\.+)$/);
  if (winMatch) return winMatch[1] + '...' + winMatch[2];
  // Unix: /home/username/...
  const unixMatch = fullPath.match(/^(\/home\/)[^/]+(\/.+)$/);
  if (unixMatch) return unixMatch[1] + '...' + unixMatch[2];
  return fullPath;
}

// ── Context Menu ─────────────────────────────────────────────────────────────

function ContextMenu({ ctx, onClose, actions }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ctx) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [ctx, onClose]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!ctx) return null;

  // Keep menu on screen
  const menuStyle = { position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 9999 };

  return (
    <div ref={ref} className="code-ctx-menu" style={menuStyle} role="menu">
      {actions.map((item, i) => {
        if (item === 'separator') return <div key={i} className="code-ctx-separator" />;
        return (
          <div
            key={i}
            className={'code-ctx-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '')}
            role="menuitem"
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

// ── Expand/Collapse helpers ───────────────────────────────────────────────────

function collectDescendantKeys(node) {
  const keys = [node.path];
  if (node.children) {
    for (const c of node.children) keys.push(...collectDescendantKeys(c));
  }
  return keys;
}

// ── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({
  node, depth, selected, prevented, hidden, globalFiles,
  onToggleSelected, onTogglePrevented, onToggleHidden,
  onAddGlobalFile, onRemoveGlobalFile, onOpenRaw,
  onOpenCtx, expandedSet, setExpandedSet, isRootDir,
}) {
  const path = node.path;
  const isDir = node.type === 'directory';
  const isOpen = expandedSet.has(path);

  const cls = [
    'code-tree-item',
    isDir ? 'code-tree-dir' : '',
    prevented.has(path) ? 'code-prevented' : '',
    hidden.has(path) ? 'code-hidden' : '',
    (!isDir && selected.has(path)) ? 'selected' : '',
  ].filter(Boolean).join(' ');

  function toggle() {
    setExpandedSet(prev => {
      const s = new Set(prev);
      s.has(path) ? s.delete(path) : s.add(path);
      return s;
    });
  }

  function handleClick(e) {
    e.stopPropagation();
    if (isDir) toggle();
    else onToggleSelected(path);
  }

  function handleDblClick(e) {
    e.stopPropagation();
    if (!isDir) onOpenRaw(path);
  }

  function expandAll() {
    const keys = collectDescendantKeys(node).filter(k => {
      const n = findNodeByPath(node, k);
      return n?.type === 'directory';
    });
    setExpandedSet(prev => { const s = new Set(prev); keys.forEach(k => s.add(k)); return s; });
  }

  function collapseAll() {
    const keys = collectDescendantKeys(node);
    setExpandedSet(prev => { const s = new Set(prev); keys.forEach(k => s.delete(k)); return s; });
  }

  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const fileActions = [];
    if (!isDir) {
      fileActions.push({
        label: selected.has(path) ? 'Deselect (remove from LLM context)' : 'Select (add to LLM context)',
        action: () => onToggleSelected(path),
      });
      fileActions.push({ label: 'View Raw', action: () => onOpenRaw(path) });
      fileActions.push({
        label: globalFiles?.includes(path) ? 'Remove from Global Files' : 'Add to Global Files',
        action: () => globalFiles?.includes(path) ? onRemoveGlobalFile(path) : onAddGlobalFile(path),
      });
      fileActions.push('separator');
    }
    if (isDir) {
      fileActions.push({ label: 'Expand All', action: expandAll });
      fileActions.push({ label: 'Collapse All', action: collapseAll });
      fileActions.push('separator');
    }
    fileActions.push({
      label: prevented.has(path) ? 'Allow Agent Edits' : 'Prevent Agent Edits',
      action: () => onTogglePrevented(path),
    });
    fileActions.push({
      label: hidden.has(path) ? 'Show to LLM' : 'Hide from LLM',
      action: () => onToggleHidden(path),
    });
    fileActions.push({
      label: 'Copy Path',
      action: () => navigator.clipboard?.writeText(path),
    });
    fileActions.push({
      label: 'Open File Location',
      action: () => api.openLocation(path).catch(() => {}),
    });
    onOpenCtx({ x: e.clientX, y: e.clientY, actions: fileActions });
  }

  const displayName = isRootDir && !isDir ? abbreviatePath(path) : node.name;

  const sortedChildren = isOpen && isDir
    ? [...(node.children || [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <>
      <div
        className={cls}
        style={{
          paddingLeft: 8 + depth * 14,
          borderLeft: (!isDir && selected.has(path)) ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        data-path={path}
        title={isRootDir ? path : undefined}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onContextMenu={handleContextMenu}
      >
        {hidden.has(path) && <span className="code-hidden-icon">⊘ </span>}
        {isDir && <span className="code-tree-arrow">{isOpen ? '▼ ' : '▶ '}</span>}
        {!isDir && (
          <div className={'code-tree-checkbox' + (selected.has(path) ? ' checked' : '')}>
            {selected.has(path) && <span className="code-tree-checkbox-check">✓</span>}
          </div>
        )}
        <span className="code-tree-item-name" title={isRootDir ? path : node.name}>
          {isRootDir && isDir ? abbreviatePath(path) : displayName}{isDir ? '/' : ''}
        </span>
      </div>

      {sortedChildren.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          prevented={prevented}
          hidden={hidden}
          globalFiles={globalFiles}
          onToggleSelected={onToggleSelected}
          onTogglePrevented={onTogglePrevented}
          onToggleHidden={onToggleHidden}
          onAddGlobalFile={onAddGlobalFile}
          onRemoveGlobalFile={onRemoveGlobalFile}
          onOpenRaw={onOpenRaw}
          onOpenCtx={onOpenCtx}
          expandedSet={expandedSet}
          setExpandedSet={setExpandedSet}
          isRootDir={false}
        />
      ))}
    </>
  );
}

function findNodeByPath(root, path) {
  if (root.path === path) return root;
  for (const c of (root.children || [])) {
    const found = findNodeByPath(c, path);
    if (found) return found;
  }
  return null;
}

// ── Project node ─────────────────────────────────────────────────────────────

function ProjectNode({
  project, isActive, treeData, selected, prevented, hidden, globalFiles,
  onSetActive, onRename, onDelete, onPickFolder, onRemoveDir,
  onToggleSelected, onTogglePrevented, onToggleHidden,
  onAddGlobalFile, onRemoveGlobalFile, onOpenRaw, onOpenCtx,
  expandedSet, setExpandedSet,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(project.name);
  const renameRef = useRef(null);
  const clickTimerRef = useRef(null);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  // Timer-based single/double click: wait 200ms after first click.
  // Second click within that window → set active (tight intentional gesture).
  // No second click → toggle expand.
  function handleHeaderClick() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onSetActive(project.id);
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      setIsOpen(o => !o);
    }, 200);
  }

  function commitRename() {
    const v = renameVal.trim();
    if (v) onRename(project.id, v);
    setRenaming(false);
  }

  function handleProjectContextMenu(e) {
    e.preventDefault();
    onOpenCtx({
      x: e.clientX, y: e.clientY,
      actions: [
        { label: isActive ? '● Active Project' : 'Set as Active', action: () => onSetActive(project.id), disabled: isActive },
        { label: 'Rename Project', action: () => { setRenaming(true); setRenameVal(project.name); } },
        { label: 'Add Directory', action: () => onPickFolder(project.id) },
        { label: isOpen ? 'Collapse' : 'Expand', action: () => setIsOpen(o => !o) },
        'separator',
        { label: 'Remove Project', danger: true, action: () => {
          if (confirm(`Remove project "${project.name}"?`)) onDelete(project.id);
        }},
      ],
    });
  }

  function handleDirContextMenu(dir, e) {
    e.preventDefault();
    e.stopPropagation();
    onOpenCtx({
      x: e.clientX, y: e.clientY,
      actions: [
        { label: 'Add Directory', action: () => onPickFolder(project.id) },
        { label: 'Copy Path', action: () => navigator.clipboard?.writeText(dir) },
        { label: 'Open File Location', action: () => api.openLocation(dir).catch(() => {}) },
        'separator',
        { label: 'Remove from Project Tree', danger: true, action: () => onRemoveDir(project.id, dir) },
      ],
    });
  }

  // Find tree nodes for this project's directories
  const projectNodes = treeData.filter(n => project.directories.includes(n.path));

  return (
    <div className="code-project-node">
      {/* Project header */}
      <div
        className={'code-project-header' + (isActive ? ' active' : '')}
        title={isActive ? 'Active Project' : undefined}
        onClick={handleHeaderClick}
        onContextMenu={handleProjectContextMenu}
      >
        <span className="code-project-arrow">{isOpen ? '▼' : '▶'}</span>
        <span className="code-project-dot" style={{ background: isActive ? 'var(--accent)' : 'transparent', border: isActive ? 'none' : '1px solid var(--muted)' }} />
        {renaming ? (
          <input
            ref={renameRef}
            className="code-project-rename-input"
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="code-project-name">{project.name}</span>
        )}
      </div>

      {/* Project directories */}
      {isOpen && (
        <div className="code-project-body">
          {project.directories.length === 0 ? (
            <div
              className="code-tree-item code-project-add-dir"
              style={{ paddingLeft: 22 }}
              onClick={e => { e.stopPropagation(); onPickFolder(project.id); }}
            >
              <span style={{ opacity: 0.45, fontSize: 11 }}>+ Add Folder</span>
            </div>
          ) : (
            projectNodes.map(node => (
              <div key={node.path} onContextMenu={e => handleDirContextMenu(node.path, e)}>
                <TreeNode
                  node={node}
                  depth={1}
                  selected={selected}
                  prevented={prevented}
                  hidden={hidden}
                  globalFiles={globalFiles}
                  onToggleSelected={onToggleSelected}
                  onTogglePrevented={onTogglePrevented}
                  onToggleHidden={onToggleHidden}
                  onAddGlobalFile={onAddGlobalFile}
                  onRemoveGlobalFile={onRemoveGlobalFile}
                  onOpenRaw={onOpenRaw}
                  onOpenCtx={onOpenCtx}
                  expandedSet={expandedSet}
                  setExpandedSet={setExpandedSet}
                  isRootDir
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main FileTree ─────────────────────────────────────────────────────────────

export default function FileTree({
  treeData, projects, activeProjectId, globalFiles,
  selected, prevented, hidden,
  onPickFolder, onRemoveDir,
  onToggleSelected, onTogglePrevented, onToggleHidden,
  onAddGlobalFile, onRemoveGlobalFile,
  onCreateProject, onDeleteProject, onRenameProject, onSetActiveProject,
  onSettingsClick, onOpenRaw,
  panelWidth, onResizeStart,
}) {
  const [expandedSet, setExpandedSet] = useState(new Set());
  const [ctx, setCtx] = useState(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const newProjRef = useRef(null);

  useEffect(() => {
    if (showNewProject) newProjRef.current?.focus();
  }, [showNewProject]);

  const closeCtx = useCallback(() => setCtx(null), []);

  function handleNewProject(e) {
    if (e.key === 'Enter') {
      const name = newProjectName.trim() || 'New Project';
      onCreateProject(name);
      setNewProjectName('');
      setShowNewProject(false);
    }
    if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); }
  }

  // Global files section nodes
  const globalFileNodes = treeData.filter(n => globalFiles.includes(n.path));

  const fileCount = selected.size;

  return (
    <div className="code-file-tree" id="codeFileTree" style={panelWidth ? { width: panelWidth } : undefined}>
      {/* Header */}
      <div className="code-tree-header">
        <span className="code-tree-header-label">Project Files</span>
        <button
          className="code-add-dir-btn ghost-btn"
          type="button"
          title="New Project"
          onClick={() => setShowNewProject(v => !v)}
        >
          + Project
        </button>
      </div>

      {/* New project input */}
      {showNewProject && (
        <div className="code-new-project-row">
          <input
            ref={newProjRef}
            className="code-new-project-input"
            placeholder="Project name…"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={handleNewProject}
            onBlur={() => { setShowNewProject(false); setNewProjectName(''); }}
          />
        </div>
      )}

      {/* Tree body */}
      <div className="code-tree-body" id="codeTreeBody">
        {projects.length === 0 ? (
          <div className="code-tree-empty">
            <button className="primary small" onClick={() => onCreateProject('Default')}>
              + New Project
            </button>
          </div>
        ) : (
          <>
            {projects.map(project => (
              <ProjectNode
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                treeData={treeData}
                selected={selected}
                prevented={prevented}
                hidden={hidden}
                globalFiles={globalFiles}
                onSetActive={onSetActiveProject}
                onRename={onRenameProject}
                onDelete={onDeleteProject}
                onPickFolder={onPickFolder}
                onRemoveDir={onRemoveDir}
                onToggleSelected={onToggleSelected}
                onTogglePrevented={onTogglePrevented}
                onToggleHidden={onToggleHidden}
                onAddGlobalFile={onAddGlobalFile}
                onRemoveGlobalFile={onRemoveGlobalFile}
                onOpenRaw={onOpenRaw}
                onOpenCtx={setCtx}
                expandedSet={expandedSet}
                setExpandedSet={setExpandedSet}
              />
            ))}

            {/* Global Files section */}
            {globalFiles.length > 0 && (
              <div className="code-global-files-section">
                <div className="code-global-files-header">Global Files</div>
                {globalFileNodes.map(node => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selected={selected}
                    prevented={prevented}
                    hidden={hidden}
                    globalFiles={globalFiles}
                    onToggleSelected={onToggleSelected}
                    onTogglePrevented={onTogglePrevented}
                    onToggleHidden={onToggleHidden}
                    onAddGlobalFile={onAddGlobalFile}
                    onRemoveGlobalFile={onRemoveGlobalFile}
                    onOpenRaw={onOpenRaw}
                    onOpenCtx={setCtx}
                    expandedSet={expandedSet}
                    setExpandedSet={setExpandedSet}
                    isRootDir
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      <ContextMenu ctx={ctx} onClose={closeCtx} actions={ctx?.actions || []} />

      {/* Footer */}
      <div className="code-tree-footer">
        <span className="code-tree-file-count" id="codeFileCount">
          {fileCount} file{fileCount !== 1 ? 's' : ''} selected
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

      {/* Feature 13: Drag handle for resizing */}
      <div className="code-panel-resizer" onMouseDown={onResizeStart} title="Drag to resize" />
    </div>
  );
}

