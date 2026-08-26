#!/usr/bin/env python3
"""
Generate one compact MP3 per question (103 total) for the MFIPE review notes.

Pipeline mirrors generate_ipe_podcasts.py but keyed to the review-note page:
extract questions from the <script type="text/markdown" id="md-source"> block
embedded in the HTML (same source the page renders, so index order always
matches the DOM h4 order the player buttons bind to) → MiMo TTS per question
→ WAV cache → ffmpeg compress to mono MP3 → manifest.json (committed; the MP3s
themselves are gitignored and uploaded to the podcast-audio GitHub Release,
same convention as podcasts/*).
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from podcast_common import (  # noqa: E402
    ROOT,
    load_env_file,
    probe_duration,
    run,
    synthesize_wav,
)

NOTE_HTML = ROOT / "国关复习" / "翟东升《货币与金融的国际政治经济学》复习笔记.html"
OUT_DIR = ROOT / "podcasts" / "mfipe-qa"
CACHE_DIR = OUT_DIR / ".cache"          # covered by existing gitignore rule
MANIFEST = OUT_DIR / "manifest.json"

VOICE = "茉莉"
BITRATE = "40k"   # same compressed-speech setting as the podcast episodes
SAMPLE_RATE = "24000"
TYPE_FULL = {"名": "名词解释", "简": "简答题", "论": "论述题"}

MAX_BODY_CHARS = 2400   # hard cap per-question narration body

# Same quality gate as the episode pipeline: chars-per-second bounds catch
# stalled/looping (拖沓) or truncated generations.
QC_MIN_CPS = 2.6
QC_MAX_CPS = 7.0
QC_MAX_ATTEMPTS = 4


# ---------------------------------------------------------------- extraction

MD_BLOCK_RE = re.compile(
    r'<script type="text/markdown" id="md-source">\n(.*?)\n</script>', re.S)
QUESTION_RE = re.compile(r"^####\s+\*{0,2}(\d+)\.\s*\[(名|简|论)\]\s*(.+?)\*{0,2}\s*$")
TOPIC_RE = re.compile(r"^##\s+(.*)$")
HEADING_RE = re.compile(r"^#{2,5}\s+")


def strip_anchor(text: str) -> str:
    return re.sub(r'<a\s+id="[^"]*">\s*</a>\s*', "", text)


EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F900-\U0001F9FF"
    "\U00002B00-\U00002BFF\U0000FE00-\U0000FE0F\U0000200D✔✅❌⭐️]")


def clean_for_speech(md_fragment: str) -> str:
    """Markdown fragment → plain narration text."""
    text = md_fragment
    # figures/SVG/comments cannot be narrated
    text = re.sub(r"<figure[\s\S]*?</figure>", " ", text)
    text = re.sub(r"<svg[\s\S]*?</svg>", " ", text)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)

    out_lines = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            out_lines.append("")
            continue
        stripped = line.strip()
        # separator rows of tables / horizontal rules dropped
        if re.fullmatch(r"\|?[\s:|-]+\|?", stripped) and "-" in stripped:
            continue
        if re.fullmatch(r"-{3,}", stripped):
            continue
        # table row → spoken cells, then fall through to shared cleanup
        if stripped.startswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            cells = [c for c in cells if c]
            s = "，".join(cells)
        else:
            # drop blockquote markers, heading markers, list bullets (keep ordered numbers)
            s = re.sub(r"^>\s?", "", stripped)
            s = re.sub(r"^#{2,6}\s*", "", s)
            s = re.sub(r"^[-*]\s+", "", s)
            s = re.sub(r"^(\d+)[.、．]\s+", r"\1，", s)
        # links/images → label text
        s = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", s)
        s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
        # inline code / bold / italic
        s = re.sub(r"`([^`]*)`", r"\1", s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
        s = re.sub(r"\*([^*]+)\*", r"\1", s)
        # residual inline HTML (<span class="hl">…</span>, <br>, …) → drop tags
        s = re.sub(r"<[^<>\n]+>", "", s)
        # symbols TTS reads badly
        s = s.replace("→", "，").replace("＝", "等于").replace("≠", "不等于")
        s = s.replace("~", "约").replace("～", "约")
        s = re.sub(r"(?<=[\d%亿])\s*>", " 大于", s)
        s = re.sub(r"(?<=[\d%亿])\s*<", " 小于", s)
        s = EMOJI_RE.sub("", s)
        s = s.replace("【", "，").replace("】", "，").replace('"', "”")
        s = re.sub(r"\s{2,}", " ", s)
        out_lines.append(s.strip())
    text = "\n".join(out_lines)
    text = html.unescape(text)
    # safety net after block joins: stray markup/pipes that survived per-line cleaning
    text = text.replace("**", "").replace("`", "").replace("|", "，")
    text = re.sub(r"\*([^*\n]+)\*", r"\1", text)
    text = re.sub(r"<[^<>\n]+>", "", text)
    text = re.sub(r"\n{2,}", "。", text)
    text = re.sub(r"\n", "。", text)
    text = re.sub(r"。{2,}", "。", text)
    return text.strip("。，")


def split_blocks(body: str) -> list[list[str]]:
    """Split a question body into paragraph blocks on blank lines."""
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in body.splitlines():
        if line.strip():
            current.append(line)
        elif current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)
    return blocks


QUOTE_SKIP_RE = re.compile(r"(引用来源|出现\s*\d+\s*次|组内各词)")


def build_question_body(body_md: str) -> tuple[str, bool]:
    """Pick narration content for one question.

    Policy: prefer the 🎯 考场标准作答 section (written to be recited verbatim);
    append 💡 mnemonic blockquotes from the rest. Questions without a standard
    answer fall back to their full body. Returns (text, used_standard).
    """
    blocks = split_blocks(body_md)
    std_blocks: list[list[str]] = []
    extra_blocks: list[list[str]] = []
    seen_std_head = False
    for blk in blocks:
        head = blk[0].strip()
        if re.match(r"^#{4,6}.*考场标准作答", head):
            seen_std_head = True
            continue
        if re.match(r"^#{4,6}.*深度复习笔记", head):
            seen_std_head = False
            continue
        if QUOTE_SKIP_RE.search(head) and all(QUOTE_SKIP_RE.search(l) or not l.strip() for l in blk[:2]):
            continue  # 出处/考频引用块整块跳过
        if seen_std_head:
            std_blocks.append(blk)
        else:
            extra_blocks.append(blk)

    def joined(bs: list[list[str]]) -> str:
        return clean_for_speech("\n\n".join("\n".join(b) for b in bs)).strip()

    if std_blocks:
        main = joined(std_blocks)
        mnemonics = [
            joined([b]) for b in blocks
            if b[0].strip().startswith(">") and ("记忆口诀" in b[0] or "一句话总括" in b[0])
        ]
        mnemonics = [m for m in mnemonics if m]
        text = main + ("。记忆要点：" + "。".join(mnemonics) if mnemonics else "")
        return text, True
    return joined(extra_blocks), False


def truncate_at_sentence(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    m = None
    for m_candidate in re.finditer(r"[。？！]", cut):
        m = m_candidate
    if m and m.end() > limit // 2:
        cut = cut[: m.end()]
    return cut + "（本条音频为节选，完整内容见页面。）"


def extract_questions(html_text: str) -> list[dict]:
    m = MD_BLOCK_RE.search(html_text)
    if not m:
        raise RuntimeError("md-source block not found in note HTML")
    md = m.group(1)

    questions: list[dict] = []
    topic = ""
    current: dict | None = None
    body_lines: list[str] = []

    def close_current():
        nonlocal current
        if current is None:
            return
        body, used_std = build_question_body("\n".join(body_lines))
        body = truncate_at_sentence(body, MAX_BODY_CHARS)
        q_no = len(questions) + 1
        title = current["title"].rstrip("。 ")
        intro = f"第{q_no}题，{current['topic']}，{TYPE_FULL[current['type']]}。题目：{title}。"
        speech = intro + ("参考作答：" + body if body else "")
        current.update(no=q_no, body=body, speech=speech, standard=used_std)
        questions.append(current)
        current = None

    for line in md.splitlines():
        qm = QUESTION_RE.match(line.strip()) if line.startswith("####") else None
        tm = TOPIC_RE.match(line.strip())
        if qm:
            close_current()
            current = {
                "topic": topic,
                "no_in_topic": int(qm.group(1)),
                "type": qm.group(2),
                "title": qm.group(3),
            }
            body_lines = []
            continue
        if tm:
            close_current()
            t = strip_anchor(tm.group(1)).strip()
            t = re.sub(r"^[^\w一-龥A-Za-z(（]+", "", t)  # 去掉 emoji 前缀
            topic = t
            body_lines = []
            continue
        if current is not None:
            body_lines.append(line)
    close_current()
    return questions


# --------------------------------------------------------------------- audio

def qc_check(text: str, path: Path) -> tuple[bool, float, float]:
    dur = probe_duration(path)
    if dur <= 0:
        return False, dur, 0.0
    cps = len(text) / dur
    return (QC_MIN_CPS <= cps <= QC_MAX_CPS), dur, cps


def tts_with_qc(text: str, wav: Path, *, api_key: str, voice: str,
                endpoint: str, auth_mode: str, label: str) -> None:
    last_dur = last_cps = 0.0
    for attempt in range(1, QC_MAX_ATTEMPTS + 1):
        synthesize_wav(text, wav, api_key=api_key, voice=voice,
                       endpoint=endpoint, auth_mode=auth_mode)
        ok, last_dur, last_cps = qc_check(text, wav)
        if ok:
            if attempt > 1:
                print(f"    QC ok {label} attempt {attempt} (cps={last_cps:.2f})")
            return
        print(f"    QC fail {label} dur={last_dur:.0f}s cps={last_cps:.2f} "
              f"(attempt {attempt}/{QC_MAX_ATTEMPTS}) -> retry")
    print(f"    QC WARN {label} still off after {QC_MAX_ATTEMPTS} attempts "
          f"(dur={last_dur:.0f}s cps={last_cps:.2f}); keeping best effort")


def compress_to_mp3(wav: Path, mp3: Path) -> None:
    proc = run([
        "ffmpeg", "-y", "-i", str(wav),
        "-ar", SAMPLE_RATE, "-ac", "1",
        "-codec:a", "libmp3lame", "-b:a", BITRATE,
        str(mp3),
    ])
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice", default=VOICE)
    parser.add_argument("--bitrate", default=BITRATE)
    parser.add_argument("--only", type=int, nargs="*", default=[],
                        help="只生成指定全局题号（用于试跑/补漏）")
    parser.add_argument("--force", action="store_true",
                        help="忽略缓存重新 TTS")
    parser.add_argument("--dry-run", action="store_true",
                        help="只提取题目并打印统计，不调 TTS")
    parser.add_argument("--speech-dump", action="store_true",
                        help="把朗读文本写到缓存目录供人工检查")
    args = parser.parse_args()

    questions = extract_questions(NOTE_HTML.read_text(encoding="utf-8"))
    print(f"Extracted {len(questions)} questions from "
          f"{NOTE_HTML.relative_to(ROOT)}")

    if args.speech_dump:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        dump = CACHE_DIR / "speech.txt"
        with dump.open("w", encoding="utf-8") as f:
            for q in questions:
                f.write(f"===== #{q['no']} [{q['type']}] {q['topic']}\n"
                        f"{q['title']}\n----\n{q['speech']}\n\n")
        print(f"speech dump -> {dump.relative_to(ROOT)}")

    if args.dry_run:
        total = 0
        long_ones = []
        for q in questions:
            n = len(q["speech"])
            total += n
            flag = "" if q["standard"] else "  [全文]"
            over = "  OVER" if len(q["body"]) >= MAX_BODY_CHARS else ""
            long_ones.append((n, q["no"], q["topic"], flag + over))
        avg = total / max(len(questions), 1)
        print(f"chars total={total} avg={avg:.0f} "
              f"est_hours@3.5cps={total / 3.5 / 3600:.1f}")
        hist = {}
        for n, *_ in long_ones:
            bucket = min(n // 500 * 500, 3000)
            hist[bucket] = hist.get(bucket, 0) + 1
        for k in sorted(hist):
            print(f"  {k:>4}-{k + 499:<4}: {'#' * hist[k]} ({hist[k]})")
        for n, no, topic, flag in sorted(long_ones, reverse=True)[:12]:
            print(f"  top: #{no:>3} {topic:<14} {n} chars {flag}")
        for q in questions:
            if not q["standard"] or len(q["body"]) >= MAX_BODY_CHARS:
                print(f"  note: #{q['no']:>3} [{q['type']}] {q['topic']} "
                      f"std={q['standard']} body={len(q['body'])}")
        return 0

    load_env_file(Path.home() / ".hermes" / ".env")
    api_key = os.environ.get("MIMO_TTS_KEY") or os.environ.get("MIMO_KEY")
    if not api_key:
        print("No TTS key set. Export MIMO_TTS_KEY (preferred) or MIMO_KEY.",
              file=sys.stderr)
        return 2
    endpoint = os.environ.get("MIMO_TTS_ENDPOINT",
                              "https://api.xiaomimimo.com/v1/chat/completions")
    auth_mode = os.environ.get("MIMO_TTS_AUTH_MODE", "api-key")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    todo = [q for q in questions if not args.only or q["no"] in args.only]
    manifest = []
    for q in todo:
        fname = f"mfipe-qa-{q['no']:03d}.mp3"
        mp3 = OUT_DIR / fname
        wav = CACHE_DIR / f"{fname}.wav"

        need_tts = args.force or not wav.exists() or wav.stat().st_size < 1024
        if not need_tts:
            ok, _, _ = qc_check(q["speech"], wav)
            need_tts = not ok
        if need_tts:
            print(f"TTS #{q['no']:>3} [{q['type']}] {q['topic']} "
                  f"({len(q['speech'])} chars)")
            tts_with_qc(q["speech"], wav, api_key=api_key, voice=args.voice,
                        endpoint=endpoint, auth_mode=auth_mode,
                        label=f"{q['no']:03d}")
        else:
            print(f"cached #{q['no']:>3} [{q['type']}] {q['topic']}")

        compress_to_mp3(wav, mp3)
        dur = probe_duration(mp3)
        manifest.append({
            "idx": q["no"],
            "file": fname,
            "topic": q["topic"],
            "noInTopic": q["no_in_topic"],
            "type": q["type"],
            "title": q["title"],
            "seconds": round(dur, 1),
            "bytes": mp3.stat().st_size,
            "excerpted": len(q["body"]) >= MAX_BODY_CHARS,
            "standard": q["standard"],
        })

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    tot_sec = sum(x["seconds"] for x in manifest)
    tot_mb = sum(x["bytes"] for x in manifest) / 1024 / 1024
    print(f"Wrote {MANIFEST.relative_to(ROOT)} ({len(manifest)} items, "
          f"{tot_sec / 60:.0f} min, {tot_mb:.1f} MB @{args.bitrate})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
