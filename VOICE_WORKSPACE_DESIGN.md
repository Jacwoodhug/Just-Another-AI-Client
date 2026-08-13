# Voice Workspace: Local Continuous Voice

## Status

Design proposal. No runtime behavior changes are included in this document.

## 1. Goal

Add a new **Voice** workspace to JAAC that provides a continuous, interruptible local voice conversation. The initial release uses **MiniCPM-o 4.5 as the only model**: it receives live audio, understands the request, and returns text and speech.

The workspace is designed for **one active local session**, not multi-user serving. MiniCPM-o is the default voice-only path. RAG, web search, and a separate reasoning provider are optional capabilities behind an asynchronous delegation boundary; they are disabled by default and must never delay the live media path.

### Non-goals for the first release

- Recreating production GPT-Live features such as seamless instance handoff or multi-region scale.
- Supporting multiple simultaneous voice sessions.
- Running ComfyUI image generation concurrently with a live voice session.
- Persisting raw microphone audio by default.
- Replacing the current Chat workspace or its browser-Speech-API workflow.
- Requiring a second local LLM, search/RAG service, or cloud API in order to start or use a voice session.

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
| Live state | Partial transcript, speaker floor, current audio generation | Memory only; continually revised |
| Authoritative turns | Finalized user/assistant messages and timestamps | SQLite via the existing memory layer |

The current user transcript is provisional until voice activity and timing show a stable turn boundary. The UI may update it in place. Only finalized turns are sent to long-term memory and normal chat history. This prevents partial ASR revisions from polluting memory.

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

## 6. Voice cloning profiles

Voice Workspace supports MiniCPM-o reference-audio cloning as a separate setting from the Chat workspace's Chatterbox TTS provider. Both features use the existing project-level `chatter-voices/` folder as their shared, canonical voice library; audio files must not be copied into a second Voice-specific folder.

- The Voice settings surface presents the same selectable profile names as the Chatterbox voice setting, plus the existing upload, refresh, and delete management actions.
- `GET /api/voice/voice-profiles` returns the safe, filename-stem profile list from the shared library. The existing Chatterbox voice-management endpoints should be factored through a shared voice-library adapter so both UIs apply identical extension, path-safety, upload, and deletion rules.
- A Voice session holds its own `voice_profile` setting. It does not read or overwrite `ttsVoiceChatterbox`; changing a Voice profile must not change normal Chat/STTTS output.
- The selected file is supplied to MiniCPM-o as 16 kHz mono reference audio when a new model session is initialized. No selected profile uses MiniCPM-o's default voice.
- Profile changes apply at the next safe turn boundary. They cancel or complete the current response first, then reset only the MiniCPM-o session state needed to apply the new reference audio.
- Selecting or uploading a reference voice requires explicit consent. The UI shows the active cloning state and offers an immediate switch back to the default voice.

The reference clip is configuration input, not conversation recording. It follows the shared voice-library retention/deletion policy; raw microphone input remains disabled by default.

## 7. Optional delegation, RAG, and search

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

## 8. Transport and event protocol

### Transport choice

Use **WebRTC** for microphone capture and assistant playback. It handles real-time audio timing and is the appropriate transport if the workspace later moves beyond localhost. For a narrowly scoped feasibility spike, a binary WebSocket PCM stream is acceptable, but it is not the production interface.

WebRTC signaling and application events can use a regular WebSocket endpoint. A TURN server is unnecessary for localhost/LAN testing, but will be required for clients connecting from outside the local network.

### Control/event WebSocket

All events carry `session_id`, `seq`, and `generation_id`. Event types include:

- `session_ready`, `session_error`, `metrics`
- `transcript_partial`, `transcript_final`
- `assistant_text_partial`, `assistant_text_final`
- `voice_state` (`listening`, `thinking`, `speaking`, `interrupted`, `idle`)
- `research_started`, `research_result`, `research_failed`
- `cancel`, `stop_session`, `set_device`, `set_voice_profile`

Binary audio travels only through WebRTC media tracks, never through the JSON event channel.

## 9. Implementation in this repository

### New backend modules

```text
backend/
  voice_gateway.py          # FastAPI routes, WebRTC signaling, session registry
  voice_coordinator.py      # transcript state, optional delegation, cancellation, persistence
  voice_protocol.py         # Pydantic event/control schemas
  voice_library.py          # shared Chatterbox/MiniCPM-o profile discovery and safety rules
  voice_worker.py           # MiniCPM-o process supervisor and client
  reasoning_worker.py       # optional local/cloud reasoning and search queue
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
    VoiceStatus.jsx
    ResearchPanel.jsx       # hidden unless optional research is enabled
  hooks/useVoiceSession.js
  api/voice.js
```

Update `main.jsx` and the workspace navigation to register **Voice** as an independent workspace. The existing Chat workspace remains unchanged.

### Isolation and dependencies

MiniCPM-o has specific PyTorch/Transformers/audio dependencies. Create a dedicated `backend/.venv-minicpmo` and `backend/minicpmo-requirements.txt`; do not mix its pinned packages into the primary FastAPI or Kokoro environments. The model service loads MiniCPM-o once and is the only process allowed to own it.

MiniCPM-o's documented duplex mode uses a native Transformers/PyTorch session, so the initial service should use the vendor's supported Python interface rather than treating the model as a standard Ollama chat model. The project documents loading the model, enabling TTS, and converting it to duplex mode. See [MiniCPM-o 4.5 usage](https://github.com/openbmb/MiniCPM-V).

### Configuration

Add these environment variables and surface suitable settings in the UI later:

```dotenv
VOICE_ENABLED=true
VOICE_GATEWAY_PORT=8010
VOICE_MINICPMO_MODEL=openbmb/MiniCPM-o-4_5-AWQ
VOICE_GPU_MEMORY_GB=
VOICE_SAMPLE_RATE=16000
VOICE_REFERENCE_AUDIO_DIR=../chatter-voices
VOICE_DEFAULT_VOICE_PROFILE=
VOICE_DELEGATION_ENABLED=false
VOICE_SEARCH_ENABLED=false
VOICE_RAG_ENABLED=false
VOICE_REASONING_PROVIDER=none
VOICE_REASONING_MODEL=
VOICE_REASONING_MAX_TOKENS=600
VOICE_REASONING_TIMEOUT_S=20
VOICE_RESEARCH_DELIVERY=safe_boundary
VOICE_ALLOW_RAW_AUDIO_STORAGE=false
```

`VOICE_REFERENCE_AUDIO_DIR` defaults to the existing project-level `chatter-voices/` folder, and `VOICE_DEFAULT_VOICE_PROFILE` is optional. `VOICE_DELEGATION_ENABLED` is the master switch. `VOICE_REASONING_PROVIDER` supports `none`, `local`, or `cloud`; provider-specific credentials must continue to use the existing backend secret configuration rather than browser settings. `VOICE_SEARCH_ENABLED` and `VOICE_RAG_ENABLED` take effect only when delegation is enabled. Toggle changes apply to the next finalized user turn, never by interrupting active audio. `VOICE_GPU_MEMORY_GB` remains optional until its value is established by measurement. The ComfyUI supervisor must refuse to start, or unload itself, while a live voice session owns the GPU.

## 10. Latency and reliability targets

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

## 11. Security and privacy requirements

- Bind services to `127.0.0.1` by default; require explicit configuration before LAN exposure.
- Validate WebSocket origin and make session IDs unguessable.
- Do not store raw audio by default. Store finalized transcript only after the session policy permits it.
- Make recording state explicit in the UI and provide a Delete Session action that removes stored transcript/memory according to the chosen policy.
- Require an explicit consent acknowledgement before accepting a reference voice for cloning.
- Treat web-search snippets as untrusted input; keep them isolated from control prompts and apply existing tool/prompt-injection defenses.

## 12. Delivery phases and acceptance criteria

### Phase 0 — technical spike

**Scope:** Load MiniCPM-o int4 in an isolated process, send a microphone sample, receive generated audio, and record VRAM/latency.

**Acceptance:** The model can maintain one warm session on the 3090 without OOM, and measurements establish a viable baseline. No UI integration required.

### Phase 1 — local continuous voice MVP

**Scope:** Voice workspace, WebRTC loop, duplex service, live transcript, playback, stop, barge-in, and shared voice-library profile selection/cloning. Optional delegation controls exist but default to off; no reasoning/search provider is required to run the workspace.

**Acceptance:** A user can sustain a local spoken conversation, interrupt the assistant, and begin a new utterance without refreshing the browser. No raw audio is persisted.

### Phase 2 — delegated reasoning and search

**Scope:** Background job queue, trigger policy, existing SearxNG/Brave adapter, selectable local or cloud reasoning provider, source panel, freshness/cancellation controls. All capabilities remain independently toggleable.

**Acceptance:** A search request begins without blocking the media path; results appear with sources; interrupted/stale results never play aloud.

### Phase 3 — memory, resource coordination, and hardening

**Scope:** Final-turn persistence, conditional RAG, ComfyUI GPU lock/unload policy, reconnect behavior, metrics dashboard/logging, error states, cleanup.

**Acceptance:** The workspace survives model/service failure with a clear user state, maintains GPU headroom, and produces enough telemetry to evaluate p50/p95 latency.

## 13. Suggested agent decomposition

The implementation agent should create the integration contracts first, then assign these independent tasks. Each subagent must avoid editing shared integration files unless assigned that task.

| Workstream | Primary files | Dependency | Deliverable |
| --- | --- | --- | --- |
| Protocol/contracts | `voice_protocol.py`, API event documentation | None | Typed event schemas and fixture messages |
| Model spike/service | `services/minicpmo_service.py`, requirements/setup script | Protocol | Load/health/generate prototype and VRAM report |
| Backend coordinator | `voice_coordinator.py`, `reasoning_worker.py` | Protocol | Session state, cancellation, async result handling |
| Gateway/WebRTC | `voice_gateway.py` | Protocol, model service | Signaling and media transport |
| Frontend workspace | `VoiceWorkspace/*`, `useVoiceSession.js`, `api/voice.js` | Protocol | UI driven by mock event fixtures first |
| Resource/persistence integration | `app.py` adapters, voice-library settings, ComfyUI guard | Coordinator/model service | Router registration, shared voice profiles, and GPU ownership rules |
| Verification | test scripts/docs | All | Reproducible single-3090 smoke/latency test |

Recommended merge order: protocol -> model spike -> coordinator -> gateway/frontend in parallel -> application integration -> end-to-end verification.

## 14. Risks and decisions to confirm during Phase 0

1. **Duplex runtime maturity on Windows/3090:** validate the project's current supported dependency set before UI work.
2. **Real GPU headroom:** validate MiniCPM-o by itself before enabling a local reasoning model; compare the optional local path against a cloud-provider path later.
3. **Audio quality under barge-in:** confirm cancellation granularity and browser playback behavior with real microphone input.
4. **Reasoning cadence:** decide whether delayed research should interrupt with a follow-up, wait for a user pause, or be visible-only. Default: speak results only at a safe natural boundary.
5. **Remote access:** localhost first. Decide later whether TURN, authentication, HTTPS certificates, and multi-device support are required.
6. **Voice cloning quality and reset cost:** measure the reference-audio initialization time, output stability, and profile-switch behavior with the existing shared voice library.

## 15. Definition of done

The voice-only baseline is complete when one local user can start a voice session, select an existing Chatterbox-library voice profile or the default voice, converse continuously with MiniCPM-o, interrupt it reliably, and end the session without leaked model processes or GPU memory.

Optional research is complete when a user can enable delegation, independently enable RAG and/or web search, choose a local or cloud reasoning provider, receive a source-grounded result without an audio stall, see source cards, and verify that disabled capabilities make no provider calls.
