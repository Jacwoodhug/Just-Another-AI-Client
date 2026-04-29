export default function ConsoleBlock({ entry }) {
  const text = String(entry.text || '');
  const exitM = text.match(/\[exit:\s*(-?\d+)\]/);
  const code = exitM ? parseInt(exitM[1], 10) : null;
  const sIdx = text.indexOf('[stderr]');
  const stdout = (sIdx >= 0 ? text.slice(0, sIdx) : text).trim();
  const stderr = sIdx >= 0 ? text.slice(sIdx + 8).trim() : '';

  return (
    <div className="code-console-block">
      <div className="code-log-block-header">
        ⚡ Terminal
        {code !== null && (
          <span className={`code-exit-badge ${code === 0 ? 'ok' : 'err'}`}>
            {code === 0 ? '✓ 0' : `✗ ${code}`}
          </span>
        )}
      </div>
      <div className="code-console-body"><pre>{stdout}</pre></div>
      {stderr && <div className="code-console-stderr"><pre>{stderr}</pre></div>}
    </div>
  );
}
