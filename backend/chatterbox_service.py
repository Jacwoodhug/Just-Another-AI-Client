import asyncio
import io
import os
import struct
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "chatterbox", "src"))

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    import soundfile as sf
except ImportError as exc:  # pragma: no cover - dependency guard
    raise RuntimeError("soundfile is required: pip install soundfile") from exc

try:
    from chatterbox.tts import ChatterboxTTS
except ImportError as exc:  # pragma: no cover - dependency guard
    raise RuntimeError("chatterbox is required: pip install -e chatterbox/") from exc

CHATTERBOX_DEVICE = os.getenv("CHATTERBOX_DEVICE", "")
device = CHATTERBOX_DEVICE if CHATTERBOX_DEVICE else ("cuda" if torch.cuda.is_available() else "cpu")
model = ChatterboxTTS.from_pretrained(device=device)
SAMPLE_RATE = model.sr
CHATTER_VOICES_DIR = os.path.join(os.path.dirname(__file__), "..", "chatter-voices")
_AUDIO_EXTENSIONS = (".wav", ".mp3", ".ogg", ".flac", ".m4a")

# Single-worker executor + async lock so concurrent requests queue up
# instead of racing on the GPU.
_EXECUTOR = ThreadPoolExecutor(max_workers=1)
_TTS_LOCK: asyncio.Lock | None = None

app = FastAPI(title="Chatterbox TTS Service")


def _warmup() -> None:
    try:
        for _ in model.generate_stream(
            "Hello.",
            chunk_size=50,
            context_window=50,
            fade_duration=0.0,
            print_metrics=False,
        ):
            pass
    except Exception:
        pass


@app.on_event("startup")
async def _startup() -> None:
    global _TTS_LOCK
    _TTS_LOCK = asyncio.Lock()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_EXECUTOR, _warmup)


class TTSRequest(BaseModel):
    text: str
    exaggeration: float | None = None
    cfg_weight: float | None = None
    temperature: float | None = None
    audio_prompt_path: str | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/voices")
def voices() -> dict:
    results: list[str] = []
    if os.path.isdir(CHATTER_VOICES_DIR):
        for filename in sorted(os.listdir(CHATTER_VOICES_DIR)):
            stem, ext = os.path.splitext(filename)
            if ext.lower() in _AUDIO_EXTENSIONS:
                results.append(stem)
    return {"voices": results}


@app.post("/tts")
async def synthesize(request: TTSRequest) -> StreamingResponse:
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    exaggeration = request.exaggeration if request.exaggeration is not None else 0.5
    cfg_weight = request.cfg_weight if request.cfg_weight is not None else 0.5
    temperature = request.temperature if request.temperature is not None else 0.8

    def _generate() -> bytes:
        audio = model.generate(
            text,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
            temperature=temperature,
        )

        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        else:
            audio = np.asarray(audio)

        if audio.ndim > 1:
            audio = audio.squeeze()

        if audio.size == 0:
            raise ValueError("No audio generated")

        threshold = max(0.003, float(np.abs(audio).max()) * 0.01)
        nonsilent = np.where(np.abs(audio) > threshold)[0]
        if nonsilent.size > 0:
            tail = min(audio.size, int(nonsilent[-1]) + int(SAMPLE_RATE * 0.20))
            audio = audio[:tail]

        buf = io.BytesIO()
        sf.write(buf, audio, SAMPLE_RATE, format="WAV")
        return buf.getvalue()

    loop = asyncio.get_event_loop()
    async with _TTS_LOCK:
        try:
            wav_bytes = await loop.run_in_executor(_EXECUTOR, _generate)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return StreamingResponse(io.BytesIO(wav_bytes), media_type="audio/wav")


def _make_wav_header(sample_rate: int) -> bytes:
    """44-byte PCM WAV header with max-size placeholders for streaming."""
    byte_rate = sample_rate * 2  # mono, 16-bit
    return (
        b"RIFF" + struct.pack("<I", 0xFFFFFFF7)
        + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, byte_rate, 2, 16)
        + b"data" + struct.pack("<I", 0xFFFFFFFF)
    )


@app.post("/tts/stream")
async def synthesize_stream(request: TTSRequest) -> StreamingResponse:
    """Stream int16 PCM chunks inside a WAV container as they are generated.

    The first bytes sent are a 44-byte WAV header (sample-rate readable at
    offset 24).  All subsequent bytes are raw int16 little-endian PCM frames.
    The browser-side AudioContext reads these chunks and schedules them for
    gapless playback the moment the first chunk arrives.
    """
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    exaggeration = request.exaggeration if request.exaggeration is not None else 0.5
    cfg_weight = request.cfg_weight if request.cfg_weight is not None else 0.5
    temperature = request.temperature if request.temperature is not None else 0.8

    audio_prompt_path: str | None = None
    if request.audio_prompt_path:
        stem = request.audio_prompt_path
        for ext in _AUDIO_EXTENSIONS:
            candidate = os.path.join(CHATTER_VOICES_DIR, stem + ext)
            if os.path.isfile(candidate):
                audio_prompt_path = candidate
                break

    async def _stream():
        async with _TTS_LOCK:
            loop = asyncio.get_event_loop()
            q: asyncio.Queue = asyncio.Queue(maxsize=4)
            stop_flag = [False]

            def _worker() -> None:
                try:
                    asyncio.run_coroutine_threadsafe(q.put(_make_wav_header(SAMPLE_RATE)), loop).result()
                    for audio_chunk, _ in model.generate_stream(
                        text,
                        audio_prompt_path=audio_prompt_path,
                        exaggeration=exaggeration,
                        cfg_weight=cfg_weight,
                        temperature=temperature,
                        chunk_size=50,
                        context_window=50,
                        fade_duration=0.0,
                        print_metrics=False,
                    ):
                        if stop_flag[0]:
                            break
                        arr = (
                            audio_chunk.detach().cpu().numpy()
                            if hasattr(audio_chunk, "detach")
                            else np.asarray(audio_chunk)
                        )
                        if arr.ndim > 1:
                            arr = arr.squeeze()
                        pcm = (arr * 32767).clip(-32768, 32767).astype(np.int16).tobytes()
                        asyncio.run_coroutine_threadsafe(q.put(pcm), loop).result()
                except Exception as exc:
                    asyncio.run_coroutine_threadsafe(q.put(exc), loop).result()
                finally:
                    asyncio.run_coroutine_threadsafe(q.put(None), loop).result()

            t = threading.Thread(target=_worker, daemon=True)
            t.start()
            try:
                while True:
                    item = await q.get()
                    if item is None:
                        break
                    if isinstance(item, Exception):
                        raise HTTPException(status_code=500, detail=str(item))
                    yield item
            except GeneratorExit:
                stop_flag[0] = True

    return StreamingResponse(
        _stream(),
        media_type="audio/wav",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
