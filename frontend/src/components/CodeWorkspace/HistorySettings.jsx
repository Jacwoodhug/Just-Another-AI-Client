export default function HistorySettings({
  onClose,
  runTimeout, onRunTimeoutChange,
  runOutCap,  onRunOutCapChange,
  histUsage,
  onSaveLimit, onClearSession, onClearAll,
}) {
  const usedMb  = (histUsage.used  / (1024 * 1024)).toFixed(1);
  const limitGb = (histUsage.limit / 1_073_741_824).toFixed(1);
  const limitMb = (histUsage.limit / (1024 * 1024)).toFixed(0);
  const pct = histUsage.limit > 0 ? Math.min(100, (histUsage.used / histUsage.limit) * 100) : 0;

  return (
    <div className="code-history-settings" id="codeHistorySettings">
      <div className="code-history-settings-header">
        <span className="code-history-settings-title">History Settings</span>
        <button className="ghost-btn" type="button" onClick={onClose}>✕</button>
      </div>
      <div className="code-history-settings-body">
        <div className="setting-row">
          <label className="setting-label" htmlFor="codeHistoryLimitInput">Storage limit (GB)</label>
          <input id="codeHistoryLimitInput" type="number" min="0.1" step="0.1" defaultValue={limitGb} style={{ width: 80 }} />
        </div>
        <div className="setting-row">
          <span className="setting-label">Current usage</span>
          <span className="code-history-usage" id="codeHistoryUsage">{usedMb} MB / {limitMb} MB</span>
        </div>
        <div className="code-history-usage-bar-wrap">
          <div className="code-history-usage-bar" id="codeHistoryUsageBar" style={{ width: pct.toFixed(1) + '%' }} />
        </div>
        <div className="setting-row" style={{ marginTop: 6 }}>
          <label className="setting-label" htmlFor="codeRunTimeoutInput">Command timeout (s)</label>
          <input
            id="codeRunTimeoutInput"
            type="number" min="5" max="300" step="5"
            value={runTimeout}
            onChange={e => onRunTimeoutChange(parseInt(e.target.value, 10) || 30)}
            style={{ width: 80 }}
          />
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="codeRunOutputCapInput">Max output (KB)</label>
          <input
            id="codeRunOutputCapInput"
            type="number" min="10" max="500" step="10"
            value={runOutCap}
            onChange={e => onRunOutCapChange(parseInt(e.target.value, 10) || 50)}
            style={{ width: 80 }}
          />
        </div>
        <div className="code-history-settings-actions">
          <button
            className="primary small"
            type="button"
            onClick={() => {
              const v = parseFloat(document.getElementById('codeHistoryLimitInput')?.value) || 1;
              onSaveLimit(v);
            }}
          >
            Save settings
          </button>
          <button className="ghost small" type="button" onClick={onClearSession}>
            Clear session history
          </button>
          <button className="ghost small danger" type="button" onClick={onClearAll}>
            Clear all history
          </button>
        </div>
      </div>
    </div>
  );
}
