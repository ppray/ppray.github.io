#!/usr/bin/env python3
"""
Generate compressed MP3 podcast episodes for the IPE question bank.

The script extracts the same IPE questions used by quiz.html from
quiz-questions.js, calls Xiaomi MiMo TTS for each card, and merges cards into
category-based podcast episodes.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_JS = ROOT / "quiz-questions.js"
OUT_DIR = ROOT / "podcasts" / "ipe"
CACHE_DIR = OUT_DIR / ".cache"
MANIFEST = OUT_DIR / "episodes.json"
MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions"

STYLE = "温柔专业的中文考试带背主播，语速适中，咬字清晰，停顿自然，适合通勤复习。"
VOICE = "茉莉"
BITRATE = "40k"


def run(cmd: list[str], *, input_text: str | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        input=input_text,
        text=True,
        cwd=ROOT,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_ipe_questions() -> list[dict]:
    node_code = """
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('quiz-questions.js', 'utf8') + '\\nthis.questions = questions;';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const ipe = ctx.questions.filter(q => q.source && q.source.includes('翟东升-货币金融'));
process.stdout.write(JSON.stringify(ipe));
"""
    proc = run(["node", "-e", node_code])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "failed to extract questions")
    return json.loads(proc.stdout)


def clean_for_speech(text: str) -> str:
    replacements = {
        "**": "",
        "【": "。", "】": "。",
        "\n": "。", "\r": "。",
        "→": "到", "×": "乘以",
        "（": "，", "）": "，",
        "(": "，", ")": "，",
        "de-coupling": "脱钩断链",
        "de-risking": "去风险化",
        "Power Law Distribution": "幂律分布",
        "Open Market Operations": "公开市场操作",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"。{2,}", "。", text)
    text = text.replace('"', "”")
    return text.strip()


def build_card_text(question: dict, number: int) -> str:
    parts = [
        f"第{number}题，{question['category']}。",
        f"题目：{question['question']}。",
        "请暂停思考两秒。",
        f"参考答案：{question['answer']}",
    ]
    if question.get("memorization"):
        parts.append(f"记忆要点：{question['memorization']}")
    return clean_for_speech("。".join(parts))


def episode_plan(questions: list[dict]) -> list[dict]:
    specs = [
        ("term", "名词解释", 20),
        ("short", "简答题", 15),
        ("essay", "论述题", 10),
    ]
    episodes: list[dict] = []
    for prefix, category, chunk_size in specs:
        items = [q for q in questions if q["category"] == category]
        for idx in range(0, len(items), chunk_size):
            chunk = items[idx : idx + chunk_size]
            ep_no = len(episodes) + 1
            start = idx + 1
            end = idx + len(chunk)
            title = f"国政经{category}带背 第{idx // chunk_size + 1}集（{start}-{end}题）"
            episodes.append({
                "episode": ep_no,
                "slug": f"ipe-{prefix}-{idx // chunk_size + 1:02d}",
                "title": title,
                "category": category,
                "questions": chunk,
            })
    return episodes


def build_request(endpoint: str, api_key: str, auth_mode: str, body: bytes) -> urllib.request.Request:
    headers = {"Content-Type": "application/json"}
    if auth_mode == "api-key":
        headers["api-key"] = api_key
    elif auth_mode == "bearer":
        headers["Authorization"] = f"Bearer {api_key}"
    else:
        raise ValueError(f"unknown auth mode: {auth_mode}")
    return urllib.request.Request(endpoint, data=body, headers=headers, method="POST")


def generate_mimo_wav(
    text: str,
    output: Path,
    *,
    api_key: str,
    voice: str,
    endpoint: str,
    auth_mode: str,
    retries: int = 5,
) -> None:
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": STYLE},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "wav", "voice": voice},
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = build_request(endpoint, api_key, auth_mode, body)

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            choice = data["choices"][0]
            if choice.get("finish_reason") == "content_filter":
                raise RuntimeError("MiMo content_filter")
            audio_b64 = choice["message"]["audio"]["data"]
            output.write_bytes(base64.b64decode(audio_b64))
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, KeyError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"MiMo TTS failed for {output.name}: {last_error}")


def probe_auth(api_key: str) -> int:
    endpoints = [
        "https://api.xiaomimimo.com/v1/chat/completions",
        "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
    ]
    auth_modes = ["api-key", "bearer"]
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": STYLE},
            {"role": "assistant", "content": "测试语音。"},
        ],
        "audio": {"format": "wav", "voice": VOICE},
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    for endpoint in endpoints:
        for auth_mode in auth_modes:
            req = build_request(endpoint, api_key, auth_mode, body)
            label = f"{endpoint} [{auth_mode}]"
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                ok = bool(data.get("choices", [{}])[0].get("message", {}).get("audio", {}).get("data"))
                print(f"OK   {label}" if ok else f"MISS {label}")
            except urllib.error.HTTPError as exc:
                print(f"FAIL {label}: HTTP {exc.code}")
            except Exception as exc:
                print(f"FAIL {label}: {type(exc).__name__}")
    return 0


def make_silence(path: Path, seconds: float) -> None:
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


def concat_episode(episode: dict, card_wavs: list[Path], bitrate: str) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    silence_short = CACHE_DIR / "silence_1_5s.wav"
    silence_long = CACHE_DIR / "silence_3s.wav"
    make_silence(silence_short, 1.5)
    make_silence(silence_long, 3)

    concat_file = CACHE_DIR / f"{episode['slug']}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for wav in card_wavs:
            f.write(f"file '{wav}'\n")
            f.write(f"file '{silence_short}'\n")
        f.write(f"file '{silence_long}'\n")

    mp3 = OUT_DIR / f"{episode['slug']}.mp3"
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
    return {
        "title": episode["title"],
        "file": str(mp3.relative_to(ROOT)),
        "duration_seconds": round(duration),
        "size_bytes": size,
        "type": {"名词解释": "term", "简答题": "short", "论述题": "essay"}[episode["category"]],
        "question_count": len(episode["questions"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default=VOICE)
    parser.add_argument("--bitrate", default=BITRATE)
    parser.add_argument("--endpoint", default=os.environ.get("MIMO_TTS_ENDPOINT", MIMO_ENDPOINT))
    parser.add_argument("--auth-mode", choices=["api-key", "bearer"], default=os.environ.get("MIMO_TTS_AUTH_MODE", "api-key"))
    parser.add_argument("--limit-episodes", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--probe-auth", action="store_true")
    args = parser.parse_args()

    load_env_file(Path.home() / ".hermes" / ".env")
    api_key = os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run:
        print("MIMO_KEY is not set. Add it to ~/.hermes/.env", file=sys.stderr)
        return 2
    if args.probe_auth:
        return probe_auth(api_key)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    questions = load_ipe_questions()
    episodes = episode_plan(questions)
    if args.limit_episodes:
        episodes = episodes[: args.limit_episodes]

    print(f"Loaded {len(questions)} IPE questions; planned {len(episodes)} episodes.")
    if args.dry_run:
        for ep in episodes:
            print(f"{ep['slug']}: {ep['title']} ({len(ep['questions'])} questions)")
        return 0

    manifest = []
    global_no = 1
    for ep in episodes:
        print(f"\n==> {ep['title']}")
        wavs = []
        for q in ep["questions"]:
            wav = CACHE_DIR / f"{q['id']}.wav"
            if not wav.exists() or wav.stat().st_size < 1024:
                text = build_card_text(q, global_no)
                print(f"  TTS {global_no:03d} {q['id']} ({len(text)} chars)")
                generate_mimo_wav(
                    text,
                    wav,
                    api_key=api_key,
                    voice=args.voice,
                    endpoint=args.endpoint,
                    auth_mode=args.auth_mode,
                )
            else:
                print(f"  cached {global_no:03d} {q['id']}")
            wavs.append(wav)
            global_no += 1
        info = concat_episode(ep, wavs, args.bitrate)
        print(f"  MP3 {info['file']} {info['duration_seconds']}s {info['size_bytes'] / 1024 / 1024:.2f}MB")
        manifest.append(info)

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
