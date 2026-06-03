#!/usr/bin/env python3
"""
Generate per-mock-set MP3 podcasts for《国际与比较政治经济学研究》mock answers.

Source: 国关复习/《国际与比较政治经济学研究》模拟卷答案.html (markdown embedded
as JSON in a <script id="md-source"> block). Each of the 15 mock sets becomes
one MP3 episode of 10 questions (5 名词 + 3 简答 + 2 论述). Unique questions are
TTS'd once and cached so cross-set overlap costs nothing extra.
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
SRC_HTML = ROOT / "国关复习" / "《国际与比较政治经济学研究》模拟卷答案.html"
OUT_DIR = ROOT / "podcasts" / "ipcs-mocks"
CACHE_DIR = OUT_DIR / ".cache"
MANIFEST = OUT_DIR / "episodes.json"
MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions"

STYLE = "温柔专业的中文考试带背主播，语速适中，咬字清晰，停顿自然，适合通勤复习。"
VOICE = "茉莉"
BITRATE = "32k"


def run(cmd: list[str], *, timeout: int | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, text=True, cwd=ROOT, capture_output=True,
                          timeout=timeout, check=False)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip().strip('"').strip("'")


def extract_markdown(path: Path) -> str:
    html = path.read_text(encoding="utf-8")
    m = re.search(r'<script id="md-source" type="application/json">([\s\S]*?)</script>', html)
    if not m:
        raise RuntimeError("md-source block not found")
    return json.loads(m.group(1))


def parse_part_i(text: str) -> dict[int, dict]:
    result: dict[int, dict] = {}
    pat = re.compile(r'\n\*\*(\d+)\.\s+(.+?)\*\*(?:【[^】]*】)?\n')
    matches = list(pat.finditer(text))
    for i, m in enumerate(matches):
        n = int(m.group(1))
        title = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        body = re.split(r'\n###\s', body)[0].strip()
        result[n] = {"title": title, "body": body}
    return result


def parse_numbered_headings(text: str) -> dict[int, dict]:
    result: dict[int, dict] = {}
    pat = re.compile(r'\n### (\d+)\.\s+(.+?)\n')
    matches = list(pat.finditer(text))
    for i, m in enumerate(matches):
        n = int(m.group(1))
        title = re.sub(r'【[^】]*】', '', m.group(2)).strip()
        title = re.sub(r'^简述\s*', '', title)
        title = re.sub(r'^论述\s*', '', title)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        result[n] = {"title": title, "body": body}
    return result


def parse_part_iv(text: str) -> list[dict]:
    sets: list[dict] = []
    pat = re.compile(r'### 模拟卷 (\d+)\n')
    matches = list(pat.finditer(text))
    type_map = {"I": "term", "II": "short", "III": "essay"}
    for i, m in enumerate(matches):
        n = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end]
        rows: list[dict] = []
        for line in block.split("\n"):
            line = line.strip()
            if not line.startswith("|") or "---" in line or "题型" in line:
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 3:
                continue
            qtype, qtitle, loc = cells[0], cells[1], cells[2]
            ref = re.search(r'Part\s+(I{1,3})\s*§\s*(\d+)', loc)
            if not ref:
                continue
            rows.append({
                "qtype": qtype,
                "title": qtitle,
                "part": type_map[ref.group(1)],
                "num": int(ref.group(2)),
            })
        if rows:
            sets.append({"set": n, "items": rows})
    return sets


def parse_sections(md: str) -> tuple[dict, dict, dict, list]:
    bnd = {tag: md.find(f"## {tag} ") for tag in ("Part I", "Part II", "Part III", "Part IV")}
    for tag, idx in bnd.items():
        if idx < 0:
            raise RuntimeError(f"missing section: {tag}")
    return (
        parse_part_i(md[bnd["Part I"]:bnd["Part II"]]),
        parse_numbered_headings(md[bnd["Part II"]:bnd["Part III"]]),
        parse_numbered_headings(md[bnd["Part III"]:bnd["Part IV"]]),
        parse_part_iv(md[bnd["Part IV"]:]),
    )


def clean_for_speech(text: str) -> str:
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    text = text.replace('（', '，').replace('）', '，')
    text = text.replace('(', '，').replace(')', '，')
    text = text.replace('【', '，').replace('】', '，')
    text = text.replace('“', '"').replace('”', '"').replace('"', '')
    text = text.replace('→', '到').replace('×', '乘以').replace('—', '到')
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n+', '。', text)
    text = re.sub(r'。{2,}', '。', text)
    text = re.sub(r'，{2,}', '，', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def build_card(item: dict, qmap: dict, number: int) -> str:
    q = qmap[item["part"]][item["num"]]
    label = {"term": "名词解释", "short": "简答题", "essay": "论述题"}[item["part"]]
    parts = [
        f"第{number}题，{label}：{q['title']}。",
        "请暂停思考三秒。",
        f"参考答案：{q['body']}",
    ]
    return clean_for_speech("\n".join(parts))


def build_intro(set_no: int, items: list[dict]) -> str:
    counts: dict[str, int] = {}
    for it in items:
        counts[it["qtype"]] = counts.get(it["qtype"], 0) + 1
    bits = [f"{q}{counts[q]}题" for q in ("名词", "简答", "论述") if q in counts]
    return clean_for_speech(
        f"《国际与比较政治经济学研究》模拟卷第{set_no}集，共{len(items)}题，"
        f"{'，'.join(bits)}。开始。"
    )


def build_outro(set_no: int) -> str:
    return clean_for_speech(f"第{set_no}集结束。")


def build_request(endpoint: str, api_key: str, body: bytes) -> urllib.request.Request:
    return urllib.request.Request(
        endpoint, data=body, method="POST",
        headers={"Content-Type": "application/json", "api-key": api_key},
    )


def tts(text: str, output: Path, *, api_key: str, voice: str, endpoint: str,
        retries: int = 5) -> None:
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": STYLE},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "wav", "voice": voice},
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = build_request(endpoint, api_key, body)
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            choice = data["choices"][0]
            if choice.get("finish_reason") == "content_filter":
                raise RuntimeError("content_filter")
            output.write_bytes(base64.b64decode(choice["message"]["audio"]["data"]))
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError,
                KeyError, RuntimeError, json.JSONDecodeError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"TTS failed for {output.name}: {last}")


def make_silence(path: Path, seconds: float) -> None:
    if path.exists():
        return
    proc = run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", str(seconds), "-ar", "24000", "-ac", "1", str(path),
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)


def concat_episode(slug: str, wavs: list[Path], bitrate: str) -> tuple[Path, float, int]:
    silence_short = CACHE_DIR / "silence_1_5s.wav"
    silence_long = CACHE_DIR / "silence_3s.wav"
    make_silence(silence_short, 1.5)
    make_silence(silence_long, 3)
    concat_file = CACHE_DIR / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for w in wavs:
            f.write(f"file '{w}'\n")
            f.write(f"file '{silence_short}'\n")
        f.write(f"file '{silence_long}'\n")
    mp3 = OUT_DIR / f"{slug}.mp3"
    proc = run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-ar", "24000", "-ac", "1",
        "-codec:a", "libmp3lame", "-b:a", bitrate,
        str(mp3),
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)
    probe = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration,size",
        "-of", "json", str(mp3),
    ])
    meta = json.loads(probe.stdout) if probe.returncode == 0 else {"format": {}}
    duration = float(meta.get("format", {}).get("duration", 0) or 0)
    size = int(meta.get("format", {}).get("size", mp3.stat().st_size) or mp3.stat().st_size)
    return mp3, duration, size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=VOICE)
    ap.add_argument("--bitrate", default=BITRATE)
    ap.add_argument("--endpoint", default=os.environ.get("MIMO_TTS_ENDPOINT", MIMO_ENDPOINT))
    ap.add_argument("--limit-sets", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_env_file(Path.home() / ".hermes" / ".env")
    api_key = os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run:
        print("MIMO_KEY not set; add to ~/.hermes/.env", file=sys.stderr)
        return 2

    md = extract_markdown(SRC_HTML)
    terms, shorts, essays, sets = parse_sections(md)
    qmap = {"term": terms, "short": shorts, "essay": essays}

    unique: set[tuple[str, int]] = set()
    for s in sets:
        for it in s["items"]:
            unique.add((it["part"], it["num"]))
    print(f"Parsed: {len(terms)} terms / {len(shorts)} shorts / {len(essays)} essays / "
          f"{len(sets)} sets, {len(unique)} unique TTS calls.")

    # Validate: every reference resolves
    missing = []
    for s in sets:
        for it in s["items"]:
            if it["num"] not in qmap[it["part"]]:
                missing.append((s["set"], it["part"], it["num"], it["title"]))
    if missing:
        print("MISSING REFERENCES:", file=sys.stderr)
        for m in missing:
            print(f"  set {m[0]}: {m[1]} §{m[2]} — {m[3]}", file=sys.stderr)
        return 3

    if args.limit_sets:
        sets = sets[:args.limit_sets]

    if args.dry_run:
        for s in sets:
            print(f"\n== 模拟卷 {s['set']} ({len(s['items'])} 题) ==")
            for i, it in enumerate(s["items"], 1):
                q = qmap[it["part"]][it["num"]]
                print(f"  {i:>2}. [{it['qtype']}] {it['part']}-{it['num']:>2} "
                      f"{q['title']} ({len(q['body'])}字)")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for s in sets:
        slug = f"ipcs-mock-{s['set']:02d}"
        print(f"\n==> 模拟卷 {s['set']} ({len(s['items'])} 题)")

        intro_wav = CACHE_DIR / f"{slug}-intro.wav"
        if not intro_wav.exists() or intro_wav.stat().st_size < 1024:
            text = build_intro(s["set"], s["items"])
            print(f"  TTS intro ({len(text)} chars)")
            tts(text, intro_wav, api_key=api_key, voice=args.voice, endpoint=args.endpoint)

        wavs = [intro_wav]
        for i, it in enumerate(s["items"], 1):
            qid = f"{it['part']}-{it['num']:03d}"
            wav = CACHE_DIR / f"{qid}.wav"
            if not wav.exists() or wav.stat().st_size < 1024:
                text = build_card(it, qmap, i)
                print(f"  TTS {i:02d} {qid} ({len(text)} chars)")
                tts(text, wav, api_key=api_key, voice=args.voice, endpoint=args.endpoint)
            else:
                print(f"  cached {i:02d} {qid}")
            wavs.append(wav)

        outro_wav = CACHE_DIR / f"{slug}-outro.wav"
        if not outro_wav.exists() or outro_wav.stat().st_size < 1024:
            text = build_outro(s["set"])
            tts(text, outro_wav, api_key=api_key, voice=args.voice, endpoint=args.endpoint)
        wavs.append(outro_wav)

        mp3, dur, sz = concat_episode(slug, wavs, args.bitrate)
        print(f"  MP3 {mp3.name} {dur:.0f}s {sz / 1024 / 1024:.2f}MB")

        manifest.append({
            "set": s["set"],
            "slug": slug,
            "title": f"《国际与比较政治经济学研究》模拟卷 {s['set']:02d}",
            "file": str(mp3.relative_to(ROOT)),
            "duration_seconds": round(dur),
            "size_bytes": sz,
            "question_count": len(s["items"]),
            "type_counts": {q: sum(1 for it in s["items"] if it["qtype"] == q)
                            for q in ("名词", "简答", "论述")},
        })

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
