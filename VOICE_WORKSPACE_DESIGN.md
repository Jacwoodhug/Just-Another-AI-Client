# Voice Workspace: Local Continuous Voice

## Status

Product design and delivery plan. It defines the completed Voice Workspace and uses early phases only to validate technical assumptions before the full feature is delivered.

## 1. Goal

Add a new **Voice** workspace to JAAC that provides a continuous, interruptible local voice conversation. **MiniCPM-o 4.5** is the live conversational model: it receives live audio, understands the request, and returns text and speech. The completed feature also offers optional RAG, web search, and delegated reasoning through either a local model or a configured cloud provider.

The workspace is designed for **one active local session**, not multi-user serving. MiniCPM-o is always a usable voice-only path. RAG, web search, and a separate reasoning provider are optional capabilities behind an asynchronous delegation boundary; they must never delay the live media path.

### Final product boundaries

- Recreating production GPT-Live features such as seamless instance handoff, multi-region scale, or multi-tenant serving.
- Supporting multiple simultaneous voice sessions.
- Running ComfyUI image generation concurrently with a live voice session.
- Persisting raw microphone audio by default.
- Replacing the current Chat workspace or its browser-Speech-API workflow.
- Requiring a second local LLM, search/RAG service, or cloud API in order to start or use a voice session.

### Completed feature set

The finished workspace includes:

- Continuous local voice sessions with live partial/final transcript, barge-in, mute, stop, microphone and playback-device selection, reconnect handling, and clear service/error states.
- A dedicated Voice system prompt and selectable Voice personality/tone, independent from normal Chat/STTTS operational behavior.
- MiniCPM-o voice cloning profiles from the shared Chatterbox audio library, including consent, upload/manage/select/default controls, and safe profile switching.
- Per-session controls for research mode, search, RAG, source visibility, and result delivery; global provider setup and availability checks in Settings.
- A selectable local or cloud reasoning provider, with source-attributed research results, cancellation/freshness protection, and a history of research attached to the relevant final turns.
- Session history, transcript retention, memory controls, export, and deletion that make the privacy consequences visible and reversible.
- Local-first service management, GPU ownership coordination, metrics, diagnostic logs, and explicit recovery paths for model, network, or browser-media failures.

## 2. Model selection and hardware budget

Use **MiniCPM-o 4.5**, not MiniCPM-V. MiniCPM-V is a vision-language model; MiniCPM-o provides audio input, speech output, and the duplex interaction mode needed for this workspace.

### Initial model allocation

| Role | Initial model/runtime | Target allocation | Notes |
| --- | --- | ---: | --- |
| Live voice | MiniCPM-o 4.5 in a dedicated model process | Measure in Phase 0 | Owns audio input/output and low-latency session state. |
| CUDA headroom | KV cache, audio buffers, kernels, fragmentation | Measure in Phase 0 | Record it; do not assume a fixed allocation yet. |

Phase 0 will measure the actual MiniCPM-o runtime on the 3090. VRAM limits are not a design blocker for this implementation pass, but they must be recorded along with warm-session latency and stability. A separate local reasoning model is optional and remains disabled until its impact is measured; a cloud reasoning provider is also supported as a future configuration.

## 3. Architecture

The diagram shows the target architecture. In the default voice-only mode, the reasoning/search worker is not started and the coordinator does not dispatch jobs to it.

```text
 Browser / VoiceWorkspace
 ┌───────────────────────────────────────────────────────────┐
 │ WebRTC microphone + AudioWorklet playback                  │
 │ live transcript, source cards, stop/mute/device controls   │
 └─────────────────────┬─────────────────────────────────────┘
                       │ dedicated media path
                       ▼
 ┌───────────────────────────────────────────────────────────┐
 │ Voice gateway (FastAPI + WebRTC adapter)                   │
 │ - session lifecycle, auth/origin checks, event fan-out     │
 │ - no synchronous search/tool/RAG work                      │
 └──────────────┬──────────────────────────┬─────────────────┘
                │ audio frames             │ event stream
                ▼                          ▼
 ┌────────────────────────────┐  ┌──────────────────────────┐
 │ MiniCPM-o service           │  │ Session coordinator      │
 │ separate Python process     │  │ - transcript state       │
 │ - duplex model session      │  │ - delegation policy      │
 │ - VAD/barge-in              │  │ - cancellation/versioning│
 │ - output audio/text chunks  │  │ - persistence bridge     │
 └────────────────────────────┘  └───────────┬──────────────┘
                                              │ async only
                                              ▼
                                  ┌──────────────────────────┐
                                  │ Reasoning/search worker  │
                                  │ local LLM + Searx/Brave   │
                                  │ optional memory lookup    │
                                  └──────────────────────────┘
```

### Core rule: media is never blocked by application work

The media loop is a narrow, continuous path: browser audio -> gateway -> MiniCPM-o -> browser playback. It must not reuse the synchronous `/api/chat` handler or wait on embedding, search, tool, or second-model work. When optional delegation is enabled, it runs behind an asynchronous boundary and its result is injected only at a safe conversational boundary.

This follows the key architectural principle in OpenAI's continuous-voice write-up: separating media flow from delegation and application logic keeps a slow backend task from causing an audible pause. See [Continuous voice interaction with GPT-Live](https://openai.com/index/continuous-voice-interaction-with-gpt-live/).

## 4. Conversation model

Each session maintains two representations of the same conversation.

| Representation | Purpose | Persistence |
| --- | --- | --- |
| Live state | Partial transcript, speaker floor, current audio generation, pending research | Memory only; continually revised |
| Authoritative turns | Finalized user/assistant messages, research references, timestamps, and memory decisions | SQLite via the Voice session store |

The current user transcript is provisional until voice activity and timing show a stable turn boundary. The UI may update it in place. Only finalized turns are eligible for long-term memory. This prevents partial ASR revisions from polluting memory.

The final persistence model uses explicit, migration-managed records rather than overloading normal Chat history: `voice_sessions` (settings snapshot, lifecycle, retention state), `voice_turns` (final transcript and generation metadata), `voice_research_results` (provider, answer, citations, freshness/cancellation state), and `voice_memory_links` (candidate/accepted/rejected memory decisions). Voice history is separate from normal Chat by default; a future explicit sharing setting may expose selected finalized turns, never partial transcripts or raw audio.

### Barge-in and cancellation

When user speech is detected while the assistant is speaking:

1. Stop scheduled browser audio immediately.
2. Send `cancel_output` to the MiniCPM-o session.
3. Increment the session's `generation_id`.
4. Mark any later audio or transcript events from the old generation stale and discard them.
5. Continue accepting the user's audio without waiting for the previous generation to end.

## 5. Voice Workspace system prompt

Voice Workspace has a dedicated system prompt and must not reuse the normal Chat/STTTS prompt. In particular, it must not require `[SPOKEN]`/`[SILENT]` sections, ambient-social behavior, screenshot handling, browser TTS instructions, or direct web/memory/image tools.

The prompt builder, tentatively `build_voice_workspace_system_prompt()`, must direct MiniCPM-o to:

- Respond in plain, natural, concise speech with no Markdown, section markers, tool syntax, or private reasoning.
- Maintain a conversational turn, acknowledge interruptions naturally, and resume only in response to live session input.
- Treat MiniCPM-o as the default conversational model. It must not claim to have searched the web, used tools, or consulted memory unless the coordinator has supplied a completed, source-attributed result.
- Follow the selected Voice personality/tone profile when one is supplied, while keeping operational voice rules separate from that profile.
- Avoid unsolicited/ambient speech when the user is not addressing it.

When delegation is enabled, the coordinator supplies a clearly delimited, source-attributed research result. MiniCPM-o may express that result naturally, but must not invent pending or missing findings.

The coordinator treats all research text, RAG entries, and citations as data, never as system instructions. It injects a bounded `RESEARCH_RESULT` context block with source IDs; the Voice model receives no provider credentials, direct tool schema, or unchecked web content.

## 6. Voice cloning profiles

Voice Workspace supports MiniCPM-o reference-audio cloning as a separate setting from the Chat workspace's Chatterbox TTS provider. Both features use the existing project-level `chatter-voices/` folder as their shared, canonical voice library; audio files must not be copied into a second Voice-specific folder.

- The Voice settings surface presents the same selectable profile names as the Chatterbox voice setting, plus the existing upload, refresh, and delete management actions.
- `GET /api/voice/voice-profiles` returns the safe, filename-stem profile list from the shared library. The existing Chatterbox voice-management endpoints should be factored through a shared voice-library adapter so both UIs apply identical extension, path-safety, upload, and deletion rules.
- A Voice session holds its own `voice_profile` setting. It does not read or overwrite `ttsVoiceChatterbox`; changing a Voice profile must not change normal Chat/STTTS output.
- The selected file is supplied to MiniCPM-o as 16 kHz mono reference audio when a new model session is initialized. No selected profile uses MiniCPM-o's default voice.
- Profile changes apply at the next safe turn boundary. They cancel or complete the current response first, then reset only the MiniCPM-o session state needed to apply the new reference audio.
- Selecting or uploading a reference voice requires explicit consent. The UI shows the active cloning state and offers an immediate switch back to the default voice.

The reference clip is configuration input, not conversation recording. It follows the shared voice-library retention/deletion policy; raw microphone input remains disabled by default.

## 7. Voice Workspace experience and Settings

### Workspace controls

The Voice workspace is a complete session surface, not a reduced version of Chat. It contains:

- A primary start/end session control, microphone mute, immediate stop/interruption, input-device selector, output-device selector, and visible `listening`/`thinking`/`speaking`/`interrupted`/`offline` state.
- A continuously updated transcript where provisional text is visually distinct from final turns; users can copy a turn, correct a finalized transcript, and open session history.
- A compact active-profile indicator and a Voice Settings entry point. The selected clone profile and personality are visible without exposing reference audio paths.
- A research status chip and source panel. They are absent when research is disabled, show pending/cancelled state when enabled, and never obscure the live transcript or controls.
- Explicit session actions: New Session, End Session, Export Transcript, Delete Session, and Delete Session + Eligible Memories. Destructive actions describe exactly what will be removed before confirmation.

### User-facing Settings

Settings replace environment variables for routine user choices. The backend reads environment variables only as deployment defaults and for service/secret configuration; the Settings UI reads and writes a versioned `voiceSettings` object through the existing user-config API.

| Settings group | Final controls | Persistence and behavior |
| --- | --- | --- |
| Voice | Enabled, selected Voice personality, response brevity, input/output device, default clone profile, clone enabled, profile manager | User preference; active-session changes apply at the next safe boundary unless they are mute/stop/device actions. |
| Research | Research enabled, automatic versus manual delegation, web search, RAG, show source cards, result delivery (`safe_boundary`, `next_user_turn`, `visual_only`) | Per-user defaults with per-session overrides. Disabled controls result in no provider call. |
| Reasoning provider | Provider (`none`, `local`, `cloud`), local model, cloud model, timeout, answer-length limit, connection/status test | Provider selections are user settings; credentials and endpoint secrets remain server-side. Unavailable choices show a recoverable status rather than silently falling back. |
| Memory and privacy | Persist finalized transcript, allow memory candidates, auto-store memories, retention period, export format, delete-all Voice history | User preference; raw microphone storage remains off unless a future, separately consented feature adds it. |
| Advanced | Metrics visibility, diagnostics export, service restart, model preload/unload, LAN exposure status | Admin/local-machine actions require confirmation and never alter normal Chat settings. |

The persisted shape is versioned so future migrations are safe:

```json
{
  "schemaVersion": 1,
  "voiceSettings": {
    "personalityId": "default",
    "cloneEnabled": false,
    "defaultVoiceProfile": "",
    "research": {"enabled": false, "mode": "manual", "search": false, "rag": false, "delivery": "safe_boundary"},
    "reasoning": {"provider": "none", "model": "", "timeoutSeconds": 20, "maxTokens": 600},
    "privacy": {"persistTranscript": true, "allowMemoryCandidates": true, "autoStoreMemories": false}
  }
}
```

`voiceSettings` must remain independent from Chat's `ttsProvider`, `ttsVoiceChatterbox`, and ambient/social-mode settings. A malformed or older stored object is migrated to safe defaults and must not prevent a voice-only session from starting.

## 8. Optional delegation, RAG, and search

The voice model remains the conversational front end. The reasoning worker is an optional background specialist, not a second chatbot competing for the microphone. It may use a local model or a configured cloud provider.

### Trigger policy

Delegate when any of the following is true:

- The user explicitly asks to search, verify, compare current information, or cite sources.
- The request needs multi-step reasoning, calculation, code analysis, or a longer answer.
- The voice model flags uncertainty or receives a policy-defined information-sensitive question.
- A user asks about an attached image/video and a heavier analysis is worthwhile.

Do not delegate routine acknowledgements, short conversational turns, obvious follow-ups, or filler speech.

### Delegation lifecycle

1. Coordinator creates a job with `session_id`, `turn_id`, `generation_id`, a compact transcript window, and an explicit task.
2. The voice model may give a brief natural acknowledgement; it must not invent a result while research is pending.
3. The worker runs search first when needed, then uses the reasoning model with only the relevant snippets and conversation context.
4. The worker returns a concise, source-attributed `research_result` event.
5. Coordinator verifies job freshness and exposes source cards in the UI.
6. At a safe conversational boundary, coordinator injects a short factual update into the voice model's context. The voice model expresses it naturally.

### Worker output contract

```json
{
  "type": "research_result",
  "session_id": "...",
  "turn_id": "...",
  "generation_id": 12,
  "answer": "Concise answer grounded in the supplied sources.",
  "sources": [{"title": "...", "url": "...", "snippet": "..."}],
  "confidence": "high|medium|low",
  "follow_up_needed": false
}
```

### Toggle, provider, and failure behavior

The master Research toggle controls whether the coordinator may create jobs. Search and RAG are subordinate switches; turning either off removes it from the job plan. Manual mode delegates only after the user explicitly requests it. Automatic mode may use the trigger policy, but must visibly announce pending research and honor a per-session stop/cancel action.

Provider selection is explicit: `local` uses the configured local adapter, `cloud` uses an enabled server-side adapter, and `none` makes the research controls unavailable. A provider timeout, failed health check, invalid result, or cancelled job becomes a `research_failed`/`research_cancelled` event and a visible card; MiniCPM-o may briefly acknowledge the failure but must not fabricate an answer. The session remains usable in voice-only mode.

## 9. Transport and event protocol

### Transport choice

Use **WebRTC** for microphone capture and assistant playback. It handles real-time audio timing and is the appropriate transport if the workspace later moves beyond localhost. For a narrowly scoped feasibility spike, a binary WebSocket PCM stream is acceptable, but it is not the production interface.

WebRTC signaling and application events can use a regular WebSocket endpoint. A TURN server is unnecessary for localhost/LAN testing, but will be required for clients connecting from outside the local network.

### Control/event WebSocket

All events carry `session_id`, `seq`, and `generation_id`; `seq` is monotonically increasing per sender and the client discards duplicate or stale events. The initial `session_ready` contains the negotiated media format, effective settings snapshot, service capability flags, and available controls. Event types include:

- `session_ready`, `session_error`, `session_ended`, `metrics`
- `transcript_partial`, `transcript_final`
- `assistant_text_partial`, `assistant_text_final`
- `voice_state` (`listening`, `thinking`, `speaking`, `interrupted`, `idle`)
- `research_started`, `research_result`, `research_failed`, `research_cancelled`
- `voice_profile_changed`, `voice_profile_error`, `settings_applied`
- `cancel`, `stop_session`, `set_device`, `set_voice_profile`, `set_session_settings`, `delete_session`

Binary audio travels only through WebRTC media tracks, never through the JSON event channel. A reconnect first attempts to restore the control channel and reports the session state; it never replays stale assistant audio. If the media transport cannot recover, the UI ends the session cleanly, preserves finalized turns according to retention settings, and offers a new-session action.

## 10. Implementation in this repository

### New backend modules

```text
backend/
  voice_gateway.py          # FastAPI routes, WebRTC signaling, session registry
  voice_coordinator.py      # transcript state, optional delegation, cancellation, persistence
  voice_protocol.py         # Pydantic event/control schemas
  voice_library.py          # shared Chatterbox/MiniCPM-o profile discovery and safety rules
  voice_settings.py         # schema migration, effective-setting resolution, capability checks
  voice_store.py            # Voice-session/turn/research persistence and deletion/export
  voice_worker.py           # MiniCPM-o process supervisor and client
  reasoning_worker.py       # local/cloud provider adapters, search/RAG jobs, cancellation
  voice_metrics.py          # timestamp collection and reporting
  services/minicpmo_service.py  # dedicated model process; owns CUDA model instance
```

`backend/app.py` remains the application entrypoint. It mounts the voice router and reuses existing search, settings, and memory services through explicit adapters. Do not put the continuous media loop into the existing synchronous `/api/chat` handler.

### New frontend modules

```text
frontend/src/
  components/VoiceWorkspace/
    index.jsx
    VoiceWorkspace.css
    LiveTranscript.jsx
    VoiceControls.jsx
    VoiceProfileSettings.jsx
    VoiceSettingsModal.jsx
    SessionHistory.jsx
    PrivacyControls.jsx
    VoiceStatus.jsx
    ResearchPanel.jsx       # hidden unless optional research is enabled
  hooks/useVoiceSession.js
  api/voice.js
```

Update `main.jsx` and the workspace navigation to register **Voice** as an independent workspace. The existing Chat workspace remains unchanged.

### Isolation and dependencies

MiniCPM-o has specific PyTorch/Transformers/audio dependencies. Create a dedicated `backend/.venv-minicpmo` and `backend/minicpmo-requirements.txt`; do not mix its pinned packages into the primary FastAPI or Kokoro environments. The model service loads MiniCPM-o once and is the only process allowed to own it.

MiniCPM-o's documented duplex mode uses a native Transformers/PyTorch session, so the initial service should use the vendor's supported Python interface rather than treating the model as a standard Ollama chat model. The project documents loading the model, enabling TTS, and converting it to duplex mode. See [MiniCPM-o 4.5 usage](https://github.com/openbmb/MiniCPM-V).

### Deployment configuration

Environment variables configure machine deployment and safe service defaults. They are not the product's ordinary user settings:

```dotenv
VOICE_SERVICE_ENABLED=true
VOICE_GATEWAY_PORT=8010
VOICE_GATEWAY_HOST=127.0.0.1
VOICE_MINICPMO_MODEL=openbmb/MiniCPM-o-4_5-AWQ
VOICE_GPU_MEMORY_GB=
VOICE_SAMPLE_RATE=16000
VOICE_REFERENCE_AUDIO_DIR=../chatter-voices
VOICE_LOCAL_REASONING_BASE_URL=http://localhost:11434
VOICE_CLOUD_REASONING_ENABLED=false
VOICE_CLOUD_REASONING_PROVIDER=openrouter
VOICE_MAX_REASONING_TIMEOUT_S=60
VOICE_MAX_REASONING_TOKENS=1200
VOICE_ALLOW_RAW_AUDIO_STORAGE=false
```

`VOICE_REFERENCE_AUDIO_DIR` defaults to the existing project-level `chatter-voices/` folder. `VOICE_CLOUD_REASONING_ENABLED` is a server-side allow-list, not a stored credential. Cloud credentials use the existing backend secret configuration and are never sent to the browser. `VOICE_GPU_MEMORY_GB` remains optional until its value is established by measurement. The ComfyUI supervisor must refuse to start, or unload itself, while a live voice session owns the GPU.

## 11. Latency and reliability targets

Measure, do not assume. Instrument these timestamps for every turn:

- microphone packet received;
- VAD speech start/end;
- partial/final transcript;
- MiniCPM-o first text and first audio frame;
- browser first scheduled playback and audible-start estimate;
- delegation dispatched, search completed, reasoning completed;
- cancellation requested and cancellation acknowledged.

Initial targets for a warm, local, single-user session:

| Metric | Target |
| --- | ---: |
| Barge-in stops audible response | < 200 ms |
| Final user speech to first assistant audio, simple turn | p50 < 1.2 s; p95 < 2.0 s |
| Media dropouts during ordinary conversation | 0 |
| Enabled search/reasoning impact on first acknowledgement | 0 ms synchronous blocking |
| Voice model GPU memory | Record after warm-up; set a limit after Phase 0 |

The MiniCPM project reports roughly 11 GB for the int4 model and 19 GB for bf16, which supports the quantized single-3090 approach but is not a substitute for benchmark results in this application. [MiniCPM model zoo](https://github.com/openbmb/MiniCPM-V)

## 12. Security, privacy, and data governance

- Bind services to `127.0.0.1` by default; require explicit configuration before LAN exposure.
- Validate WebSocket origin and make session IDs unguessable.
- Do not store raw audio by default. Store finalized transcript only after the selected retention policy permits it; raw-audio storage cannot be enabled by a browser-only setting.
- Make recording, transcript retention, RAG, web-search, and cloud-provider state explicit before and during a session. Cloud delegation discloses the provider and sends only the bounded context required for that job.
- Provide session export and deletion. Delete Session removes its Voice session, turns, research results, and pending jobs; Delete Session + Eligible Memories additionally removes only memory entries created from that session after confirmation. Both actions report success or partial failure.
- Require an explicit, recorded consent acknowledgement before accepting or selecting a reference voice for cloning. A profile records its display name, filename stem, consent timestamp, and optional ownership note; it never exposes an absolute file path in the UI.
- Treat web-search snippets as untrusted input; keep them isolated from control prompts and apply existing tool/prompt-injection defenses.
- Redact provider credentials, reference-audio paths, and raw tool payloads from client events, transcript exports, and normal diagnostic logs. Diagnostics export requires a separate confirmation.

## 13. Delivery phases and acceptance criteria

### Phase 0 — technical spike

**Scope:** Load MiniCPM-o in an isolated process, apply a reference-audio profile, send a microphone sample, receive generated audio, and record model load, profile-apply, VRAM, and latency measurements. Define the minimal service health and capability API.

**Acceptance:** The service can start, report a truthful capability/error state, sustain one warm test session, switch back to the default voice, and produce a reproducible measurement report. No production UI integration is required.

### Phase 1 — local continuous voice MVP

**Scope:** A deliberately narrow end-to-end slice: Voice workspace tab, WebRTC loop, duplex service, live partial/final transcript, playback, stop, barge-in, default/profile voice selection, and final-turn persistence. Research remains unavailable in this phase.

**Acceptance:** A user can sustain a local spoken conversation, interrupt the assistant, change to an already-consented profile between turns, and begin a new utterance without refreshing the browser. No raw audio is persisted. This validates the media and model contracts; it is not the final product release.

### Phase 2 — delegated reasoning and search

**Scope:** Full workspace controls, Voice Settings modal, versioned settings migration, Voice personality selection, complete voice-profile manager, input/output device handling, reconnect/error states, session history, transcript correction/export/deletion, privacy controls, and metrics/diagnostics view. The dedicated Voice prompt builder is implemented and normal Chat/STTTS prompts remain unchanged.

**Acceptance:** Every listed user setting persists and has a visible effective state; Voice settings do not change Chat/STTTS behavior; all destructive/privacy actions have clear scope and work; the workspace is fully usable with the voice-only model.

### Phase 3 — memory, resource coordination, and hardening

**Scope:** Background job queue, manual/automatic delegation policy, existing SearxNG/Brave adapter, conditional RAG, selectable local/cloud reasoning adapters, capability/health checks, source panel, result-delivery choices, freshness/cancellation controls, and persisted research results.

**Acceptance:** A search or reasoning request never blocks initial voice acknowledgement; results include sources; interrupted/stale results never play; disabled controls make no provider calls; provider failure leaves a working voice-only conversation.

### Phase 4 — resource coordination, resilience, and release hardening

**Scope:** ComfyUI GPU ownership/unload policy, local-reasoner resource policy, model/service restart and cleanup, reconnect recovery, retention jobs, database migrations, accessibility and keyboard controls, cross-browser media checks, metrics dashboard, diagnostic export, and end-to-end automated smoke/latency tests.

**Acceptance:** The workspace survives model, provider, transport, and browser-device failure with an accurate user state and recovery action; no session leaks model processes or GPU ownership; deletion/retention operations are verified; p50/p95 telemetry is produced for voice-only and research-enabled modes.

## 14. Suggested agent decomposition

The implementation agent should create the integration contracts first, then assign these independent tasks. Each subagent must avoid editing shared integration files unless assigned that task.

| Workstream | Primary files | Dependency | Deliverable |
| --- | --- | --- | --- |
| Protocol/contracts | `voice_protocol.py`, API event documentation | None | Typed event schemas and fixture messages |
| Model spike/service | `services/minicpmo_service.py`, requirements/setup script | Protocol | Load/health/generate prototype and VRAM report |
| Backend coordinator | `voice_coordinator.py`, `reasoning_worker.py` | Protocol | Session state, cancellation, async result handling |
| Gateway/WebRTC | `voice_gateway.py` | Protocol, model service | Signaling and media transport |
| Frontend workspace | `VoiceWorkspace/*`, `useVoiceSession.js`, `api/voice.js` | Protocol | Session UI, settings, history, research, accessibility |
| Settings/persistence | `voice_settings.py`, `voice_store.py`, config adapters | Protocol | Migrations, effective settings, retention/export/deletion |
| Resource integration | `app.py` adapters, voice library, ComfyUI guard | Coordinator/model service | Router registration, shared voice profiles, and GPU ownership rules |
| Verification | test scripts/docs | All | Fixtures, integration tests, recovery and latency reports |

Recommended merge order: protocol -> model spike -> coordinator -> gateway/frontend in parallel -> application integration -> end-to-end verification.

## 15. Risks and decisions to confirm during Phase 0

1. **Duplex runtime maturity on Windows/3090:** validate the project's current supported dependency set before UI work.
2. **Real GPU headroom:** validate MiniCPM-o by itself before enabling a local reasoning model; compare the optional local path against a cloud-provider path later.
3. **Audio quality under barge-in:** confirm cancellation granularity and browser playback behavior with real microphone input.
4. **Reasoning cadence:** decide whether delayed research should interrupt with a follow-up, wait for a user pause, or be visible-only. Default: speak results only at a safe natural boundary.
5. **Remote access:** localhost first. Decide later whether TURN, authentication, HTTPS certificates, and multi-device support are required.
6. **Voice cloning quality and reset cost:** measure the reference-audio initialization time, output stability, and profile-switch behavior with the existing shared voice library.

## 16. Definition of done

The feature is complete when one local user can configure the Voice workspace entirely through Settings; start, manage, export, and delete voice sessions; choose a consented shared-library clone profile or the default voice; converse continuously with MiniCPM-o; interrupt it reliably; and recover from service/device failures without leaked processes, GPU ownership, or hidden data retention.

It is also complete when the user can independently enable research, search, RAG, and a local or allowed cloud reasoning provider; control when results are delivered; receive source-grounded results without an audio stall; inspect or delete the associated research data; and verify that disabled capabilities make no provider calls. Normal Chat/STTTS must remain behaviorally and configurationally independent throughout.
