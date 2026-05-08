export default function QueuePill({ item, onCancel }) {
  return (
    <div className="queue-pill">
      <div className="queue-pill-top">
        <span className="queue-pill-prompt">{item.prompt.slice(0, 40)}{item.prompt.length > 40 ? '…' : ''}</span>
        <button className="queue-pill-cancel" title="Cancel" onClick={() => onCancel(item.id)}>✕</button>
      </div>
      <div className="queue-pill-bar">
        <div className="queue-pill-fill" style={{ width: `${item.progress}%` }} />
      </div>
      <div className="queue-pill-status">{item.status}</div>
    </div>
  );
}
