import { useRef, useEffect } from 'react';
import ApprovalBlock from './blocks/ApprovalBlock.jsx';
import DiffBlock     from './blocks/DiffBlock.jsx';
import ConsoleBlock  from './blocks/ConsoleBlock.jsx';
import InfoBlock     from './blocks/InfoBlock.jsx';
import ChatBubble    from '../shared/ChatBubble.jsx';

function BulkBar({ log, onAction }) {
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
          onClick={() => pending.forEach(e => onAction(e.approval.call_id, 'allow_once', e.approval.path_or_command))}
        >
          ✓ Approve all
        </button>
        <button
          className="code-deny-btn"
          onClick={() => pending.forEach(e => onAction(e.approval.call_id, 'deny', ''))}
        >
          ✕ Deny all
        </button>
      </div>
    </div>
  );
}

export default function CodeLog({ log, onAction, running }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, running]);

  if (!log.length && !running) {
    return (
      <div className="code-log" id="codeLog">
        <div className="code-log-empty" id="codeLogEmpty">No activity yet</div>
      </div>
    );
  }

  return (
    <div className="code-log" id="codeLog">
      <BulkBar log={log} onAction={onAction} />
      {log.map(entry => (
        // Feature 7: use stable entry.id as key instead of array index
        <LogEntry key={entry.id || entry.type + Math.random()} entry={entry} onAction={onAction} />
      ))}
      {running && (
        <div className="code-log-typing">
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function LogEntry({ entry, onAction }) {
  // Feature 2: use shared ChatBubble for user and text entries
  if (entry.type === 'user') {
    return <ChatBubble role="user" text={entry.text} />;
  }

  if (entry.type === 'text') {
    return <ChatBubble role="assistant" text={entry.text} />;
  }

  if (entry.type === 'approval') {
    return (
      <div className="code-log-block">
        <ApprovalBlock entry={entry} onAction={onAction} />
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

