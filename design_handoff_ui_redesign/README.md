# Handoff: AI-VC UI Redesign

## Overview
This is a full UI redesign of the AI Voice Chat application (`frontend/index.html`, `frontend/styles.css`, `frontend/app.js`). The redesign introduces a cleaner layout inspired by modern AI chat interfaces (ChatGPT, Claude), adds a **Workspaces** system for different AI modes, and reorganizes controls to reduce clutter.

## About the Design Files
The files in this bundle (`AI-VC.html`, `ai-vc-panels.jsx`, `ai-vc-workspaces.jsx`) are **design references built in HTML/React** — interactive prototypes showing the intended look and behavior. The task is to **recreate these designs inside the existing codebase** (`frontend/index.html`, `frontend/styles.css`, `frontend/app.js`) using its existing patterns and vanilla JS approach — do not ship the prototype JSX directly.

## Fidelity
**High-fidelity.** The prototype uses the exact color tokens, fonts, and spacing from the existing codebase. Recreate pixel-accurately using the existing CSS variable system.

---

## Design Tokens (existing, carry forward)

```css
:root {
  --bg:       #14100b;
  --bg-2:     #1c1710;
  --ink:      #f6efe6;
  --muted:    #b8a88f;
  --accent:   #d4572a;
  --accent-2: #4aa08c;
  --card:     rgba(27, 22, 16, 0.9);
  --stroke:   rgba(246, 239, 230, 0.1);
  --font:     "Space Grotesk", "Segoe UI", sans-serif;
}
```

**Typography:** Space Grotesk (400/500/600/700), Space Mono (monospace, used in diffs only).  
**Background:** `radial-gradient(ellipse at top, #2b2218 0%, #1a140e 40%, #0e0a07 100%)`  
**Grain overlay:** SVG fractalNoise, `mix-blend-mode: screen`, `opacity: 0.04`, fixed + full-bleed.

---

## Overall Layout

```
┌─────────────────────────────────────────────────────┐
│  HEADER (50px tall, fixed)                          │
├─────────────────────────────────────────────────────┤
│                                   │                 │
│   MAIN CONTENT (flex: 1)          │  THINKING PANEL │
│   (workspace fills this area)     │  (420px, fixed) │
│                                   │                 │
└───────────────────────────────────┴─────────────────┘
```

- **Sessions drawer** slides in as an overlay from the left (does NOT push content).
- **Thinking panel** is part of the layout flow (pushes main content). Animates width `420px → 0` with `transition: width 0.22s cubic-bezier(0.4,0,0.2,1)`.
- **Settings** is a centered modal overlay.

---

## Screens / Views

### 1. Header

**Height:** 50px  
**Background:** `rgba(20,16,11,0.97)`, `backdrop-filter: blur(12px)`  
**Border-bottom:** `1px solid var(--stroke)`

Left to right:
1. **Hamburger button** — 34×34px, `border-radius: 8px`, `border: 1px solid var(--stroke)`, `background: rgba(255,255,255,0.04)`. Clicking opens/closes Sessions drawer. SVG icon (3 lines, 16×12).
2. **Workspace tabs** — `Chat | Code | Image`. Each tab is a `<button>`, height 50px, `padding: 0 12px`. Active tab: `font-weight: 700`, `color: var(--ink)`, `border-bottom: 2px solid var(--accent)`. Inactive: `font-weight: 400`, `color: var(--muted)`, `border-bottom: 2px solid transparent`. Font size 14px. Tabs are flush to the header, no extra container.
3. **Spacer** (`flex: 1`)
4. **Model selector** — pill with label "Model" (`font-size: 11px`, `color: var(--muted)`) + `<select>`. Wrapped in a `div` with `border: 1px solid var(--stroke)`, `border-radius: 8px`, `background: rgba(255,255,255,0.04)`, `padding: 4px 10px`.
5. **Source toggle** — segmented control `Local | API`. Container: `border: 1px solid var(--stroke)`, `border-radius: 8px`, `overflow: hidden`. Active button: `background: rgba(212,87,42,0.18)`, `color: var(--accent)`. Inactive: `background: none`, `color: var(--muted)`. Font 12px, weight 600.
6. **Persona selector** — same pill style as Model selector, label "Persona".
7. **Thinking toggle button** — `padding: 5px 12px`, `border-radius: 8px`, with brain SVG icon. Active (open): `border: 1px solid rgba(74,160,140,0.6)`, `background: rgba(74,160,140,0.15)`, `color: #7ecfc0`. Inactive: `border: 1px solid var(--stroke)`, `background: rgba(255,255,255,0.04)`, `color: var(--muted)`. Label: "Thinking", font 12px weight 600.
8. **Settings gear button** — 34×34px, same style as hamburger.

---

### 2. Sessions Drawer

**Width:** 240px  
**Trigger:** Hamburger button toggles `open` state.  
**Animation:** `transform: translateX(-100%) → translateX(0)`, `transition: 0.22s cubic-bezier(0.4,0,0.2,1)`  
**Scrim:** full-bleed absolute overlay, `background: rgba(14,10,7,0.55)`, `opacity` fades `0→1`, clicking scrim closes drawer.

Panel styles:
- `position: absolute; left: 0; top: 0; bottom: 0; z-index: 26`
- `background: rgba(22,17,11,0.98)`, `backdrop-filter: blur(20px)`
- `border-right: 1px solid var(--stroke)`

Contents (top to bottom):
- **Header row:** "SESSIONS" label (11px, weight 700, `letter-spacing: 1.5px`, `text-transform: uppercase`) + ✕ close button. `padding: 14px 16px 10px`. `border-bottom: 1px solid var(--stroke)`.
- **Action row:** "New session" primary button + "Personality" ghost button. `padding: 10px 12px`, `gap: 6px`.
- **Session list:** scrollable, `padding: 4px 12px 12px`. Each session card: `padding: 9px 11px`, `border-radius: 8px`, `margin-bottom: 6px`. Active card: `border: 1px solid rgba(212,87,42,0.45)`, `background: rgba(212,87,42,0.1)`. Inactive: `border: 1px solid var(--stroke)`, `background: rgba(255,255,255,0.03)`. Active badge: "ACTIVE" in 10px, `color: var(--accent)`, weight 600. Timestamp: 11px, `color: var(--muted)`. Active card shows Rename (ghost) + Delete (red-tinted) buttons below.

---

### 3. Thinking Panel

**Width:** 420px (when open), 0px (when closed)  
**Transition:** `width 0.22s cubic-bezier(0.4,0,0.2,1)`  
**Background:** `rgba(18,26,24,0.97)`  
**Border-left:** `1px solid rgba(74,160,140,0.2)`

Inner div is fixed 420px wide (so content doesn't reflow during animation, `overflow: hidden` on outer wrapper handles the clip).

Contents (top to bottom):
- **Header:** "THINKING" label, 12px, weight 700, `color: #7ecfc0`, `letter-spacing: 1.5px`, uppercase. `padding: 12px 14px 10px`. `border-bottom: 1px solid rgba(74,160,140,0.15)`.
- **Scrollable body** `padding: 10px 14px`, `gap: 14px`:
  - Section label style: 10px, weight 700, `color: rgba(126,207,192,0.5)`, `letter-spacing: 1.3px`, uppercase.
  - **Tools used:** `<ul>` with tool names, 12px, `color: #7ecfc0`.
  - **Screenshot:** dashed box 80px tall, `border: 1px solid rgba(74,160,140,0.2)`, `border-radius: 6px`.
  - **Silent response:** 12px text, `color: var(--muted)`.
  - **Full context:** toggle button → reveals `<pre>`, dark bg, monospace 10px, `color: rgba(126,207,192,0.7)`.
  - **Raw output:** same toggle pattern as full context.
- **Footer:** VRAM pie SVG + "VRAM X/Y GB" label (11px, `color: rgba(126,207,192,0.6)`) + token count right-aligned. `padding: 8px 14px`. `border-top: 1px solid rgba(74,160,140,0.15)`.

Toggle button style: `background: rgba(74,160,140,0.08)`, `border: 1px solid rgba(74,160,140,0.2)`, `border-radius: 6px`, `color: rgba(126,207,192,0.7)`, 11px, `padding: 3px 9px`.

---

### 4. Chat Workspace

Fills `flex: 1`, `display: flex`, `flex-direction: column`.

**Chat log** (`flex: 1`, `overflow: auto`, `padding: 20px 24px`, `gap: 14px`):
- **AI messages:** left-aligned, max-width 75%. Avatar: 28×28px, `border-radius: 8px`, `background: rgba(74,160,140,0.2)`, `border: 1px solid rgba(74,160,140,0.4)`, "AI" text. Bubble: `background: rgba(27,22,16,0.9)`, `border: 1px solid var(--stroke)`, `border-radius: 0 12px 12px 12px`, `padding: 10px 14px`, 14px, `line-height: 1.55`.
- **User messages:** right-aligned, max-width 68%. Bubble: `background: var(--accent)`, `border-radius: 12px 12px 0 12px`, `padding: 10px 14px`, 14px, `color: #fff`.
- **Image attachments:** `border-radius: 12px`, `border: 1px solid var(--stroke)`, shown above AI bubble text.
- **Listening indicator:** animated bars (4× bars, widths 3px, heights vary 8–14px, `background: var(--accent)`, CSS `@keyframes pulse` with staggered `animation-delay`).

**Composer** (`padding: 10px 16px 12px`, `border-top: 1px solid var(--stroke)`, `background: rgba(20,16,11,0.95)`, `gap: 8px`):
- **Main row:**
  - Mic toggle button: 38×38px, `border-radius: 10px`. Active: `border: 1px solid var(--accent)`, `background: rgba(212,87,42,0.2)`, `color: var(--accent)`. Inactive: `border: 1px solid var(--stroke)`, `background: rgba(255,255,255,0.05)`, `color: var(--muted)`. Always-on toggle (click to start, click to stop). Shows animated listening indicator in chat log when active.
  - Text input: `flex: 1`, `background: rgba(255,255,255,0.06)`, `border: 1px solid var(--stroke)`, `border-radius: 10px`, `padding: 9px 14px`, 14px, focus: `border-color: rgba(212,87,42,0.5)`.
  - Attach icon button: 38×38px, same ghost style as hamburger. Opens file picker for images.
  - Send button: primary style, `height: 38px`, `padding: 0 18px`, `border-radius: 10px`.
- **Secondary controls strip** (flex row, `gap: 6px`, `flex-wrap: wrap`):
  - Toggle chips for: **Screen** (enables screen capture), **Idle capture**, **Thinking loop**, **TTS**.
  - Toggle chip style: `border-radius: 20px`, `padding: 3px 10px`, 11px. Active: `background: rgba(212,87,42,0.15)`, `border: 1px solid rgba(212,87,42,0.45)`, `color: var(--accent)`, weight 600, dot `background: var(--accent)`. Inactive: `background: rgba(255,255,255,0.05)`, `border: 1px solid var(--stroke)`, `color: var(--muted)`, dot `background: var(--stroke)`.
  - Thin vertical divider, then "New chat" text button (muted, no border).

---

### 5. Code Workspace

Fills `flex: 1`, `display: flex`, `flex-direction: row`.

#### File Tree (left panel, always visible)

**Width:** 180px, `flex-shrink: 0`  
**Background:** `rgba(16,12,8,0.9)`  
**Border-right:** `1px solid var(--stroke)`

- **Header:** "FILES" label (11px, weight 700, muted, uppercase, `letter-spacing: 1.2px`) + "+ Add" ghost button. `padding: 12px 14px 8px`. `border-bottom: 1px solid var(--stroke)`.
- **File list:** scrollable. Each row `padding: 5px 14px`, `cursor: pointer`.
  - Directories: bold, `color: var(--muted)`, not clickable.
  - Files: indent 18px if inside a directory. Has a 14×14px checkbox: `border: 1.5px solid`, `border-radius: 3px`. Checked: `border-color: var(--accent)`, `background: var(--accent)`, shows ✓ in white 9px. Unchecked: `border-color: var(--stroke)`.
  - Selected + changed files: row `background: rgba(212,87,42,0.1)`, `border-left: 2px solid var(--accent)`, filename `color: var(--accent)`.
  - Changed but unselected: filename `color: #d4876e`. Dot indicator on the right: 6×6px circle, `background: var(--accent)`.
- **Footer:** "X files selected", 11px, muted. `padding: 8px 14px`. `border-top: 1px solid var(--stroke)`.

#### Diff Panel (center, `flex: 1`)

`overflow: auto`, `padding: 14px 16px`, `gap: 10px`, `display: flex flex-direction: column`.

**Bulk action bar:** `padding: 8px 12px`, `border-radius: 8px`, `background: rgba(255,255,255,0.04)`, `border: 1px solid var(--stroke)`. Shows summary text left, "✓ Approve all" (teal btn) + "✕ Deny all" (red-tinted btn) right. When all resolved, shows "Reset" ghost button instead.

**Per-file diff card:** `border-radius: 10px`, `overflow: hidden`. Border color changes with state:
- Pending: `1px solid var(--stroke)`
- Approved: `1px solid rgba(74,160,140,0.4)`
- Denied: `1px solid rgba(200,50,50,0.3)`

File header: `background: rgba(10,8,5,0.9)`, `padding: 8px 12px`, file icon SVG + filename (13px, weight 600) + Approve/Deny buttons or status label.

Diff lines: `background: #0b0906`, `font-family: Space Mono`, 12px.
- Deletion line: `background: rgba(200,50,50,0.12)`, gutter color `#e87070`
- Addition line: `background: rgba(40,160,100,0.12)`, gutter color `#4aa08c`
- Context line: transparent, `color: var(--muted)`
- Gutter: `−`/`+`/` ` symbol (28px col) + line number (32px col, muted). Code text follows.
- When denied: `opacity: 0.4` on all lines.

**Code Composer** (bottom, `flex-shrink: 0`):  
`padding: 10px 16px 12px`, `border-top: 1px solid var(--stroke)`, `background: rgba(20,16,11,0.95)`, flex row `gap: 8px`.
- **Push-to-talk mic button:** 38×38px. Hold to record, release to stop (use `mousedown`/`mouseup`/`mouseleave` events — NOT a toggle). While recording: accent border + background, red dot badge (8×8px, top-right, `animation: blink 0.7s infinite`), input placeholder changes to "Recording… release to stop", input border glows `rgba(212,87,42,0.5)`.
- **Text input:** same style as Chat composer.
- **Run button:** primary style, `height: 38px`.

---

### 6. Settings Modal

**Trigger:** Settings gear icon in header.  
**Backdrop:** `position: fixed; inset: 0; z-index: 100`, `background: rgba(10,7,4,0.75)`, `backdrop-filter: blur(6px)`. Click outside modal to close.

**Modal panel:** `width: 460px`, `max-height: 85vh`, `background: #18140e`, `border-radius: 14px`, `border: 1px solid var(--stroke)`, `box-shadow: 0 24px 80px rgba(0,0,0,0.6)`.

**Modal header:** "Settings" 16px weight 700 + ✕ close button. `padding: 16px 20px`. `border-bottom: 1px solid var(--stroke)`.

**Tabs:** `Model | Voice | Context | Services`. Full-width row. Active tab: weight 600, `color: var(--ink)`, `border-bottom: 2px solid var(--accent)`. Inactive: weight 400, `color: var(--muted)`. `border-bottom: 1px solid var(--stroke)` on tab row.

**Tab content** `padding: 18px 20px`, `gap: 14px`:

Section label style: 11px, weight 700, `color: var(--accent)`, `letter-spacing: 1.2px`, uppercase.

Setting row: flex, `justify-content: space-between`, `align-items: center`, label 13px `color: var(--muted)`.

**Segmented control:** `border: 1px solid var(--stroke)`, `border-radius: 8px`, overflow hidden. Active segment: `background: rgba(212,87,42,0.2)`, `color: var(--accent)`, weight 600. Inactive: `background: rgba(255,255,255,0.03)`, `color: var(--muted)`.

**Select inputs:** `background: rgba(255,255,255,0.06)`, `border: 1px solid var(--stroke)`, `border-radius: 7px`, `color: var(--ink)`, 13px, `padding: 5px 10px`.

**Number inputs:** same style as selects, `text-align: right`, `width: 80px`.

**Toggle switch** (for TTS enabled): 44×24px pill. On: `background: var(--accent)`. Off: `background: rgba(255,255,255,0.12)`. Thumb: 20×20px white circle, slides with CSS `left` transition.

**Model tab:** Provider seg control + Model select + Personalities list (cards with Edit/Delete) + Add personality button.

**Voice tab:** TTS enabled toggle + Provider seg control (Browser/Kokoro) + Voice select + Test voice ghost button.

**Context tab:** Max history (number) + Max context tokens (number) + Max RAG results (number) + Search method seg control + Capture timing (Thinking interval, Screenshot interval — both numbers).

**Services tab:** Cards for Kokoro TTS and ComfyUI. Each card: `padding: 12px 14px`, `border-radius: 10px`, `background: rgba(255,255,255,0.04)`, `border: 1px solid var(--stroke)`. Status dot (8×8px circle, green `#4aa08c` or red `#e87070`) + service name (14px weight 600) + Stop/Launch button + Configure dropdown button. Status text below (12px, matching dot color).

---

## Interactions & Behavior

| Interaction | Behavior |
|---|---|
| Workspace tab click | Swaps main content area to that workspace. Header tabs update active state. |
| Hamburger click | Sessions drawer slides in from left over content (overlay, not push). Scrim covers main area. |
| Scrim click | Closes sessions drawer. |
| Thinking button click | Thinking panel animates width 0↔420px. Button style toggles. Main content reflows. |
| Settings gear click | Settings modal fades in over everything. |
| Click outside modal | Closes modal. |
| Chat mic toggle | Click to start listening, click again to stop. While active: mic button glows accent, listening bars animate in chat log. |
| Code mic hold | Hold `mousedown` to record, `mouseup`/`mouseleave` to stop. Blink dot on button, input border glows while recording. |
| File tree checkbox | Toggles file selection. Selected files show accent highlight row + checked checkbox. |
| Diff Approve | Card border turns teal, buttons replaced with "✓ Approved" label. |
| Diff Deny | Card border turns red-tinted, diff lines fade to 0.4 opacity, buttons replaced with "✕ Denied" label. |
| Approve/Deny all | Sets all diffs at once. Bulk buttons replaced with "Reset" when no pending diffs. |
| Settings tab click | Swaps tab content, updates active tab indicator. |
| TTS toggle switch | Animates thumb left/right, background transitions. |

---

## State to Manage

```
workspace:    "chat" | "code" | "image"
sessionOpen:  boolean
thinkingOpen: boolean
settingsOpen: boolean
micActive:    boolean  (chat — toggle)
recording:    boolean  (code — hold)
screenOn:     boolean
idleOn:       boolean
loopOn:       boolean
ttsOn:        boolean
diffApprovals: { [diffIndex]: true | false | undefined }
selectedFiles: Set<string>
settingsTab:  "model" | "voice" | "context" | "services"
```

---

## Existing Functionality to Preserve

All existing JavaScript handlers in `app.js` must remain wired up. The HTML restructuring should preserve:
- Session creation/deletion/rename logic
- Model + provider switching
- TTS provider + voice switching
- Screen capture enable/disable
- Thinking loop + idle capture toggles
- Interval inputs (thinking interval, screenshot interval)
- The full settings modal content (personalities CRUD, Kokoro/ComfyUI service management)
- Image upload + paste + clear
- Chat send + mic start/stop
- The thinking panel data (tools, screenshot, silent response, context, raw output, VRAM)

---

---

## Image Workspace

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (workspace tabs: Chat | Code | Image)                 │
├──────────┬───────────────────────────┬────────────────────────┤
│ Library  │   Masonry Grid            │  Agent Chat            │
│ Nav      │   (CSS columns, 3 col)    │  (260px, always open)  │
│ (180px)  │                           │                        │
├──────────┴───────────────────────────┴────────────────────────┤
│  BOTTOM BAR: [Prompt input] [Enhance] [Negative▾] [More▾] [Generate ×N] │
└──────────────────────────────────────────────────────────────┘
```

The `ImageWorkspace` component must be wrapped in a `display:flex; flex-direction:column; flex:1` container so the bottom bar stacks below the main row.

### Library Nav (left, 180px)

- **All Images** — shows all, sorted newest first
- **★ Starred** — filtered view, star toggled per image
- **Folders** — user-created, `+` button opens inline name input (Enter to confirm, Escape to cancel)
- Active view: `border-left: 2px solid var(--accent)`, `background: rgba(212,87,42,0.1)`
- Footer: total image count

### Masonry Grid (center, flex:1)

- CSS `columns: 3 180px; column-gap: 10px`
- Each card: `break-inside: avoid; margin-bottom: 10px; border-radius: 8px; overflow: hidden`
- Hover state: `transform: scale(1.015)`, border lightens, overlays appear
- **Star button** (top-left, 26×26px): visible on hover or when starred. Accent background when starred.
- **Edit shortcut** (top-right): visible on hover, opens Edit modal
- **Bottom gradient overlay**: prompt snippet (2 lines) + seed + resolution. Visible on hover.
- `draggable` — `dragstart` sets `dataTransfer` with image ID for drag-to-chat
- **Click** → opens Detail Modal

### Detail Modal (click on image)

Centered overlay, `max-width: 80vw`, two columns:
- **Left**: placeholder/image display
- **Right (280px)**: metadata panel
  - Sections: Prompt, Negative Prompt (if set), Generation (seed, resolution, model, timestamp)
  - Actions row: Star · Edit · Delete
  - Section labels: 10px, weight 700, `color: var(--accent)`, uppercase

### Edit Modal (split view, fixed inset)

Three columns:
1. **Original** (flex:1) — image + seed/resolution/model caption
2. **Controls** (320px) — AI analysis spinner (1.2s) → pre-filled prompt textarea + negative prompt textarea + Enhance toggle + Regenerate button
3. **Result** (flex:1) — spinner while generating → result image + seed + "Save to library" button

### Bottom Generation Bar

Always visible, `border-top: 1px solid var(--stroke)`, `padding: 10px 16px`.

**Main row** (always visible):
- Prompt `<input>` — `flex:1`, `font-size:14px`, `border-radius:10px`
- **Enhance toggle** — pill with `MiniToggle` + label. Active: accent tint.
- **Negative button** — expands negative prompt field above the row when active. Shows `●` dot if a value is set.
- **More ▼ button** — expands options row above. Shows `●` if any non-default values (aspect ≠ 1:1, batch > 1, seed set).
- **Generate button** — primary, `height:42px`. Label is "Generate" or "Generate ×N" when batch > 1.

**Expanded options row** (shown above main row when open):
- Negative prompt: full-width text input
- Aspect ratio: pill button group — `1:1 | 3:2 | 2:3 | 16:9 | 9:16 | Custom`. Custom shows a text input for `WxH`.
- Seed: text input (disabled when unlocked) + Lock `MiniToggle` + Randomize `⟳` button. When locked + batch > 1, show note: "Seed varies per batch item" — each batch item gets `baseSeed + batchIndex`.
- Batch count: range slider 1–8, current value shown inline.

**Queue pills** (shown above main row when queue is non-empty):
- Each pill: prompt snippet (truncated) + progress bar (3px, accent color) + status label + ✕ cancel
- `min-width:180px; max-width:240px; flex-shrink:0`

### Agent Chat (right, 260px, always open)

Same structure as Chat workspace but without mic/secondary controls. Full message history, `<input>` + Send button at bottom. Messages use same bubble styles.

### State

```
images:        Image[]          // { id, prompt, negPrompt, seed, resolution, model, timestamp, folder, starred, w, h }
folders:       string[]         // user-created folder names
activeFolder:  string           // "all" | folder name
showStarred:   boolean
detailImg:     Image | null     // currently open in detail modal
editImg:       Image | null     // currently open in edit modal
prompt:        string
negPrompt:     string
enhance:       boolean          // default true
seed:          string
lockSeed:      boolean
batchCount:    number           // 1–8
aspectRatio:   { label, res }   // res is null for Custom
customRes:     string           // used when aspectRatio.label === "Custom"
negOpen:       boolean          // negative prompt row expanded
moreOpen:      boolean          // more options row expanded
queue:         QueueItem[]      // { id, prompt, status, progress }
chatMessages:  ChatMessage[]
chatInput:     string
```

### Batch Generation

When generating with `batchCount > 1`:
- If `lockSeed` is true: each image gets `seed + batchIndex` to ensure variation
- If `lockSeed` is false: each image gets a random seed
- All batch images are added to the library when the queue item completes

### Image Metadata to Store

When saving generated images, store alongside the data URL:
```json
{
  "prompt": "original or enhanced prompt sent to ComfyUI",
  "negPrompt": "negative prompt",
  "seed": 42190,
  "resolution": "1024x1024",
  "model": "dreamshaper_8",
  "timestamp": "ISO string",
  "folder": "root",
  "starred": false
}
```

This should be stored in the session's image group entry so the edit flow can pre-fill the prompt and the detail panel can display full metadata.

### Edit Flow (backend)

1. User clicks Edit → frontend calls `/api/describe-image` with the image data URL
2. Backend asks the LLM to describe the image as a generation prompt
3. Response pre-fills the prompt textarea
4. User edits prompt → clicks Regenerate → calls `/api/generateimage` as normal
5. Result can be saved as a new image in the library

---

## Files in This Bundle

| File | Purpose |
|---|---|
| `AI-VC.html` | Main hi-fi prototype — open in browser to see the full design |
| `ai-vc-panels.jsx` | Header, Sessions drawer, Thinking panel, Settings modal components |
| `ai-vc-workspaces.jsx` | Chat workspace and Code workspace components |
| `ai-vc-image-workspace.jsx` | Image workspace component (library, generation bar, edit modal) |
| `AI-VC Wireframes v2.html` | Earlier wireframe exploration for layout context |
