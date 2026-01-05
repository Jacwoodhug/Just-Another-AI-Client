import io
import os
from typing import List

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    import soundfile as sf
except ImportError as exc:  # pragma: no cover - dependency guard
    raise RuntimeError("soundfile is required: pip install soundfile") from exc

try:
    from kokoro import KPipeline
except ImportError as exc:  # pragma: no cover - dependency guard
    raise RuntimeError("kokoro is required: pip install kokoro") from exc

SAMPLE_RATE = 24000
KOKORO_REPO_ID = os.getenv("KOKORO_REPO_ID", "hexgrad/Kokoro-82M")
KOKORO_LANG = os.getenv("KOKORO_LANG", "a")
KOKORO_DEVICE = os.getenv("KOKORO_DEVICE", "")
KOKORO_DEFAULT_VOICE = os.getenv("KOKORO_DEFAULT_VOICE", "af_heart")
KOKORO_VOICES = os.getenv("KOKORO_VOICES", "")

app = FastAPI(title="Kokoro TTS Service")
pipeline = KPipeline(
    lang_code=KOKORO_LANG,
    repo_id=KOKORO_REPO_ID,
    device=KOKORO_DEVICE or None,
)


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float | None = None


def _resolve_voice_list() -> List[str]:
    env_voices = [v.strip() for v in KOKORO_VOICES.split(",") if v.strip()]
    if env_voices:
        return env_voices
    try:
        from huggingface_hub import list_repo_files
    except Exception:
        return [KOKORO_DEFAULT_VOICE]

    try:
        files = list_repo_files(KOKORO_REPO_ID)
        voices = sorted(
            {
                os.path.splitext(os.path.basename(name))[0]
                for name in files
                if name.startswith("voices/") and name.endswith(".pt")
            }
        )
        return voices or [KOKORO_DEFAULT_VOICE]
    except Exception:
        return [KOKORO_DEFAULT_VOICE]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/voices")
def list_voices() -> dict:
    voices = _resolve_voice_list()
    default_voice = KOKORO_DEFAULT_VOICE
    if default_voice not in voices and voices:
        default_voice = voices[0]
    return {"voices": voices, "default_voice": default_voice}


@app.post("/tts")
def synthesize(request: TTSRequest) -> StreamingResponse:
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    voice = request.voice or KOKORO_DEFAULT_VOICE
    speed = request.speed or 1.0
    if speed <= 0:
        raise HTTPException(status_code=400, detail="Speed must be positive")

    segments = []
    for result in pipeline(text, voice=voice, speed=speed):
        audio = result.audio
        if audio is None:
            continue
        if hasattr(audio, "detach"):
            segments.append(audio.detach().cpu().numpy())
        else:
            segments.append(np.asarray(audio))

    if not segments:
        raise HTTPException(status_code=500, detail="No audio generated")

    combined = np.concatenate(segments).astype("float32", copy=False)
    buffer = io.BytesIO()
    sf.write(buffer, combined, SAMPLE_RATE, format="WAV")
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="audio/wav")
