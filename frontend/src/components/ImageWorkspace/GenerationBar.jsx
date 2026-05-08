import QueuePill from './QueuePill.jsx';

const ASPECT_RATIOS = ['1:1', '3:2', '2:3', '16:9', '9:16', 'Custom'];

function SeedRefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 6.5a4.5 4.5 0 1 1-1.32-3.18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M9 2l1.68 1.32L9 4.64" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function GenerationBar({
  prompt, setPrompt,
  negPrompt, setNegPrompt,
  enhance, setEnhance,
  seed, setSeed,
  lockSeed, setLockSeed,
  batchCount, setBatchCount,
  aspectRatio, setAspectRatio,
  customRes, setCustomRes,
  negOpen, setNegOpen,
  moreOpen, setMoreOpen,
  queue, cancelQueueItem,
  onGenerate,
}) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onGenerate();
  }

  function randomizeSeed() {
    setSeed(String(Math.floor(Math.random() * 2147483647)));
  }

  return (
    <div className="generation-bar">

      {/* Expanded options row (shown when moreOpen) */}
      {moreOpen && (
        <div className="gen-options-row">
          {/* Aspect ratio */}
          <div className="gen-opts-group">
            <span className="gen-opts-label">ASPECT RATIO</span>
            <div className="gen-aspect-btns">
              {ASPECT_RATIOS.map(ar => {
                const val = ar === 'Custom' ? 'custom' : ar;
                return (
                  <button
                    key={ar}
                    className={`gen-aspect-btn${aspectRatio === val ? ' active' : ''}`}
                    onClick={() => setAspectRatio(val)}
                  >{ar}</button>
                );
              })}
            </div>
            {aspectRatio === 'custom' && (
              <input
                className="gen-custom-res"
                type="text"
                placeholder="e.g. 1024x768"
                value={customRes}
                onChange={e => setCustomRes(e.target.value)}
              />
            )}
          </div>

          <div className="gen-opts-divider" />

          {/* Seed */}
          <div className="gen-opts-group">
            <span className="gen-opts-sublabel">Use Set Seed</span>
            <button
              className={`gen-lock-toggle${lockSeed ? ' active' : ''}`}
              onClick={() => setLockSeed(v => !v)}
              title={lockSeed ? 'Use random seed' : 'Use set seed'}
              aria-pressed={lockSeed}
            >
              <span className="gen-lock-knob" />
            </button>
            <div className="gen-seed-wrap">
              <input
                className="gen-seed-input"
                type="text"
                placeholder="Random"
                value={seed}
                onChange={e => setSeed(e.target.value)}
                disabled={!lockSeed}
              />
              {lockSeed && (
                <button className="gen-seed-refresh" onClick={randomizeSeed} title="New random seed">
                  <SeedRefreshIcon />
                </button>
              )}
            </div>
          </div>

          <div className="gen-opts-divider" />

          {/* Batch */}
          <div className="gen-opts-group gen-opts-batch">
            <span className="gen-opts-label">BATCH COUNT <strong>{batchCount}</strong></span>
            <input
              className="gen-batch-slider"
              type="range"
              min={1} max={8} step={1}
              value={batchCount}
              onChange={e => setBatchCount(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Negative prompt row (shown when negOpen) */}
      {negOpen && (
        <div className="gen-neg-row">
          <input
            className="gen-neg-input"
            type="text"
            placeholder="Negative prompt — what to exclude…"
            value={negPrompt}
            onChange={e => setNegPrompt(e.target.value)}
          />
        </div>
      )}

      {/* Queue pills */}
      {queue.length > 0 && (
        <div className="queue-row">
          {queue.map(item => (
            <QueuePill key={item.id} item={item} onCancel={cancelQueueItem} />
          ))}
        </div>
      )}

      {/* Main prompt row */}
      <div className="gen-main-row">
        <input
          className="gen-prompt-input"
          type="text"
          placeholder="Describe the image you want to generate…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="gen-actions">
          {/* Enhance pill toggle */}
          <button
            className={`gen-enhance-toggle${enhance ? ' active' : ''}`}
            onClick={() => setEnhance(v => !v)}
            title="Enhance prompt with AI"
          >
            <span className="gen-enhance-track">
              <span className="gen-enhance-knob" />
            </span>
            <span className="gen-enhance-label">Enhance</span>
          </button>

          {/* Negative */}
          <button
            className={`gen-action-btn${negOpen ? ' active' : ''}`}
            onClick={() => setNegOpen(v => !v)}
          >Negative</button>

          {/* More */}
          <button
            className={`gen-action-btn gen-more-btn${moreOpen ? ' active' : ''}`}
            onClick={() => setMoreOpen(v => !v)}
          >
            {moreOpen ? '▼' : '▲'} More
          </button>

          {/* Generate */}
          <button
            className="gen-generate-btn primary"
            disabled={!prompt.trim()}
            onClick={onGenerate}
          >Generate</button>
        </div>
      </div>
    </div>
  );
}
