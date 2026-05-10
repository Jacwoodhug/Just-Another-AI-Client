export default function ApprovalBlock({ entry, onAction }) {
  const { approval, status } = entry;
  if (!approval) return null;

  const {
    tool_name: toolName,
    path_or_command: pathOrCmd,
    summary,
    warnings = [],
    call_id: callId,
    out_of_scope,
    cross_project,
    command,
    cwd,
  } = approval;

  const icons = {
    writeFile: '✏️', createFile: '📄', deleteFile: '🗑️',
    runCommand: '⚡', moveFile: '📦', replaceLines: '✏️',
  };
  const icon = icons[toolName] || '🔧';

  const isDone = status === 'approved' || status === 'denied' || status === 'expired';

  return (
    <div className="code-approval-block" data-call-id={callId}>
      <div className="code-log-block-header">
        <span className="code-tool-icon">{icon}</span>
        <span className="code-approval-tool-name">{toolName}</span>
        {!isDone && <span className="pending-badge">pending approval</span>}
      </div>

      {/* Feature 11: moveFile shows source → destination */}
      {toolName === 'moveFile' ? (
        <div className="code-approval-path">
          <span>{approval.source || pathOrCmd}</span>
          <span className="code-move-arrow"> → </span>
          <span>{approval.destination || ''}</span>
        </div>
      ) : toolName === 'runCommand' ? (
        <>
          <div className="code-approval-reason">{summary}</div>
          <pre className="code-approval-command">{command || pathOrCmd}</pre>
          {cwd && <div className="code-approval-cwd">in: {cwd}</div>}
        </>
      ) : (
        <div className="code-approval-path">{pathOrCmd}</div>
      )}

      {toolName !== 'runCommand' && <div className="code-approval-reason">{summary}</div>}

      {/* Feature 3: Cross-project warning */}
      {cross_project && (
        <div className="code-approval-warning code-cross-project-warning">
          ⚠ This file is outside the active project.
        </div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="code-approval-warning">⚠ {w}</div>
      ))}

      {!isDone ? (
        /* Feature 4: 3-button dialog for out_of_scope, 2-button otherwise */
        out_of_scope ? (
          <div className="code-approval-actions">
            <button className="code-approve-btn" onClick={() => onAction(callId, 'allow_once', pathOrCmd)}>
              Allow Once
            </button>
            <button className="code-approve-btn code-add-scope-btn" onClick={() => onAction(callId, 'allow_add_scope', pathOrCmd)}>
              Allow &amp; Add to Project Files
            </button>
            <button className="code-deny-btn" onClick={() => onAction(callId, 'deny', '')}>
              Deny
            </button>
          </div>
        ) : (
          <div className="code-approval-actions">
            <button className="code-approve-btn" onClick={() => onAction(callId, 'allow_once', pathOrCmd)}>Approve</button>
            <button className="code-deny-btn"    onClick={() => onAction(callId, 'deny', '')}>Deny</button>
          </div>
        )
      ) : (
        <div className={`code-approval-status ${status}`}>
          {status === 'approved' ? 'Approved' : status === 'expired' ? 'Expired' : 'Denied'}
        </div>
      )}
    </div>
  );
}

