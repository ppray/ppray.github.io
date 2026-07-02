#!/usr/bin/env python3
"""
Generate compressed MP3 podcast episodes for the IPE question bank.

The script extracts the same IPE questions used by quiz.html from
quiz-questions.js, calls Xiaomi MiMo TTS for each card, and merges cards into
category-based podcast episodes.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from podcast_common import (  # noqa: E402
    ROOT,
    MIMO_ENDPOINT,
    STYLE,
    VOICE_DEFAULT,
    run,
    load_env_file,
    build_request,
    synthesize_wav,
    probe_duration,
    merge_wavs_to_mp3,
)


QUESTIONS_JS = ROOT / "quiz-questions.js"
OUT_DIR = ROOT / "podcasts" / "ipe"
CACHE_DIR = OUT_DIR / ".cache"
MANIFEST = OUT_DIR / "episodes.json"

VOICE = VOICE_DEFAULT
BITRATE = "40k"

# Quality gate: chars-per-second of synthesized speech. Normal Chinese TTS runs
# ~3.2-4.2 cps. A stalled/looping generation drags the audio out (cps far below
# the floor, e.g. 1.0); a truncated one is too short (cps above the ceiling).
# Either is the "断断续续/拖沓" defect we re-synthesize to fix.
QC_MIN_CPS = 2.6
QC_MAX_CPS = 7.0
QC_MAX_ATTEMPTS = 4


def load_ipe_questions() -> list[dict]:
    node_code = """
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('quiz-questions.js', 'utf8') + '\\nthis.questions = questions;';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const ipe = ctx.questions.filter(q => q.source && (
    q.source.includes('翟东升-货币金融') || q.source.includes('IPE-学术人物')
));
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
        "→": "，", "×": "乘以",
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
        ("scholar", "学术人物", 12),
    ]
    episodes: list[dict] = []
    for prefix, category, chunk_size in specs:
        items = [q for q in questions if q["category"] == category]
        for idx in range(0, len(items), chunk_size):
            chunk = items[idx : idx + chunk_size]
            ep_no = len(episodes) + 1
            start = idx + 1
            end = idx + len(chunk)
            label = "12位学术人物必背" if category == "学术人物" else f"{category}带背 第{idx // chunk_size + 1}集（{start}-{end}题）"
            title = f"国政经{label}"
            episodes.append({
                "episode": ep_no,
                "slug": f"ipe-{prefix}-{idx // chunk_size + 1:02d}",
                "title": title,
                "category": category,
                "questions": chunk,
            })
    return episodes


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
            req = build_request(endpoint, api_key, body, auth_mode=auth_mode)
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


def qc_check(text: str, path: Path) -> tuple[bool, float, float]:
    """Return (ok, duration_seconds, chars_per_second) for a synthesized card."""
    dur = probe_duration(path)
    if dur <= 0:
        return False, dur, 0.0
    cps = len(text) / dur
    return (QC_MIN_CPS <= cps <= QC_MAX_CPS), dur, cps


def tts_with_qc(text: str, wav: Path, *, api_key: str, voice: str, endpoint: str, auth_mode: str, label: str) -> None:
    """Synthesize a card and re-synthesize if it fails the chars-per-second gate.

    MiMo occasionally stalls and returns audio that is several times too long
    (the 断断续续 defect). That is not an API error, so the network-level retries
    in synthesize_wav never trigger; this gate catches it by duration.
    """
    last_dur = last_cps = 0.0
    for attempt in range(1, QC_MAX_ATTEMPTS + 1):
        synthesize_wav(text, wav, api_key=api_key, voice=voice, endpoint=endpoint, auth_mode=auth_mode)
        ok, last_dur, last_cps = qc_check(text, wav)
        if ok:
            if attempt > 1:
                print(f"    QC ok {label} on attempt {attempt} (cps={last_cps:.2f})")
            return
        print(f"    QC fail {label} dur={last_dur:.0f}s cps={last_cps:.2f} (attempt {attempt}/{QC_MAX_ATTEMPTS}) -> re-synthesize")
    print(f"    QC WARN {label} still off after {QC_MAX_ATTEMPTS} attempts (dur={last_dur:.0f}s cps={last_cps:.2f}); keeping best effort")


def concat_episode(episode: dict, card_wavs: list[Path], bitrate: str) -> dict:
    mp3, duration, size = merge_wavs_to_mp3(
        episode["slug"], card_wavs,
        out_dir=OUT_DIR, cache_dir=CACHE_DIR, bitrate=bitrate,
    )
    return {
        "title": episode["title"],
        "file": str(mp3.relative_to(ROOT)),
        "duration_seconds": round(duration),
        "size_bytes": size,
        "type": {"名词解释": "term", "简答题": "short", "论述题": "essay", "学术人物": "scholar"}[episode["category"]],
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
    # MIMO_TTS_KEY is the dedicated TTS credential (preferred); MIMO_KEY is a
    # general key that does NOT authorize the TTS endpoint (returns 401).
    api_key = os.environ.get("MIMO_TTS_KEY") or os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run:
        print("No TTS key set. Export MIMO_TTS_KEY (preferred) or MIMO_KEY.", file=sys.stderr)
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
            text = build_card_text(q, global_no)
            need = not wav.exists() or wav.stat().st_size < 1024
            if not need:
                ok, dur, cps = qc_check(text, wav)
                if not ok:
                    print(f"  cached-QC-fail {global_no:03d} {q['id']} dur={dur:.0f}s cps={cps:.2f} -> re-synthesize")
                    need = True
            if need:
                print(f"  TTS {global_no:03d} {q['id']} ({len(text)} chars)")
                tts_with_qc(
                    text,
                    wav,
                    api_key=api_key,
                    voice=args.voice,
                    endpoint=args.endpoint,
                    auth_mode=args.auth_mode,
                    label=q["id"],
                )
            else:
                print(f"  cached {global_no:03d} {q['id']} (cps ok)")
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
