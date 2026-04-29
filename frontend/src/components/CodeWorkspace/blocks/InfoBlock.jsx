import { useState } from 'react';

export default function InfoBlock({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const { toolName, text } = entry;

  return (
    <div className="code-info-block">
      <div
        className="code-log-block-header code-info-toggle"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span className="code-tool-icon">🔍</span> {toolName}
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '0.8em' }}>
          {expanded ? '▼ hide' : '▶ show'}
        </span>
      </div>
      {expanded && (
        <div className="code-info-body">
          <pre>{text}</pre>
        </div>
      )}
    </div>
  );
}
