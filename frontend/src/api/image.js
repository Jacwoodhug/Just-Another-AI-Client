const BASE = '';

export async function listImages() {
  const r = await fetch(`${BASE}/api/images`);
  if (!r.ok) throw new Error(`listImages: ${r.status}`);
  return r.json();
}

export async function listFolders() {
  const r = await fetch(`${BASE}/api/images/folders`);
  if (!r.ok) throw new Error(`listFolders: ${r.status}`);
  return r.json();
}

export async function createFolder(name) {
  const r = await fetch(`${BASE}/api/images/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(`createFolder: ${r.status}`);
  return r.json();
}

export async function deleteFolder(name) {
  const r = await fetch(`${BASE}/api/images/folders/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`deleteFolder: ${r.status}`);
  return r.json();
}

export async function starImage(filename) {
  const r = await fetch(`${BASE}/api/images/${encodeURIComponent(filename)}/star`, { method: 'PATCH' });
  if (!r.ok) throw new Error(`starImage: ${r.status}`);
  return r.json();
}

export async function setImageFolder(filename, folder) {
  const r = await fetch(`${BASE}/api/images/${encodeURIComponent(filename)}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: folder ?? null }),
  });
  if (!r.ok) throw new Error(`setImageFolder: ${r.status}`);
  return r.json();
}

export async function deleteImage(filename) {
  const r = await fetch(`${BASE}/api/images/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`deleteImage: ${r.status}`);
  return r.json();
}

export async function bulkDelete(filenames) {
  const r = await fetch(`${BASE}/api/images/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames }),
  });
  if (!r.ok) throw new Error(`bulkDelete: ${r.status}`);
  return r.json();
}

export async function bulkSetFolder(filenames, folder) {
  const r = await fetch(`${BASE}/api/images/bulk-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames, folder: folder ?? null }),
  });
  if (!r.ok) throw new Error(`bulkSetFolder: ${r.status}`);
  return r.json();
}

/**
 * Stream image generation. Calls onChunk with each parsed NDJSON object.
 */
export async function generateImage(params, onChunk, signal) {
  const r = await fetch(`${BASE}/api/generateimage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`generateImage: ${r.status} ${text}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { onChunk(JSON.parse(trimmed)); } catch (_) {}
    }
  }
}
