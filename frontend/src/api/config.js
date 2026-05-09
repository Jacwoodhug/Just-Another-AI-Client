// frontend/src/api/config.js — consumed ONLY by React hooks (ES modules via Vite)

export async function getConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}

export async function putConfig(patch) {
  await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function getImageChat() {
  const res = await fetch('/api/image-chat');
  if (!res.ok) throw new Error('Failed to fetch image chat');
  return res.json();
}

export async function putImageChat(msgs) {
  await fetch('/api/image-chat', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msgs),
  });
}

export async function getCodeWorkspaceState() {
  const res = await fetch('/api/code/workspace-state');
  if (!res.ok) throw new Error('Failed to fetch code workspace state');
  return res.json();
}

export async function putCodeWorkspaceState(s) {
  await fetch('/api/code/workspace-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
}
