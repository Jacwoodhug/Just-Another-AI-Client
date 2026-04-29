// LCS-based diff renderer with intra-line word highlighting.
const MAX_DIFF_LINES = 800;
const MAX_WORD_TOKENS = 800;
const CTX = 3;

function normalize(str) {
  return (str || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function runLcs(a, b, maxLen) {
  const al = a.slice(0, maxLen);
  const bl = b.slice(0, maxLen);
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
  return res;
}

function tokenizeLine(line) {
  return line.match(/\S+|\s+/g) || [''];
}

function IntraLine({ delLine, addLine }) {
  const wdiff = runLcs(tokenizeLine(delLine), tokenizeLine(addLine), MAX_WORD_TOKENS);

  const delSpans = [];
  const addSpans = [];
  wdiff.forEach(([t, w], i) => {
    if (t <= 0) delSpans.push(
      <span key={i} className={t < 0 ? 'diff-word-del' : undefined}>{w}</span>
    );
    if (t >= 0) addSpans.push(
      <span key={i} className={t > 0 ? 'diff-word-add' : undefined}>{w}</span>
    );
  });

  return (
    <>
      <div className="code-diff-line del intra">- {delSpans}</div>
      <div className="code-diff-line add">{'+' } {addSpans}</div>
    </>
  );
}

export default function DiffBlock({ entry }) {
  const { original, next: nextContent, path } = entry;
  if (original == null && nextContent == null) return null;

  const a = normalize(original).split('\n');
  const b = normalize(nextContent).split('\n');
  const diffs = runLcs(a, b, MAX_DIFF_LINES);

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES)
    diffs.push([0, '… (file truncated for diff display)']);

  const changeSet = new Set(diffs.map((d, i) => d[0] !== 0 ? i : -1).filter(i => i >= 0));
  const visible = new Set();
  for (const ci of changeSet)
    for (let k = Math.max(0, ci - CTX); k <= Math.min(diffs.length - 1, ci + CTX); k++)
      visible.add(k);

  const rows = [];
  let prevVisible = true;
  let i = 0;

  while (i < diffs.length) {
    if (!visible.has(i)) {
      if (prevVisible) rows.push(
        <div key={`gap-${i}`} className="code-diff-line ctx" style={{ opacity: 0.4 }}>…</div>
      );
      prevVisible = false;
      i++;
      continue;
    }
    prevVisible = true;
    const [t, line] = diffs[i];

    if (t === 0) {
      rows.push(<div key={i} className="code-diff-line ctx">{line}</div>);
      i++;
    } else if (t === -1) {
      // Collect consecutive deletions then consecutive additions
      const delStart = i;
      const dels = [];
      while (i < diffs.length && diffs[i][0] === -1) { dels.push(diffs[i][1]); i++; }
      const adds = [];
      while (i < diffs.length && diffs[i][0] === 1) { adds.push(diffs[i][1]); i++; }

      const paired = Math.min(dels.length, adds.length);
      for (let p = 0; p < paired; p++)
        rows.push(<IntraLine key={`pair-${delStart}-${p}`} delLine={dels[p]} addLine={adds[p]} />);
      for (let p = paired; p < dels.length; p++)
        rows.push(<div key={`del-${delStart}-${p}`} className="code-diff-line del">- {dels[p]}</div>);
      for (let p = paired; p < adds.length; p++)
        rows.push(<div key={`add-${delStart}-${p}`} className="code-diff-line add">+ {adds[p]}</div>);
    } else {
      // Pure addition block
      const addStart = i;
      const adds = [];
      while (i < diffs.length && diffs[i][0] === 1) { adds.push(diffs[i][1]); i++; }
      for (let p = 0; p < adds.length; p++)
        rows.push(<div key={`add2-${addStart}-${p}`} className="code-diff-line add">+ {adds[p]}</div>);
    }
  }

  if (!rows.length)
    rows.push(<div key="none" className="code-diff-line ctx" style={{ opacity: 0.4 }}>(no changes)</div>);

  return (
    <div className="code-diff-block">
      <div className="code-log-block-header">✏️ {path || 'file'}</div>
      <div className="code-diff-body">{rows}</div>
    </div>
  );
}
