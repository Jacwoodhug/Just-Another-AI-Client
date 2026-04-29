# Plan: Implement Image Workspace

## TL;DR
Build the Image Workspace React component matching the `design_handoff_ui_redesign/ai-vc-image-workspace.jsx` design. The workspace has four areas: left library nav, center masonry grid, right agent chat (reusing `ChatBubble` + event-bridge pattern from Chat Workspace), and a bottom generation bar wired to the existing `/api/generateimage` streaming endpoint. Image metadata (folder, starred) is persisted via new backend endpoints backed by a JSON sidecar file in `generated_images/`.

---

## Phase 1 — Backend: Image Library API

**1.1** Add image metadata store in `backend/app.py`:
- Load/save `backend/generated_images/library.json` (dict keyed by filename: `{ starred, folder, prompt, negPrompt, seed, resolution, model, timestamp }`)
- Populate on first `image_ready` event from `generateimage` by recording metadata there

**1.2** Add new routes to `backend/app.py`:
- `GET /api/images` — list all images with metadata, returns array of image objects
- `GET /api/images/folders` — list custom folder names
- `POST /api/images/folders` — `{ name }` → create folder
- `DELETE /api/images/folders/{name}` — delete folder (images stay, just unassigned)
- `PATCH /api/images/{filename}/star` — toggle starred boolean
- `PATCH /api/images/{filename}/folder` — `{ folder: string|null }` set folder
- `DELETE /api/images/{filename}` — delete image file + metadata entry
- `POST /api/images/bulk-delete` — `{ filenames: [] }` → delete each file + metadata entry
- `POST /api/images/bulk-folder` — `{ filenames: [], folder: string|null }` → assign folder on multiple entries

**1.3** Update `/api/generateimage` to write metadata to `library.json` on `image_ready` (stores prompt, negPrompt, seed, resolution, model, timestamp).

---

## Phase 2 — Frontend API Wrapper

**2.1** Create `frontend/src/api/image.js`:
- `listImages()` → `GET /api/images`
- `listFolders()` → `GET /api/images/folders`
- `createFolder(name)` → `POST /api/images/folders`
- `deleteFolder(name)` → `DELETE /api/images/folders/{name}`
- `starImage(filename)` → `PATCH /api/images/{filename}/star`
- `setImageFolder(filename, folder)` → `PATCH /api/images/{filename}/folder`
- `deleteImage(filename)` → `DELETE /api/images/{filename}`
- `bulkDelete(filenames)` → `POST /api/images/bulk-delete`
- `bulkSetFolder(filenames, folder)` → `POST /api/images/bulk-folder`
- `generateImage(params, onChunk)` → streaming fetch to `POST /api/generateimage`, calls `onChunk` with each NDJSON line

---

## Phase 3 — Hook: `useImageWorkspace.js`

**3.1** Create `frontend/src/hooks/useImageWorkspace.js` modeled after `useChatWorkspace.js`:

**Image library state:**
- `images[]`, `folders[]`, `activeFolder` ("all"|name), `showStarred`
- `detailImg`, `editImg` (modal visibility)
- `selectedImages` — `Set<filename>` for bulk selection
- `addingFolder`, `newFolderName`
- On mount: call `listImages()` + `listFolders()` to hydrate

**Generation state:**
- `prompt`, `negPrompt`, `enhance`, `seed`, `lockSeed`, `batchCount`, `aspectRatio`, `customRes`
- `negOpen`, `moreOpen` (expanded sections)
- `queue[]` — items `{ id, prompt, status, progress }`

**Agent chat state:**
- `chatMessages[]`, `chatInput`
- Listen to `image-chat:*` custom events (same pattern as `chat:*`)
- Expose `sendImageChatMessage(text)` → calls `window.imageChatBridge?.sendText(text)`

**Actions:**
- `handleGenerate()` — for each batch item, push to queue, call `generateImage()` streaming, update progress, on `image_ready` push to `images[]` and update library.json via API
- `handleStar(filename)`, `handleDelete(filename)`, `handleSetFolder(filename, folder)`
- `handleDropToFolder(filename, folderName)` — calls `setImageFolder(filename, folderName)`, updates the matching entry in `images[]` optimistically, then re-fetches on error
- `toggleSelect(filename)`, `selectAll()`, `clearSelection()`
- `handleBulkDelete()` — calls `bulkDelete(selectedImages)`, removes from `images[]`, clears selection
- `handleBulkSetFolder(folder)` — calls `bulkSetFolder(selectedImages, folder)`, updates `images[]`
- `addFolder(name)`, `deleteFolder(name)`

---

## Phase 4 — Core UI Components

**4.1** `frontend/src/components/ImageWorkspace/LibraryNav.jsx`
- Props: `images, folders, activeFolder, showStarred, onSetFolder, onToggleStarred, onAddFolder, onDeleteFolder, addingFolder, newFolderName, onNewFolderName, onConfirmFolder, onCancelFolder, onDropToFolder`
- Renders: "All Images" + count, "★ Starred" + count, Folders list with `+` button, image count footer
- Each folder `NavRow` is a drop target: `onDragOver={e => e.preventDefault()}` + `onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); onDropToFolder(id, folderName); }}`
- Drop highlight: folder row gets `background: rgba(212,87,42,0.15)` while a card is dragged over it (`dragover` CSS state via `onDragEnter`/`onDragLeave` local state)
- Style: `width:180px; flex-shrink:0; border-right:1px solid var(--stroke)`
- Reuse `NavRow` sub-component inline

**4.2** `frontend/src/components/ImageWorkspace/ImageCard.jsx`
- Props: `img, selected, onStar, onEdit, onClick, onToggleSelect, onDragStart`
- Hover star button (top-left), hover edit button (top-right)
- Checkbox visible on hover or when `selected` — clicking it calls `onToggleSelect` without opening DetailModal
- When `selected`: border `rgba(212,87,42,0.6)`, subtle tint overlay `rgba(212,87,42,0.1)`
- Bottom overlay on hover (prompt snippet, seed/res)
- Draggable: `draggable` attribute + `onDragStart={e => e.dataTransfer.setData('text/plain', img.filename)}` — uses `img.filename` as the transfer payload so the folder drop handler can call `setImageFolder`

**4.3** `frontend/src/components/ImageWorkspace/ImageGrid.jsx`
- Props: `images, activeFolder, showStarred, selectedImages, folders, onStar, onEdit, onCardClick, onToggleSelect, onBulkDelete, onBulkSetFolder, onClearSelection`
- Filtered view based on `activeFolder`/`showStarred`
- CSS columns masonry: `columns: 3 180px; column-gap: 10px`
- `break-inside: avoid; margin-bottom: 10px` on cards
- When `selectedImages.size > 0`: renders a **BulkActionBar** above the grid — "N selected · Move to ▾ | Delete | Clear" — folder dropdown uses existing `folders[]`
- Empty state message

**4.4** `frontend/src/components/ImageWorkspace/AgentChat.jsx`
- Props: `messages, chatInput, onInputChange, onSend`
- **Reuses `ChatBubble`** from `components/shared/ChatBubble.jsx`
- Smaller font: wrap in a `.image-agent-chat` CSS class that overrides bubble font-size to 12px, avatar to 24px
- No mic, no toggles — just scrolling message list + input + send button
- Width: 260px, `border-left: 1px solid var(--stroke)`

**4.5** `frontend/src/components/ImageWorkspace/QueuePill.jsx`
- Props: `item, onCancel`
- Shows truncated prompt, 3px progress bar, status label, ✕ cancel

**4.6** `frontend/src/components/ImageWorkspace/GenerationBar.jsx`
- Props: all generation state + handlers from hook
- Bottom bar with: prompt input, enhance MiniToggle, neg button, more button, generate button
- Expanded row (when `negOpen || moreOpen`): neg prompt single-line `<input>` (matching design), aspect ratio buttons, seed section, batch slider
- Queue pills row (when `queue.length > 0`)

---

## Phase 5 — Modal Components

**5.1** `frontend/src/components/ImageWorkspace/DetailModal.jsx`
- Props: `img, onClose, onStar, onEdit, onDelete`
- Fixed overlay (z-index:150), two-column layout (image + metadata)
- MetaSection + MetaRow sub-components inline

**5.2** `frontend/src/components/ImageWorkspace/EditModal.jsx`
- Props: `img, onClose, onSaveToLibrary`
- Fixed overlay (z-index:200), three-column layout: Original | Controls | Result
- Simulates "analyzing" on mount (1.2s delay before showing prompt)
- Generate → calls `generateImage()` in single mode, shows result in Result column
- After result appears: show "Save to library" (`btn-teal`) + seed/resolution line below the result image
- "Save to library" calls `onSaveToLibrary(resultImg)` → pushes to `images[]` via API and closes modal; result is NOT saved automatically

---

## Phase 6 — Container + Styles

**6.1** `frontend/src/components/ImageWorkspace/index.jsx`
- Calls `useImageWorkspace()` hook
- Layout: `display:flex; flex-direction:column; flex:1; minHeight:0; overflow:hidden`
- Main area: `display:flex; flex:1; minHeight:0`
  - LibraryNav | ImageGrid | AgentChat
- Bottom: GenerationBar (flex-shrink:0)
- Portals/conditionals for DetailModal, EditModal

**6.2** `frontend/src/components/ImageWorkspace/ImageWorkspace.css`
- `.image-agent-chat` — font-size overrides for smaller chat bubbles (12px), avatar 24px
- `.image-masonry` — CSS columns masonry grid
- `.image-card` — card styles, hover, star/edit/select buttons
- Generation bar styles, queue pill styles

---

## Phase 7 — Integration

**7.1** Update `frontend/src/main.jsx` — add `ImageWorkspace` root mount:
```js
import ImageWorkspace from './components/ImageWorkspace/index.jsx';
const imageContainer = document.getElementById('imageWorkspace');
if (imageContainer) createRoot(imageContainer).render(<ImageWorkspace />);
```

**7.2** Update `frontend/index.html` — confirm `#imageWorkspace` div is a clean empty container.

**7.3** Update `frontend/app.js` — add `imageChatBridge` registration (similar to `chatBridge`) to handle `sendText` for image agent chat, connecting to `/api/chat/stream` with `workspace: 'image'`.

---

## Relevant Files

**Read/modify:**
- `frontend/src/main.jsx` — add ImageWorkspace React root
- `frontend/index.html` — confirm `#imageWorkspace` div exists (it does)
- `frontend/app.js` — add `window.imageChatBridge`
- `backend/app.py` — add library.json store + image CRUD routes; update `/api/generateimage` to write metadata
- `frontend/src/components/shared/ChatBubble.jsx` — reused as-is in AgentChat
- `frontend/src/hooks/useChatWorkspace.js` — reference pattern only

**Create:**
- `frontend/src/api/image.js`
- `frontend/src/hooks/useImageWorkspace.js`
- `frontend/src/components/ImageWorkspace/index.jsx`
- `frontend/src/components/ImageWorkspace/LibraryNav.jsx`
- `frontend/src/components/ImageWorkspace/ImageGrid.jsx`
- `frontend/src/components/ImageWorkspace/ImageCard.jsx`
- `frontend/src/components/ImageWorkspace/AgentChat.jsx`
- `frontend/src/components/ImageWorkspace/GenerationBar.jsx`
- `frontend/src/components/ImageWorkspace/QueuePill.jsx`
- `frontend/src/components/ImageWorkspace/DetailModal.jsx`
- `frontend/src/components/ImageWorkspace/EditModal.jsx`
- `frontend/src/components/ImageWorkspace/ImageWorkspace.css`

---

## Verification

1. Switch to Image tab → workspace renders with library nav, empty masonry grid, agent chat panel, and generation bar
2. Type a prompt and click Generate → queue pill appears, streams status messages, image appears in grid on completion
3. Generate ×N (batch > 1) → N queue pills appear and resolve
4. Click an image card → DetailModal opens with metadata
5. Click ✏ Edit → EditModal opens with 3 columns, analyzing animation, then prompt editable, regenerate produces result; clicking "Save to library" adds it to the grid
6. Star an image → border turns accent, Starred count increments, shows in ★ Starred view
7. Add a folder → inline input appears, confirm → folder shows in nav
8. Drag image card to folder → image moves to that folder
9. Select multiple cards → BulkActionBar appears; bulk delete and bulk move to folder work
10. Agent chat: type a message and send → streams AI response via `/api/chat/stream` with `workspace: 'image'`
11. Run `npm run build` — no errors

---

## Decisions

- **Metadata storage**: `generated_images/library.json` (flat JSON dict). Simpler than a new DB table, consistent with project's light footprint. Deletion removes both the image file and its JSON entry.
- **Agent chat endpoint**: Reuse `/api/chat/stream` with `workspace: 'image'` — no new backend endpoint needed.
- **Batch queue**: Frontend-only sequencing (one `generateimage` call at a time, queued in JS).
- **EditModal regeneration**: Calls `/api/generateimage` directly (raw:false, single image), shows result inline. Result is only saved when user explicitly clicks "Save to library" — this calls the `PATCH /api/images/{filename}/folder` + star defaults and adds the image to `images[]`.
- **Drag to folder**: `ImageCard.onDragStart` sets `img.filename` in `dataTransfer` as `text/plain`. Each folder `NavRow` in `LibraryNav` handles `onDragOver` (calls `e.preventDefault()` to allow drop), `onDragEnter`/`onDragLeave` (local `isDragOver` state for highlight), and `onDrop` (reads filename from dataTransfer, calls `onDropToFolder(filename, folderName)`). The hook's `handleDropToFolder` updates state optimistically and calls `setImageFolder` API.
- **Bulk operations**: Multi-select via per-card checkbox; BulkActionBar appears in grid when selection is non-empty; supports bulk delete and bulk move-to-folder.
- **Excluded**: pagination/infinite scroll, undo/redo for images, image-to-image (img2img).
