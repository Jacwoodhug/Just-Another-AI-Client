export default function ListeningIndicator() {
  return (
    <div className="listening-indicator">
      <div className="listening-bars">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="listening-bar"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="listening-label">Listening…</span>
    </div>
  );
}
