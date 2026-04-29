export default function Toggle({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'chat-toggle-chip' + (active ? ' active' : '')}
    >
      <span className="chat-toggle-dot" />
      {label}
    </button>
  );
}
