# Code Workspace — Implementation Plan

## TL;DR
Replace the placeholder `#codeWorkspace` div with a fully functional 3-panel Code Workspace. Add 8 AI-callable file and command tools to the backend. Only **write/delete/execute** tools require approval (4 of 8); the four read-only tools run automatically inside the registered workspace. Approvals queue when the LLM batches multiple calls, and each prompt shows the AI's stated reason. File edits are recorded into a **persistent on-disk undo/redo history grouped by user prompt** — undoing rewinds every file touched by that prompt atomically. History storage is bounded by a user-configurable disk limit (default 1 GB); oldest change-groups are evicted globally when over. The 8 code tools are only available in the Code Workspace; all base tools (web search, memory, screenshot, image gen) remain available there too. The Code Workspace runs on its own session distinct from Chat.

---

## Phase 1 — Code Workspace UI Shell
**Goal:** Replace the placeholder div with the full 3-panel layout (no live data yet).

**1.** In `frontend/index.html`, replace `#codeWorkspace` placeholder content with:
  - Left panel: `.code-file-tree` (180px fixed width)
    - Header row: "FILES" label + "+ Add Dir" button (hidden until first folder loaded)
    - Tree body `.code-tree-body` (scrollable)
    - "Select Folder" empty-state button centered when no dirs loaded
    - Footer row: "{N} file(s) selected" count + small ⚙ settings button (opens history settings panel)
  - Middle panel: `.code-log` (flex-grow, scrollable)
    - Empty-state text "No activity yet"
    - Holds: AI text blocks, approval prompts, diff blocks, console output blocks
  - Top toolbar of `.code-log` panel: **Undo / Redo buttons** (`↶ Undo` and `↷ Redo`) — disabled when their respective stacks are empty. Each shows a tooltip with the prompt text of the change-group it would affect ("Undo: 'add logging to db module'").
  - Bottom composer: `.code-composer` (fixed height)
    - Push-to-talk mic button (hold to record)
    - Text input "Ask AI to edit files…"
    - "Run" send button (`.btn-primary`)

**2.** In `frontend/styles.css`, add styles for:
  - `.code-file-tree`, `.code-tree-body`, `.code-tree-item`, `.code-tree-item.selected`, `.code-tree-dir`
  - `.code-change-dot` (orange 6px dot for modified files)
  - `.code-prevented` (50% opacity — Prevent Agent Edit state)
  - `.code-hidden` (eye-slash icon + heavy muted style — Hide from LLM state)
  - `.code-log`, `.code-log-block` (base container for all log entries)
  - `.code-text-block` (AI response text)
  - `.code-approval-block` (pending approval prompt)
  - `.code-approval-block .warning-badge` (orange badge for runCommand-touches-prevented-path warnings)
  - `.code-diff-block` (diff viewer with add/del line colouring)
  - `.code-console-block` (terminal-style stdout/stderr output)
  - `.code-info-block` (compact result for auto-executed read-only tools)
  - `.code-composer`
  - `.revert-btn` (ghost button shown after approved writes)
  - `.code-undo-redo` (toolbar container) and `.code-undo-redo button` (`↶`/`↷` icon buttons with disabled state)
  - `.code-history-settings` (modal panel for storage limit + Clear History controls)

---

## Phase 2 — File Tree & Folder Management
**Goal:** Working folder selection, live file tree, and per-item access controls.

**3.** Backend — add to `backend/app.py`:
  - `GET /api/code/pick-folder` — opens a native folder picker by **spawning a short-lived Python subprocess** that runs `tkinter.filedialog.askdirectory()` and prints the chosen path. The FastAPI handler reads stdout. This avoids the in-process Tk reliability issues on Windows. Fallback: returns `{path: null, error: "..."}`.
  - `GET /api/code/files?paths[]=<dir1>&paths[]=<dir2>` — returns recursive file tree JSON `[{path, name, type, children}]`. Skips `.git`, `__pycache__`, `node_modules` by default. Used **only by the frontend** for tree rendering — the LLM does not receive this payload.

**4.** Frontend (`app.js`) — add Code Workspace state variables:
  ```js
  codeSessionId        // string  — persisted to localStorage['codeSessionId']
  codeWorkspaceDirs    // string[]  — persisted to localStorage['codeWorkspaceDirs']
  codeSelectedFiles    // Set<string> — persisted to localStorage['codeSelectedFiles'] (serialised as JSON array)
  codePreventedPaths   // Set<string> — persisted to localStorage['codePreventedPaths']
  codeHiddenPaths      // Set<string> — persisted to localStorage['codeHiddenPaths']
  codeFileTree         // array — fetched tree data from /api/code/files (frontend display only, not persisted)
  codePendingApproval  // object|null — currently displayed approval awaiting click
  ```

**5.** Frontend — folder management logic:
  - "Select Folder" button → `GET /api/code/pick-folder` → add path to `codeWorkspaceDirs`, refresh tree
  - "+ Add Dir" button (same flow; shown after ≥1 folder loaded)
  - All right-click actions go through a shared `showCodeTreeContextMenu(path, isDir)` handler
  - `renderCodeFileTree()` — builds tree DOM; folders expand/collapse on click; files show checkbox + change-dot

**5b.** Right-click context menu items for any file or folder:

  **"Remove from tree"** (top-level folders only)
  - Removes path from `codeWorkspaceDirs`, refreshes tree.

  **"Prevent Agent Edit" / "Allow Agent Edit"** (toggle)
  - Greys out the item name at 50% opacity (`.code-prevented` class).
  - Applied to a folder: protects the entire subtree.
  - Persisted in `localStorage['codePreventedPaths']`.
  - Prevented paths sent to backend as `prevented_paths: list[str]` in `ChatRequest`.
  - Backend blocks `writeFile`, `createFile`, `deleteFile` on these paths (see step 10).
  - Backend additionally **warns in the approval block** if a prevented path appears as a substring in a `runCommand` `command` field — the user still approves/denies; this is a UX warning, not a block.
  - `readFile` and `searchInFile` still work on prevented files.

  **"Hide from LLM" / "Unhide from LLM"** (toggle)
  - Renders the item with an eye-slash icon and heavy muted styling (`.code-hidden` class).
  - Applied to a folder: hides the entire subtree.
  - Persisted in `localStorage['codeHiddenPaths']`.
  - Hidden paths are sent in `hidden_paths: list[str]` so the backend can scrub them from `listDirectory` output and refuse `readFile` on them.
  - `listDirectory` results are filtered server-side to exclude any hidden paths or descendants of hidden dirs.
  - `searchInFile` skips hidden files silently.
  - If the LLM somehow constructs a hidden path and calls `readFile`, backend returns: `[Hidden] The path '<path>' does not exist in the accessible file tree.`
  - The user can still see and interact with hidden files in the tree normally.

**6.** All five values (`codeSessionId`, `codeWorkspaceDirs`, `codeSelectedFiles`, `codePreventedPaths`, `codeHiddenPaths`) persist to `localStorage` and are reloaded on startup. `codeSessionId` is generated on first visit (`crypto.randomUUID()`) and stays stable across reloads. Duplicate directories are prevented client-side: before pushing to `codeWorkspaceDirs`, check whether the resolved path is already present (or is a parent/child of an existing entry) and silently skip if so.

---

## Phase 3 — Backend Code Tools & Approval Flow
**Goal:** New tool definitions, guardrail checks, and pending approval queue.

**7.** In `backend/app.py`, define `CODE_TOOL_DEFINITIONS` (8 tools, separate from `TOOL_DEFINITIONS_BASE`):

  | Tool | Approval required | `summary` required |
  |---|---|---|
  | `readFile(path, start_line?, end_line?)` | **No** | No |
  | `findFiles(pattern, directory)` | **No** | No |
  | `listDirectory(directory)` | **No** | No |
  | `searchInFile(path, query)` | **No** | No |
  | `writeFile(path, content, summary)` | Yes | Yes |
  | `createFile(path, content, summary)` | Yes | Yes |
  | `deleteFile(path, summary)` | Yes | Yes |
  | `runCommand(command, cwd, summary)` | Yes | Yes |

  - All four read-only tools auto-execute as long as their path/directory is inside a registered workspace dir and is not hidden. No approval prompt.

  - **`readFile(path, start_line?, end_line?)`** — if the file is binary (contains null bytes) or larger than 5 MB, return `[Skipped: file too large or binary]` rather than raw bytes. Otherwise, line numbers are **1-indexed** and **inclusive** on both ends. Each parameter is independently optional:
    - both omitted → return the whole file
    - `start_line` only → return from `start_line` through EOF
    - `end_line` only → return from line 1 through `end_line`
    - both → return `start_line..end_line`
    - The response is wrapped with a small header so the LLM knows what it received: `[lines 30–60 of 412 in src/db.py]\n<content>`. When the whole file is returned the header reads `[lines 1–412 of 412 in src/db.py]`.
    - Out-of-range values are clamped to the file's actual range (no errors). `start_line > end_line` returns an empty body with the header noting the invalid range.

  - **`searchInFile(path, query)`** — case-insensitive substring search. For each match, returns the line number and **2 lines of context before and after** the match, ripgrep-style. Adjacent or overlapping match windows are merged so the LLM doesn't see duplicated lines. Output shape:
    ```
    src/db.py: 3 matches
    -- line 42 --
    40 | def connect(url):
    41 |     """Open a connection."""
    42 |     return psycopg2.connect(url)
    43 |
    44 | def close(conn):
    -- line 78 --
    76 | def get_user(user_id):
    77 |     with connect(DATABASE_URL) as conn:
    78 |         conn = connect(DATABASE_URL)   ← match
    79 |         return conn.execute(...)
    80 |
    ```
    Works on prevented files. Skips hidden files silently. If the file is binary or larger than a sane cap (say 5 MB), returns `[Skipped: file too large or binary]` for that path.

**8.** Add path validation helpers:
  - `_is_path_allowed(path, allowed_dirs)` — resolves the absolute path (following symlinks via `Path.resolve()`) and checks it is inside one of the registered workspace dirs. Guards against directory traversal (`../` etc.) and symlinks that point outside the workspace.
  - `_is_path_hidden(path, hidden_paths)` — true if path equals or descends from any hidden path.
  - `findFiles` applies `_is_path_allowed` to **each matched result path**, not just the `directory` arg. A glob pattern like `../../**/*.py` could otherwise match files outside the workspace; filtering each result rather than just the root closes that gap.

**9.** Add in-memory pending approval **queue** store:
  ```python
  _pending_code_approvals: dict[str, dict] = {}
  # key: code_session_id
  # value: {
  #   messages,                  # full message list at the pause point
  #   pending_queue: list[dict], # FIFO queue: [{call_id, name, args, summary, warnings}, ...]
  #   completed_results: list,   # results already collected for calls earlier in this batch
  #   batch_data,                # the original LLM response data (for _append_tool_result_messages)
  #   raw_tool_calls,            # original raw_tool_calls from this batch
  # }
  ```
  When the LLM returns multiple tool calls in one response and any of them require approval, we drain the queue one at a time before resuming the loop.

**10.** Modify `_run_tool_loop()` / `_execute_tool()` — per-tool decision tree (evaluated in order, per call within a batch):

  1. **Hidden check** — if path matches a hidden path → return immediately (no approval, no execute):
     `[Hidden] The path '<path>' does not exist in the accessible file tree.`
  2. **Scope check** — if path/cwd not inside any `workspace_dirs` (resolved absolute) → return:
     `[Out of scope] The path '<path>' is not in the loaded workspace. Only files inside registered workspace directories may be accessed.`
  3. **Prevented check** — if tool is `writeFile`, `createFile`, or `deleteFile` and path matches `prevented_paths` → return:
     `[Edit prevented] The file '<path>' has been marked as protected by the user. It cannot be modified or deleted.`
  4. **No-approval tool** (`readFile`, `findFiles`, `listDirectory`, `searchInFile`) → execute immediately, append result.
  5. **Approval-required tool** → enqueue on `pending_queue` with computed `warnings` (see 10a) and pause the loop. Other approval-required calls in the same batch also enqueue. Read-only calls in the same batch execute and their results sit in `completed_results` while the queue drains.

  Steps 1–3 inject the error as the tool result and continue without an approval prompt.

  **Missing `summary`:** if an approval-required tool omits `summary`, the backend injects `"(no reason given)"` rather than rejecting the call. The approval block surfaces this verbatim so the user knows the model didn't justify the action.

**10a.** `runCommand` warning detection:
  - When enqueuing a `runCommand` approval, scan `args.command` for any `prevented_paths` substring match.
  - If found, attach `warnings: ["This command references a protected file: <path>"]` to the queued entry.
  - The approval block renders the warning prominently but the user can still approve.

**11.** Add `POST /api/code/approve` endpoint:
  ```json
  { "code_session_id": "...", "call_id": "...", "approved": true }
  ```
  - Looks up `_pending_code_approvals[code_session_id]`, finds the matching `call_id` at the head of `pending_queue`.
  - If `approved: true` → execute the tool, capture result.
  - If `approved: false` → result is `[Denied by user] The action '<tool_name>' on '<path or command>' was denied. Do not retry this action unless the user explicitly asks you to.`
  - Append the result to `completed_results`, pop from `pending_queue`.
  - **If queue is non-empty:** return `pending_tool_approval` for the next queued call. (Loop is still paused.)
  - **If queue is empty:** call `_append_tool_result_messages(messages, batch_data, raw_tool_calls, completed_results, provider)`, resume `_run_tool_loop()`. The resumed loop may produce another batch with its own approvals.
  - For **`writeFile` / `createFile` / `deleteFile`** approvals, the response body includes:
    - `original_content` — the file's content before the edit (empty string `""` for `createFile` on a new path; the file's current content for `deleteFile`).
    - `new_content` — the `content` arg from the LLM's tool call (`null` for `deleteFile`). Together with `original_content`, the frontend has both sides of the diff without any extra fetch.
  - Returns same `ChatResponse` shape (may contain another `pending_tool_approval`). `next_undo_summary` / `next_redo_summary` are populated on every response.
  - Cleans up `_pending_code_approvals[code_session_id]` when the loop completes fully.

**12.** Add **change-group history** (persistent on-disk undo/redo):

  **Data model.** A *change-group* is the atomic unit of undo/redo. One change-group bundles every approved `writeFile` / `createFile` / `deleteFile` that ran during a single user prompt's complete tool loop (from the user submitting a prompt until the loop finally returns an `assistant_text` with no further pending approvals). Undoing a change-group restores every file it touched simultaneously, so the user never lands in a half-rewound state where one file references a symbol another file no longer defines.

  **On-disk layout** under `backend/code_history/`:
  ```
  backend/code_history/
    index.json                       # ordered list of change-group ids + per-file deltas + cumulative byte size
    <change_id>/                     # change_id = ISO timestamp + short uuid, sortable
      metadata.json                  # {id, code_session_id, prompt_text, created_at, files: [{path, op, before_size, after_size}], size_bytes}
      before/<sha-of-path>.bin       # original content of each touched file (one file per modified path; deletes also store the original)
      after/<sha-of-path>.bin        # post-edit content (lets us redo without re-running the LLM)
  ```
  Path SHA is just used to sidestep filesystem-illegal characters; `metadata.json` keeps the human-readable absolute path.

  **In-memory index** (rebuilt on startup from `index.json`):
  ```python
  _code_history: dict[str, list[dict]] = {}
  # key: code_session_id
  # value: chronologically ordered list of change-groups for that session
  _code_history_redo: dict[str, list[dict]] = {}
  # key: code_session_id  (forward stack — populated by Undo, drained by Redo)
  _code_history_total_bytes: int = 0  # global across all sessions
  ```

  **Recording a change-group.**
  - When the tool loop begins for a user prompt, allocate a fresh `change_id` and an in-flight group object held in memory.
  - For each approved `writeFile` / `createFile` / `deleteFile`, before mutating the file:
    - Read current content (or note `"__did_not_exist__"` sentinel for `createFile` on a new path).
    - **Only record `before_content` the first time a given path appears in the in-flight group.** If the same path is written again later in the same tool loop, update only the `op` and leave `before_content` as the original pre-loop state. This ensures undo always restores to the state before the entire prompt, not an intermediate state mid-loop.
    - Append or update `{path, op, before_content}` in the in-flight group's path map (keyed by resolved absolute path).
  - After the tool loop returns its final `assistant_text` (no more pending approvals), commit the group:
    - Capture each touched file's *post-edit* content as `after_content`.
    - Write `metadata.json`, `before/*.bin`, `after/*.bin` to disk.
    - Append to `_code_history[code_session_id]`, update `index.json`, increment `_code_history_total_bytes`.
    - Clear `_code_history_redo[code_session_id]` (new edit discards the redo stack).
  - If the loop produced zero approved writes, no group is created.
  - If a new approved write happens *while a previous prompt's group is still in-flight* (shouldn't happen — loop is paused on approvals, and the new prompt confirm-dialog auto-denies pending), the in-flight group is discarded and a fresh one starts with the new prompt.

  **The `original_content` returned in the `/api/code/approve` response** comes from this group's in-flight `before_content` — same source of truth as undo, so the inline diff and the undo restore are guaranteed consistent.

  **Eviction (LRU global).** After every commit:
  - Compute total bytes across `index.json`.
  - If `total > storage_limit_bytes`, delete the oldest change-group folder across **all sessions** (not just the active one), update `index.json`, decrement total. Repeat until under limit.
  - If a single change-group is itself larger than the limit, store it anyway and warn in the response — refusing would silently break undo. The next commit will still try to evict.
  - Eviction also walks the redo stacks (a redoable group counts toward the budget).

  **Endpoints.**

  `POST /api/code/undo`
  ```json
  { "code_session_id": "..." }
  ```
  - Pops the most recent change-group from `_code_history[code_session_id]`.
  - Restores every file in the group from its `before_content`. `createFile` ops are reversed by deleting the file. `deleteFile` ops are reversed by recreating with `before_content`.
  - Pushes the group onto `_code_history_redo[code_session_id]`.
  - Returns `{ok: true, restored_files: [...], change_id: "..."}` or `{ok: false, error: "Nothing to undo"}`.

  `POST /api/code/redo`
  ```json
  { "code_session_id": "..." }
  ```
  - Pops the top of `_code_history_redo[code_session_id]`.
  - Re-applies each file's `after_content`. Reversed `createFile` is re-created; reversed `deleteFile` is re-deleted.
  - Pushes the group back onto `_code_history[code_session_id]`.
  - Returns same shape as undo, or `{ok: false, error: "Nothing to redo"}`.

  `POST /api/code/revert` *(per-file revert from inside a change-group)*
  ```json
  { "code_session_id": "...", "change_id": "...", "path": "..." }
  ```
  - Restores a single file inside an already-committed change-group from its `before_content`. Does **not** affect the rest of the group and does **not** move undo/redo pointers — this is the small "↩ Revert" button next to a single diff block.
  - Returns `{ok: true}` or `{ok: false, error: "..."}`.

  `GET /api/code/history?code_session_id=...`
  - Returns the ordered list of change-groups for the session (id, prompt_text, file count, timestamp, size). Drives the optional history panel UI.

  `POST /api/code/history/clear`
  ```json
  { "code_session_id": "..." }   // omit code_session_id to clear all sessions
  ```
  - Deletes change-group folders, rewrites `index.json`, zeroes total bytes.

  `POST /api/code/history/limit`
  ```json
  { "limit_bytes": 1073741824 }
  ```
  - Sets `storage_limit_bytes` (persisted to a small `backend/code_history/config.json`). Triggers eviction immediately if the new limit is below current usage.

  **Default limit:** 1 GB (`1_073_741_824` bytes). Configurable from the Code Workspace settings panel (step 24a).

**12b.** Extend `ChatResponse` with Code Workspace fields (only populated when `workspace == "code"`):
  ```python
  # Existing fields unchanged. New optional fields:
  pending_tool_approval: Optional[Dict] = None
  # Shape: {call_id, tool_name, path_or_command, summary, warnings: list[str]}
  # Present when the loop is paused waiting for user approval.

  auto_executed: List[Dict] = []
  # List of read-only tool results from this turn that ran without approval.
  # Shape per entry: {tool_name, args, result_text}

  original_content: Optional[str] = None
  # Pre-edit file content for writeFile / deleteFile approvals.
  # Used by the frontend to render the diff client-side.

  new_content: Optional[str] = None
  # Post-edit file content (the LLM's writeFile / createFile content arg).
  # Returned alongside original_content so the frontend has both diff sides.

  change_id: Optional[str] = None
  # The in-flight change-group id for the current prompt's tool loop.
  # Returned once the group is committed (on the final assistant_text response).
  # Used by the frontend to tag diff blocks and revert buttons.

  next_undo_summary: Optional[str] = None
  # Prompt text of the most recent committed change-group (the one Undo would rewind).
  # null when the undo stack is empty. Drives the ↶ button tooltip and enabled state.

  next_redo_summary: Optional[str] = None
  # Prompt text of the top of the redo stack. null when empty.
  ```
  Both `next_undo_summary` and `next_redo_summary` are populated on **every** `ChatResponse` when `workspace == "code"` — including approve responses — so the toolbar always reflects current state without a separate fetch.

**13.** Add `GET /api/code/read?path=<path>` endpoint — returns raw file content (UTF-8). Used by the frontend for the revert confirmation refresh and other UI needs. **Not used to prepend file content to prompts** (see step 14).

**14.** Add a separate Code session pipeline. The Code Workspace does **not** share `session_id` with Chat:
  - `ChatRequest` accepts `code_session_id` when `workspace == "code"`. The backend uses this for the messages-history lookup and the pending-approvals queue.
  - Chat and Code sessions never see each other's message history.
  - YAML memory store and other cross-cutting context are still shared at the user level.

  **RAG exclusions for Code Workspace** — the existing pipeline embeds both user messages and assistant responses and stores them for future retrieval. In Code Workspace, tool results flowing through those strings (file contents, diffs, search snippets, command output) would poison the RAG index with large code blobs that match irrelevant future queries and eat context budget. Apply these rules when `workspace == "code"`:

  - **No RAG retrieval on code requests.** Skip the `active_store.search()` call entirely. The actual source files are the context; past chat history recalled via similarity search adds noise, not signal.
  - **Only store the bare user prompt and the final `assistant_text`** in the embedding store — not tool call arguments or tool results. Concretely: embed and store `request.text` as usual, but strip all tool-call content before embedding the assistant response (store only `spoken_text`, which is already the final conversational reply after `_parse_sections`).
  - **Never store messages whose content is predominantly code.** As a heuristic, if `spoken_text` is longer than ~800 characters and contains at least one code fence (` ``` `) or two or more lines starting with spaces/tabs (i.e. indented code), skip the embedding store entirely for that turn. The assistant's written explanation (short, human-readable) is worth storing; a paste of 200 lines of generated Python is not.
  - These rules apply to both `active_store.add_message()` calls (user and assistant) in the code-workspace branch of `/api/chat`.

---

## Phase 4 — Tool Approval UI & Log Rendering
**Goal:** Show approval prompts and execution results in the code log.

**15.** In `app.js`, add `sendCodeMessage(promptText)`:
  - **Does not prepend file contents.** Instead sends `pre_approved_read_paths: list[str]` = the currently-checked files in `codeSelectedFiles`. The backend uses this list later (Phase 5, step 23) to inform the system prompt.
  - Sends `POST /api/chat` with:
    - `workspace: "code"`
    - `code_session_id`
    - `workspace_dirs` (registered roots only — **not** the flat file list)
    - `pre_approved_read_paths`
    - `prevented_paths`
    - `hidden_paths`
    - `text: promptText` (raw, no prepended context)
  - **If `codePendingApproval` is non-null when the user submits**, show a confirm dialog: "You have a pending approval. Deny it and continue?" Yes → call `/api/code/approve` with `approved: false`, then send the new prompt. No → cancel send.
  - On response, calls `handleCodeResponse(response)`.

**16.** Add `handleCodeResponse(response)`:
  - `response.assistant_text` → append `.code-text-block` to log.
  - `response.pending_tool_approval` → set `codePendingApproval`, append `.code-approval-block` (step 17).
  - `response.tool_result` → append appropriate result block (diff, console, or info).
  - `response.auto_executed` (array of read-only tool results from this turn) → render each as a `.code-info-block`.
  - Scrolls log to bottom after each append.

**17.** Approval block layout (`renderApprovalBlock(pending)`):
  ```
  [ tool icon ]  writeFile                    [ pending badge ]
  src/app.py
  Reason: "Replace print() with logger.debug() call"
  [⚠ This command references a protected file: src/db.py]   ← only when warnings present
  [ ✓ Allow ]  [ ✕ Deny ]
  ```
  - Reason line shows `(no reason given)` when the model omitted `summary`.
  - Clicking "Allow" → POST `/api/code/approve` `{approved: true}` → calls `handleCodeResponse()` with result.
  - Clicking "Deny" → POST `/api/code/approve` `{approved: false}` → calls `handleCodeResponse()` with result.
  - After either click: replace the two buttons with a status badge ("Approved ✓" in teal or "Denied ✕" in red). Both buttons disabled immediately on first click to prevent double-submit.
  - Clear `codePendingApproval` once the click resolves; if the response carries another `pending_tool_approval` (next item in the queue), set it and render the new block.

**18.** After approved `writeFile`, `createFile`, or `deleteFile`:
  - Use `response.original_content` and `response.new_content` (both returned in the approve response) to compute a line-by-line diff client-side. For `deleteFile`, `new_content` is null — show all lines as deletions. For `createFile` on a new file, `original_content` is `""` — show all lines as additions.
  - Append `.code-diff-block` with `+` / `-` line colouring (green/red, monospace font).
  - The block is tagged with the in-flight `change_id` (returned on the final `ChatResponse` when the group commits) and the file path.
  - Show "↩ Revert" ghost button in the diff block header → POST `/api/code/revert` with `{code_session_id, change_id, path}` → refresh tree → append a small confirmation entry to the log. This reverts only this single file inside the change-group; it does not move the undo/redo pointers.
  - **Backend restart mid-approval:** if the user clicks Allow/Deny and the backend has no matching entry in `_pending_code_approvals` (e.g. server was restarted), the endpoint returns `{ok: false, error: "approval_expired"}`. The frontend catches this, replaces the Allow/Deny buttons with a `[Expired — backend restarted]` badge, and clears `codePendingApproval` so new prompts can be sent.

**19.** After approved `runCommand`:
  - Append `.code-console-block`:
    ```
    $ python -m pytest tests/              [exit: 0]
    ..................
    4 passed in 0.32s
    ```
  - `stderr` lines shown in muted red. Exit code shown as a small badge (green = 0, red = non-zero).

**20.** After auto-executed `readFile`, `findFiles`, `listDirectory`, or `searchInFile`:
  - Append a compact `.code-info-block` showing the tool name, path/query, and a summary line.
  - `readFile` summary: `readFile src/db.py [lines 30–60 of 412]` (or `[whole file, 412 lines]` when no range was requested). Body collapsed by default with a "Show content" toggle.
  - `findFiles` summary: `findFiles "*.py" in src/ → 5 files`.
  - `listDirectory` summary: `listDirectory src/ → 12 entries`.
  - `searchInFile` summary: `searchInFile "connect" in src/db.py → 3 matches`. Body shows each match with its 2-line before/after context window, monospace, with the matching line highlighted.

**20a.** Undo / Redo toolbar wiring:
  - Button state is driven by `next_undo_summary` / `next_redo_summary` on every `ChatResponse` (including approve responses) — no separate history fetch needed. On code-tab activation, fire a lightweight `POST /api/chat` with `text: null` and `workspace: "code"` just to get a `ChatResponse` and seed the button state, OR expose a `GET /api/code/undo-redo-state?code_session_id=...` that returns just those two fields.
  - `↶ Undo` button click → POST `/api/code/undo` → on success, refresh the file tree (modified files may have lost their change-dot, restored ones may regain it) and append a `.code-info-block` to the log: `↶ Undid: "<prompt_text>" (3 files restored)`.
  - `↷ Redo` button click → POST `/api/code/redo` → same flow, info block reads `↷ Redid: "<prompt_text>" (3 files re-applied)`.
  - Buttons disabled when their respective stacks are empty.
  - Keyboard shortcuts: `Ctrl+Z` and `Ctrl+Shift+Z` while the code log has focus, both trapped to prevent the browser's native undo on the composer textarea.

**20b.** History settings panel (opened by the ⚙ button on the file-tree footer):
  - Storage limit input (number, GB), default 1.0. Saving calls `POST /api/code/history/limit` and persists the same number to `localStorage['codeHistoryLimitBytes']` so the UI shows the value before the backend roundtrip on next load.
  - "Current usage" readout: `0.42 GB used of 1.00 GB` with a small progress bar.
  - "Clear history for this session" button → `POST /api/code/history/clear` with `code_session_id`.
  - "Clear all history" button (red, requires confirm) → `POST /api/code/history/clear` with no `code_session_id`.
  - **`runCommand` limits** (also in this panel):
    - "Command timeout" input (seconds), default 30. Persisted to `localStorage['codeRunTimeout']` and sent as `run_timeout_seconds` in `ChatRequest`.
    - "Max output size" input (KB), default 50. Persisted to `localStorage['codeRunOutputCap']` and sent as `run_output_cap_kb` in `ChatRequest`.
    - Backend enforces both: kills the subprocess after the timeout (returns `[Timed out after Ns]` as stderr) and truncates stdout+stderr to the cap, appending `[Output truncated at NKB]`.

---

## Phase 5 — Context & System Prompt Integration
**Goal:** Code tools are active, isolated to the Code Workspace, and the AI knows their signatures and guardrails.

**21.** When `request.workspace == "code"`, the tool list is **`TOOL_DEFINITIONS_BASE` + `CODE_TOOL_DEFINITIONS`**. The LLM has access to all base tools (web search, memory read/write, screenshot request, image generation) in addition to the 8 code-specific tools. The 8 code tools are **never added** in the Chat or Image workspaces — but base tools remain available everywhere as normal.

**22.** In `backend/app.py`, when `workspace == "code"`: append `CODE_TOOL_DEFINITIONS` to the tool list AND append `CODE_WORKSPACE_SYSTEM_PROMPT` after the base system prompt.

  `CODE_WORKSPACE_SYSTEM_PROMPT` (template — `{registered_dirs}` and `{pre_approved_paths}` filled per request):
  ```
  You are in Code Workspace mode. You have access to file and command tools for reading
  and editing the user's codebase, plus the full set of base tools.

  ── Code tools (run automatically, no `summary` needed) ──────────────────────────────
    readFile(path, start_line?, end_line?)
        — read a file's contents. Line numbers are 1-indexed and inclusive.
          Omit both for the whole file; pass start_line alone to read from there
          to EOF; pass end_line alone to read from line 1 to there.
    findFiles(pattern, directory) — find files matching a glob pattern
    listDirectory(directory)      — list files/folders accessible to you in a directory
    searchInFile(path, query)     — case-insensitive substring search; returns each
                                    match with 2 lines of context before and after.
                                    Use the line numbers to scope a follow-up readFile.

  ── Code tools (require user approval — `summary` field required) ────────────────────
    writeFile(path, content, summary)   — overwrite a file
    createFile(path, content, summary)  — create a new file
    deleteFile(path, summary)           — delete a file
    runCommand(command, cwd, summary)   — run a shell command inside the workspace

  ── Base tools (always available, use as normal) ─────────────────────────────────────
    webSearch
        — look up documentation, error messages, package APIs, Stack Overflow answers,
          or anything else you need to research before writing or modifying code.
          Prefer searching before guessing at an unfamiliar API.
    requestScreenshot
        — ask the user to capture a screenshot of the running application. Useful for
          diagnosing visual bugs, verifying UI changes, or inspecting runtime output
          that isn't reflected in the source files.
    generateImage
        — generate an image asset. Use when the user asks you to create placeholder
          graphics, icons, or other image files for the project.
    memoryStore(content)
        — store a durable fact (project conventions, architecture decisions, the user's
          preferred coding style) so you don't have to re-ask across sessions.
          Do NOT store file contents, code snippets, diffs, search results, or command
          output — only store human-readable facts and preferences.
    memoryEdit(id, content)
        — update an existing memory entry by its id.
    memoryDelete(id)
        — remove a memory entry that is no longer accurate.

  ── Workspace ────────────────────────────────────────────────────────────────────────
  Registered directories (only paths inside these are accessible to code tools):
  {registered_dirs}

  The user has pre-selected these files as relevant context — start by reading them
  if useful:
  {pre_approved_paths|fallback:(none selected — use listDirectory to explore)}

  Use listDirectory to discover other files. You will only ever receive paths that exist
  within the registered workspace directories.

  If you receive one of these error responses from a code tool, acknowledge and do not retry:
    [Out of scope]    — the path is not inside a registered workspace directory
    [Edit prevented]  — the user has protected that file from modification
    [Hidden]          — the file is not in your accessible tree
    [Denied by user]  — the user declined your action
  ```

**23.** `ChatRequest` additions for Code Workspace (`workspace == "code"`):
  - `code_session_id: str` — distinct from `session_id`; used for code-side history and approvals queue.
  - `workspace_dirs: list[str]` — registered root directories.
  - `pre_approved_read_paths: list[str]` — files the user has checked in the tree (rendered into the system prompt as a hint).
  - `prevented_paths: list[str]` — paths marked as Prevent Agent Edit.
  - `hidden_paths: list[str]` — paths marked Hide from LLM (used server-side to scrub `listDirectory` output and reject `readFile`).
  - **No flat `workspace_files` list** — the LLM discovers files via `listDirectory`. Server still validates every path is inside `workspace_dirs`.
  - Validation rules:
    - `readFile`, `writeFile`, `deleteFile`, `searchInFile` → path must resolve inside `workspace_dirs`
    - `createFile` → parent directory must resolve inside `workspace_dirs`
    - `findFiles`, `runCommand`, `listDirectory` → `directory`/`cwd` must resolve inside `workspace_dirs`

**24.** Connect Code Workspace mic button:
  - Hold → start Web Speech API recognition.
  - Release → stop recognition, populate composer input with transcript.
  - Matches existing mic logic from Chat Workspace.

---

## Relevant Files
- `frontend/index.html` — replace `#codeWorkspace` placeholder (lines 183–188); add Undo/Redo toolbar and ⚙ history settings button
- `frontend/app.js` — add code workspace state, `sendCodeMessage`, `handleCodeResponse`, tree rendering, approval UI, pending-approval confirm dialog, undo/redo wiring + Ctrl+Z keybindings, history settings panel; workspace tab init at line 3730
- `frontend/styles.css` — add all Code Workspace component styles (incl. undo/redo toolbar and history settings modal)
- `backend/app.py` — add `CODE_TOOL_DEFINITIONS`, ~10 new endpoints (pick-folder, files, read, approve, undo, redo, revert, history, history/clear, history/limit), approval queue, change-group history system + on-disk persistence + LRU eviction, path validation, code-session-id pipeline
- `backend/code_pick_folder.py` *(new)* — tiny standalone script invoked as a subprocess; runs `tkinter.filedialog.askdirectory()` and prints the chosen path
- `backend/code_history/` *(new directory)* — persistent on-disk change-group store; created lazily on first commit. Contains `index.json`, `config.json`, and one `<change_id>/` folder per change-group

---

## Verification Checklist
1. Switch to Code tab → full 3-panel layout renders (no placeholder text)
2. Click "Select Folder" → native folder picker opens (subprocess) → tree populates
3. "+ Add Dir" appears after first folder; click → second folder added to tree
4. Right-click top-level folder → "Remove from tree" removes it
5. Right-click file → "Prevent Agent Edit" → name greys out; AI `writeFile` on it returns `[Edit prevented]`
6. Right-click file → "Hide from LLM" → eye-slash shown; `listDirectory` server-side strips it; AI `readFile` on it returns `[Hidden]`
7. Type a prompt → "Run" → AI calls `readFile` and `listDirectory` → results auto-render as info blocks **without** approval prompts
7a. AI calls `readFile(path, 30, 60)` → info block header reads `[lines 30–60 of N]`; body shows only those lines
7b. AI calls `searchInFile(path, "connect")` → info block shows each match with 2 lines of before/after context, matching line highlighted
8. AI calls `writeFile` → approval block with reason appears → Allow → diff block shown using `original_content` from approve response → click ↩ Revert → file restored
9. AI calls `runCommand` referencing a Prevented path → approval block shows orange warning badge → Allow/Deny still works
10. AI returns multiple approval-required calls in one response → first approval block shown; after Allow/Deny the next one renders; loop only resumes after queue drains
11. Type a new prompt while an approval is pending → confirm dialog appears; "Yes" denies the pending call and sends the new prompt; "No" cancels send
12. AI omits `summary` on a writeFile call → approval block renders with `Reason: (no reason given)`
13. AI calls path outside `workspace_dirs` → `[Out of scope]` injected silently, no approval prompt
14. Switch back to Chat workspace → 8 code tools absent from tool list; code system prompt not included; chat history is independent of code history; base tools (web search, memory, screenshot, image gen) still present
15. Reload page → `codeSessionId`, `codeWorkspaceDirs`, `codeSelectedFiles`, `codePreventedPaths`, `codeHiddenPaths` all restored from localStorage; checked files are still checked after reload
15a. Add same workspace dir twice → second add silently ignored; tree shows only one entry
16. AI edits 3 files in one prompt → ↶ Undo button → all 3 files restored simultaneously to their pre-prompt state (no half-rewound state)
17. After Undo, ↷ Redo → all 3 files reapply to post-prompt state
18. After Undo, type a new prompt that edits files → Redo button becomes disabled (redo stack discarded on new edit)
19. Restart backend → undo history persists; ↶ Undo still works on prior change-groups
20. Set storage limit to 50 MB in settings → trigger several large edits → oldest change-groups evicted from disk; current usage stays under limit
21. Click "Clear all history" → confirm → `code_history/` is empty; ↶/↷ buttons disabled
22. AI calls `readFile` on a binary file → info block shows `[Skipped: file too large or binary]`
23. AI calls `runCommand` that runs longer than the configured timeout → console block shows `[Timed out after Ns]` in stderr
24. AI calls `runCommand` that produces output over the cap → console block shows output truncated with `[Output truncated at NKB]` notice
25. Backend is restarted mid-approval → clicking Allow/Deny shows `[Expired — backend restarted]` badge; new prompts can be sent immediately

---

## Key Decisions
- Read-only tools (`readFile`, `findFiles`, `listDirectory`, `searchInFile`) auto-execute inside the workspace; only writes, deletes, and `runCommand` require approval (4 of 8 tools).
- `readFile` accepts optional `start_line` / `end_line` (1-indexed, inclusive); either bound can be omitted independently. Out-of-range bounds clamp; a small `[lines X–Y of N in path]` header is prepended to every response.
- `searchInFile` returns each match with 2 lines of context before and after (ripgrep-style); adjacent windows are merged. Designed to give the LLM enough context to skip a follow-up `readFile` on most hits.
- Approvals queue when the LLM batches multiple write/delete/run calls in one response — drained one at a time before the loop resumes.
- Code Workspace runs on its own `code_session_id`, separate from Chat, with independent message history.
- The LLM is given `workspace_dirs` only (not a flat file list) and discovers files via `listDirectory`. Cheaper tokens; server validates every path.
- Pre-selected files in the tree are surfaced to the LLM as a "start here" hint in the system prompt — content is **not** prepended.
- `runCommand` approval blocks display a warning when the command string textually references a Prevent-Agent-Edit path, but the user still chooses Allow/Deny.
- `original_content` and `new_content` both ride back in the `/api/code/approve` response so the frontend has both diff sides without any extra fetch. `deleteFile` returns `new_content: null`; `createFile` on a new file returns `original_content: ""`.
- `next_undo_summary` / `next_redo_summary` are piggybacked on every `ChatResponse` (including approve responses) — no separate history fetch needed to keep toolbar state current.
- `runCommand` timeout and output cap are user-configurable in the settings panel (defaults: 30s, 50 KB); both sent as request fields and enforced server-side.
- `codeSelectedFiles` is persisted to localStorage alongside the other workspace state sets.
- Duplicate workspace directory adds are silently ignored client-side.
- Multiple writes to the same file within one tool loop record `before_content` only on the first write; subsequent writes update the op but preserve the original pre-loop state for undo.
- `readFile` and `searchInFile` both return `[Skipped: file too large or binary]` for binary files or files over 5 MB.
- `findFiles` scope-validates each matched result path (not just the `directory` arg) to prevent glob traversal outside the workspace.
- Backend restart mid-approval → frontend detects `approval_expired` error and replaces the pending block with an `[Expired]` badge.
- Missing `summary` is filled with `"(no reason given)"` rather than rejected — the user sees the absence and decides.
- New user prompt while approval is pending → confirm dialog; "Yes" auto-denies pending and continues.
- Undo/redo is **per change-group, not per file** — a change-group bundles all approved writes from a single user prompt's tool loop, so rewinding is atomic across files.
- Change-group history is persistent on disk under `backend/code_history/`, survives backend restarts.
- Storage budget is enforced **globally across all sessions** with LRU eviction of oldest change-groups (default 1 GB, user-configurable). Redo stacks count toward the budget.
- New edit after Undo discards the redo stack (standard editor behavior).
- The per-file ↩ Revert button (next to a diff block) reverts only that file inside its change-group and does **not** move undo/redo pointers.
- Approval state stored in-memory on backend (acceptable for single-user local app).
- Hidden files are enforced both client-side (filtered out of tree submissions where applicable) and server-side (scrubbed from `listDirectory`, rejected from `readFile`).
- Prevented files are enforced server-side via `prevented_paths` in the request.
- RAG retrieval is **skipped entirely** for Code Workspace requests — source files are the context, not past chat history. Only the bare user prompt and short conversational `assistant_text` are stored in the embedding index; tool results (file contents, diffs, search snippets, command output) are never embedded. Turns where `assistant_text` looks predominantly like generated code (long + contains code fences or indented blocks) are skipped from the store entirely.

## Excluded from v1
- "Always allow this file for the rest of this session" sticky approvals
- Syntax highlighting in diff blocks (plain monospace)
- Branching redo (alternate timelines preserved as a tree)
- Compression of stored snapshots (raw UTF-8 bytes for v1)
- File search / filter in the tree panel
- Streaming mid-response approval interruption
- Hard-blocking `runCommand` based on prevented-path substring matches (warn-only in v1)
- A history-browser panel that lets the user jump to an arbitrary change-group (v1 only exposes linear ↶/↷)
