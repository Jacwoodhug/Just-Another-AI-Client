// LCS-based diff renderer, ported from the vanilla JS IIFE.
const MAX_DIFF_LINES = 400;
const CTX = 3;

function lcs(a, b) {
  const al = a.slice(0, MAX_DIFF_LINES);
  const bl = b.slice(0, MAX_DIFF_LINES);
  const n = al.length, m = bl.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = al[i] === bl[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const res = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) { res.push([0, al[i]]); i++; j++; }
    else if (dp[i + 1]?.[j] >= dp[i][j + 1]) { res.push([-1, al[i]]); i++; }
    else { res.push([1, bl[j]]); j++; }
  }
  while (i < n) res.push([-1, al[i++]]);
  while (j < m) res.push([1, bl[j++]]);
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES)
    res.push([0, '… (file truncated for diff display)']);
  return res;
}

export default function DiffBlock({ entry }) {
  const { original, next: nextContent, path } = entry;
  if (original == null && nextContent == null) return null;

  const a = (original || '').split('\n');
  const b = (nextContent || '').split('\n');
  const diffs = lcs(a, b);

  const changeSet = new Set(diffs.map((d, i) => d[0] !== 0 ? i : -1).filter(i => i >= 0));
  const visible = new Set();
  for (const ci of changeSet)
    for (let i = Math.max(0, ci - CTX); i <= Math.min(diffs.length - 1, ci + CTX); i++)
      visible.add(i);

  const rows = [];
  let prevVisible = true;
  diffs.forEach(([t, line], i) => {
    if (!visible.has(i)) {
      if (prevVisible) rows.push(<div key={`gap-${i}`} className="code-diff-line ctx" style={{ opacity: 0.4 }}>…</div>);
      prevVisible = false;
      return;
    }
    prevVisible = true;
    if (t === 0)  rows.push(<div key={i} className="code-diff-line ctx">{line}</div>);
    else if (t < 0) rows.push(<div key={i} className="code-diff-line del">- {line}</div>);
    else            rows.push(<div key={i} className="code-diff-line add">+ {line}</div>);
  });

  if (!rows.length)
    rows.push(<div key="none" className="code-diff-line ctx" style={{ opacity: 0.4 }}>(no changes)</div>);

  return (
    <div className="code-diff-block">
      <div className="code-log-block-header">✏️ {path || 'file'}</div>
      <div className="code-diff-body">{rows}</div>
    </div>
  );
}
