#!/usr/bin/env python3
"""
Shared building blocks for the podcast-generation scripts.

Both generate_ipe_podcasts.py and generate_ipcs_mocks_podcasts.py turn a
question bank into category MP3 episodes via the same pipeline: MiMo TTS per
card → WAV cache → ffmpeg concat with silence padding → MP3 + ffprobe metadata.
Only the data-source parsing and episode planning differ between them; that
per-script logic stays in each script, while the reusable TTS client, ffmpeg
helpers, and env/subprocess plumbing live here.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions"

# Identical narration persona and voice across both channels.
STYLE = "温柔专业的中文考试带背主播，语速适中，咬字清晰，停顿自然，适合通勤复习。"
VOICE_DEFAULT = "茉莉"
TTS_MODEL = "mimo-v2.5-tts"


def run(cmd: list[str], *, input_text: str | None = None,
        timeout: int | None = None) -> subprocess.CompletedProcess:
    """Run a subprocess from the repo root, capturing text output (never raises)."""
    return subprocess.run(
        cmd,
        input=input_text,
        text=True,
        cwd=ROOT,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def load_env_file(path: Path, *, override: bool = False) -> None:
    """Load KEY=VALUE lines from a dotenv-style file into os.environ.

    override=False keeps any value already present in the environment
    (setdefault semantics); override=True lets the file win.
    """
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if override:
            os.environ[key] = value
        else:
            os.environ.setdefault(key, value)


def build_request(endpoint: str, api_key: str, body: bytes, *,
                  auth_mode: str = "api-key") -> urllib.request.Request:
    """Build the MiMo TTS POST request with the requested auth header style."""
    headers = {"Content-Type": "application/json"}
    if auth_mode == "api-key":
        headers["api-key"] = api_key
    elif auth_mode == "bearer":
        headers["Authorization"] = f"Bearer {api_key}"
    else:
        raise ValueError(f"unknown auth mode: {auth_mode}")
    return urllib.request.Request(endpoint, data=body, headers=headers, method="POST")


def synthesize_wav(
    text: str,
    output: Path,
    *,
    api_key: str,
    voice: str,
    endpoint: str,
    auth_mode: str = "api-key",
    timeout: int = 90,
    retries: int = 5,
    style: str = STYLE,
) -> None:
    """Call MiMo TTS for `text` and write the WAV to `output`.

    Retries on network / transient errors with linear backoff. A
    content_filter finish reason is treated as a retryable failure. Raises
    RuntimeError if every attempt fails.
    """
    payload = {
        "model": TTS_MODEL,
        "messages": [
            {"role": "user", "content": style},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "wav", "voice": voice},
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            req = build_request(endpoint, api_key, body, auth_mode=auth_mode)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            choice = data["choices"][0]
            if choice.get("finish_reason") == "content_filter":
                raise RuntimeError("MiMo content_filter")
            audio_b64 = choice["message"]["audio"]["data"]
            output.write_bytes(base64.b64decode(audio_b64))
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                OSError, KeyError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"MiMo TTS failed for {output.name}: {last_error}")


def make_silence(path: Path, seconds: float) -> None:
    """Render a mono 24kHz silence clip (cached: no-op if it already exists)."""
    if path.exists():
        return
    proc = run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", str(seconds),
        "-ar", "24000", "-ac", "1",
        str(path),
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)


def probe_duration(path: Path) -> float:
    """Return the media duration in seconds (0.0 if it cannot be read)."""
    probe = run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration", "-of", "csv=p=0", str(path),
    ])
    try:
        return float(probe.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0


def merge_wavs_to_mp3(
    slug: str,
    wavs: list[Path],
    *,
    out_dir: Path,
    cache_dir: Path,
    bitrate: str,
) -> tuple[Path, float, int]:
    """Concat WAV cards into one MP3, padding 1.5s between cards and 3s at the end.

    Returns (mp3_path, duration_seconds, size_bytes).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    silence_short = cache_dir / "silence_1_5s.wav"
    silence_long = cache_dir / "silence_3s.wav"
    make_silence(silence_short, 1.5)
    make_silence(silence_long, 3)

    concat_file = cache_dir / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for wav in wavs:
            f.write(f"file '{wav}'\n")
            f.write(f"file '{silence_short}'\n")
        f.write(f"file '{silence_long}'\n")

    mp3 = out_dir / f"{slug}.mp3"
    proc = run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-ar", "24000", "-ac", "1",
        "-codec:a", "libmp3lame", "-b:a", bitrate,
        str(mp3),
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)

    probe = run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration,size",
        "-of", "json", str(mp3),
    ])
    meta = json.loads(probe.stdout) if probe.returncode == 0 else {"format": {}}
    duration = float(meta.get("format", {}).get("duration", 0) or 0)
    size = int(meta.get("format", {}).get("size", mp3.stat().st_size) or mp3.stat().st_size)
    return mp3, duration, size
