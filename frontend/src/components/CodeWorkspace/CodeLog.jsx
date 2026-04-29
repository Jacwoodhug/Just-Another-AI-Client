import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ApprovalBlock from './blocks/ApprovalBlock.jsx';
import DiffBlock     from './blocks/DiffBlock.jsx';
import ConsoleBlock  from './blocks/ConsoleBlock.jsx';
import InfoBlock     from './blocks/InfoBlock.jsx';

function BulkBar({ log, onApprove, onDeny }) {
  const pending = log.filter(
    e => e.type === 'approval' && !['approved', 'denied', 'expired'].includes(e.status) && e.approval
  );
  if (pending.length === 0) return null;
  const diffs = log.filter(e => e.type === 'diff');
  return (
    <div className="code-bulk-bar">
      <span className="code-bulk-bar-info">
        {pending.length} pending · {diffs.length} file{diffs.length !== 1 ? 's' : ''}
      </span>
      <div className="code-bulk-bar-actions">
        <button
          className="code-approve-btn"
          onClick={() => pending.forEach(e => onApprove(e.approval.call_id, e.approval.path_or_command))}
        >
          ✓ Approve all
        </button>
        <button
          className="code-deny-btn"
          onClick={() => pending.forEach(e => onDeny(e.approval.call_id))}
        >
          ✕ Deny all
        </button>
      </div>
    </div>
  );
}

export default function CodeLog({ log, onApprove, onDeny }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  if (!log.length) {
    return (
      <div className="code-log" id="codeLog">
        <div className="code-log-empty" id="codeLogEmpty">No activity yet</div>
      </div>
    );
  }

  return (
    <div className="code-log" id="codeLog">
      <BulkBar log={log} onApprove={onApprove} onDeny={onDeny} />
      {log.map((entry, i) => (
        <LogEntry key={i} entry={entry} onApprove={onApprove} onDeny={onDeny} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function LogEntry({ entry, onApprove, onDeny }) {
  if (entry.type === 'user') {
    return (
      <div className="chat-item user" style={{ whiteSpace: 'pre-wrap' }}>
        {entry.text}
      </div>
    );
  }

  if (entry.type === 'text') {
    const md = entry.text ? entry.text.replace(/^\n+/, '') : '';
    return (
      <div className="chat-item assistant">
        <div className="chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (entry.type === 'approval') {
    return (
      <div className="code-log-block">
        <ApprovalBlock entry={entry} onApprove={onApprove} onDeny={onDeny} />
      </div>
    );
  }

  if (entry.type === 'diff') {
    return <div className="code-log-block"><DiffBlock entry={entry} /></div>;
  }

  if (entry.type === 'console') {
    return <div className="code-log-block"><ConsoleBlock entry={entry} /></div>;
  }

  if (entry.type === 'info') {
    return <div className="code-log-block"><InfoBlock entry={entry} /></div>;
  }

  return null;
}
