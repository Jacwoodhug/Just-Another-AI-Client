# Chatterbox TTS — Integration Guide

Chatterbox is an open-source, zero-shot TTS model (0.5B Llama backbone) integrated into this project as a managed background service alongside Kokoro TTS.

---

## Setup

The service uses the virtual environment at `chatterbox/.venv`. Dependencies (`fastapi`, `uvicorn`, `soundfile`) are already installed there.

If you ever need to reinstall:

```powershell
& "chatterbox\.venv\Scripts\pip.exe" install -e "chatterbox" fastapi uvicorn soundfile
```

---

## Starting the Service

### Via the UI
1. Open **Settings → Services**
2. Find the **Chatterbox TTS** card
3. Click **Launch** — the status dot turns green when ready

### Manually (for debugging)
```powershell
& "chatterbox\.venv\Scripts\python.exe" -m uvicorn chatterbox_service:app --host 0.0.0.0 --port 5006
```
Run this from the `backend/` directory.

---

## Using Chatterbox for TTS

1. Open **Settings → Voice**
2. Under **TTS Provider**, select **Chatterbox**
3. Adjust the sliders to taste:
   - **Exaggeration** — emotional intensity (default `0.5`; raise to `0.7+` for drama)
   - **CFG Weight** — pacing control (default `0.5`; lower to `0.3` for fast-speaking voices or when exaggeration is high)
   - **Temperature** — variability/randomness (default `0.8`)
4. Click **Test voice** to preview

---

## Parameter Tips

| Goal | Exaggeration | CFG Weight |
|------|-------------|------------|
| Natural everyday speech | 0.5 | 0.5 |
| Fast reference speaker | 0.5 | 0.3 |
| Expressive / dramatic | 0.7–1.0 | 0.3 |
| Calm, measured delivery | 0.3 | 0.6 |

---

## Service Endpoints

The service runs on `http://localhost:5006`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status": "ok"}` when ready |
| `POST` | `/tts` | Generate speech (JSON body, returns WAV) |

### `/tts` request body

```json
{
  "text": "Hello world",
  "exaggeration": 0.5,
  "cfg_weight": 0.5,
  "temperature": 0.8
}
```

All fields except `text` are optional and fall back to the defaults above.

The main backend proxies these through `GET /api/chatterbox/tts?text=...&exaggeration=...&cfg_weight=...&temperature=...`.

---

## Troubleshooting

**Status shows "Unavailable"** — `chatterbox/.venv/Scripts/python.exe` was not found. Check the venv exists.

**Service won't start within 30 seconds** — The model download on first run can be slow. Try launching manually (see above) and wait for it to print `Application startup complete` before using the UI.

**Audio sounds rushed** — Lower `cfg_weight` to `0.3`.

**No audio / errors in console** — Ensure the Chatterbox service is running (green dot in Services) before switching the TTS provider.
