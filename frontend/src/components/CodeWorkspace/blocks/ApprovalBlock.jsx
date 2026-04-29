export default function ApprovalBlock({ entry, onApprove, onDeny }) {
  const { approval, status } = entry;
  if (!approval) return null;

  const { tool_name: toolName, path_or_command: pathOrCmd, summary, warnings = [], call_id: callId } = approval;
  const icons = { writeFile: '✏️', createFile: '📄', deleteFile: '🗑️', runCommand: '⚡' };
  const icon = icons[toolName] || '🔧';

  const isDone = status === 'approved' || status === 'denied';

  return (
    <div className="code-approval-block" data-call-id={callId}>
      <div className="code-log-block-header">
        <span className="code-tool-icon">{icon}</span>
        <span className="code-approval-tool-name">{toolName}</span>
        {!isDone && <span className="pending-badge">pending approval</span>}
      </div>
      <div className="code-approval-path">{pathOrCmd}</div>
      <div className="code-approval-reason">{summary}</div>
      {warnings.map((w, i) => (
        <div key={i} className="code-approval-warning">⚠ {w}</div>
      ))}
      {!isDone ? (
        <div className="code-approval-actions">
          <button className="code-approve-btn" onClick={() => onApprove(callId, pathOrCmd)}>Approve</button>
          <button className="code-deny-btn"    onClick={() => onDeny(callId)}>Deny</button>
        </div>
      ) : (
        <div className={`code-approval-status ${status}`}>
          {status === 'approved' ? 'Approved' : 'Denied'}
        </div>
      )}
    </div>
  );
}
