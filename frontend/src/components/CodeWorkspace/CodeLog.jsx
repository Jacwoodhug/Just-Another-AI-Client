import { useRef, useEffect } from 'react';
import ApprovalBlock from './blocks/ApprovalBlock.jsx';
import DiffBlock     from './blocks/DiffBlock.jsx';
import ConsoleBlock  from './blocks/ConsoleBlock.jsx';
import InfoBlock     from './blocks/InfoBlock.jsx';

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
      {log.map((entry, i) => (
        <LogEntry key={i} entry={entry} onApprove={onApprove} onDeny={onDeny} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function LogEntry({ entry, onApprove, onDeny }) {
  switch (entry.type) {
    case 'user':
      return <div className="code-log-block"><div className="code-user-block">{entry.text}</div></div>;
    case 'text':
      return <div className="code-log-block"><div className="code-text-block">{entry.text}</div></div>;
    case 'approval':
      return <div className="code-log-block"><ApprovalBlock entry={entry} onApprove={onApprove} onDeny={onDeny} /></div>;
    case 'diff':
      return <div className="code-log-block"><DiffBlock entry={entry} /></div>;
    case 'console':
      return <div className="code-log-block"><ConsoleBlock entry={entry} /></div>;
    case 'info':
      return <div className="code-log-block"><InfoBlock entry={entry} /></div>;
    default:
      return null;
  }
}
