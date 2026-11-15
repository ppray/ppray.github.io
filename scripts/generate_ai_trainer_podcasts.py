#!/usr/bin/env python3
"""
Generate MP3 audio podcasts and per-question narration for AI Trainer (Level 3) practical exam questions.

Source: games/ai-trainer/bank.json
Pipeline:
  1. Extract practical questions (24 questions across papers 01, 09, 07)
  2. Format spoken Chinese narration script (scoring points, prompt, standard answer, code explanation)
  3. Chunk text if necessary, call Xiaomi MiMo TTS to generate WAVs in cache
  4. Merge into per-question MP3s (ai-trainer-01-1.mp3 ... ai-trainer-07-8.mp3)
  5. Merge into 3 full-paper podcast episodes (ai-trainer-paper-01.mp3, 09, 07)
  6. Output manifest.json (for blog.html inline player) and episodes.json (for podcast.html)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from podcast_common import (  # noqa: E402
    ROOT,
    MIMO_ENDPOINT,
    STYLE,
    VOICE_DEFAULT,
    run,
    load_env_file,
    synthesize_wav,
    probe_duration,
    make_silence,
    merge_wavs_to_mp3,
)

BANK_JSON = ROOT / "games" / "ai-trainer" / "bank.json"
OUT_DIR = ROOT / "podcasts" / "ai-trainer"
CACHE_DIR = OUT_DIR / ".cache"
MANIFEST_FILE = OUT_DIR / "manifest.json"
EPISODES_FILE = OUT_DIR / "episodes.json"

VOICE = VOICE_DEFAULT
BITRATE = "40k"
TTS_TIMEOUT = 120

PAPER_NAMES = {
    "01": "01卷 · 自动化营销与客户体验质检",
    "09": "09卷 · 验证码识别与RPA自动化",
    "07": "07卷 · 自然场景吸烟检测与视觉安全",
}

QUESTION_TYPE_NAMES = {
    "1": "业务流程设计",
    "2": "业务模块效果优化",
    "3": "数据处理规范制定",
    "4": "算法训练与测试（代码实操）",
    "5": "系统监控和优化",
    "6": "人机交互流程设计",
    "7": "数据培训能力考核",
    "8": "数据指导能力考核",
}


def clean_text_for_speech(text: str) -> str:
    """Clean markdown, punctuation, and abbreviations for natural Chinese speech."""
    s = text
    # Remove scores in parentheses e.g. (5分), （15分）
    s = re.sub(r"[（\(][\d\.]+\s*分[）\)]", "", s)
    s = re.sub(r"[（\(][^）\)]*?分[）\)]", "", s)
    # Remove HTML tags
    s = re.sub(r"<[^>]+>", "", s)
    # Symbols
    s = s.replace(">=", "大于等于").replace("≥", "大于等于")
    s = s.replace("<=", "小于等于").replace("≤", "小于等于")
    s = s.replace(">", "大于").replace("<", "小于")
    s = s.replace("≠", "不等于").replace("=", "等于")
    s = s.replace("×", "乘").replace("*", "乘")
    s = s.replace("~", "至").replace("～", "至")
    s = s.replace("【", "").replace("】", "")
    s = s.replace("`", "")
    s = s.replace("#", "")
    # Acronyms spaced out for natural reading
    acronyms = {
        "RFM": "R F M",
        "CRM": "C R M",
        "API": "A P I",
        "AES": "A E S",
        "OCR": "O C R",
        "RPA": "R P A",
        "CNN": "C N N",
        "KNN": "K N N",
        "SVM": "S V M",
        "NLP": "N L P",
        "CV": "计算机视觉",
        "SOP": "S O P",
        "IoU": "I o U",
        "mAP": "m A P",
        "AUC": "A U C",
        "ROC": "R O C",
        "TF-IDF": "T F - I D F",
        "PIL": "P I L",
        "CSV": "C S V",
        "JSON": "J S O N",
        "HTML": "H T M L",
        "URL": "U R L",
        "IP": "I P",
    }
    for k, v in acronyms.items():
        s = re.sub(r"\b" + k + r"\b", v, s)

    # Normalize whitespace & punctuation
    s = re.sub(r"[\r\n]+", "。", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"[，,]{2,}", "，", s)
    s = re.sub(r"[。\.]{2,}", "。", s)
    return s.strip("。， ")


def format_code_for_speech(raw_text: str) -> str:
    """Translate raw python code snippets into clear verbal descriptions."""
    s = raw_text
    s = re.sub(r"import\s*pandas\s*as\s*pd", "第一步，导入pandas数据分析库；", s)
    s = re.sub(
        r"from\s*sklearn\.model_selection\s*import\s*train_test_split",
        "导入sklearn模型选择模块中的train_test_split函数；",
        s,
    )
    s = re.sub(
        r"from\s*sklearn\.feature_extraction\.text\s*import\s*TfidfVectorizer",
        "导入TfidfVectorizer文本特征提取器；",
        s,
    )
    s = re.sub(
        r"from\s*sklearn\.linear_model\s*import\s*LogisticRegression",
        "导入LogisticRegression逻辑回归分类器；",
        s,
    )
    s = re.sub(
        r"from\s*sklearn\.ensemble\s*import\s*RandomForestClassifier",
        "导入随机森林分类器RandomForestClassifier；",
        s,
    )
    s = re.sub(
        r"from\s*sklearn\.metrics\s*import[^\n]+",
        "导入准确率、精确率、召回率、F1分数等模型评估指标函数；",
        s,
    )
    s = re.sub(r"from\s*PIL\s*import\s*Image", "导入PIL图像处理模块中的Image类；", s)
    s = re.sub(
        r"train_test_split\([^\)]+\)",
        "调用train_test_split，设置测试集比例test_size为0.2，随机种子random_state为42，进行训练集与测试集划分；",
        s,
    )
    s = re.sub(
        r"def\s*load_image[^\n]+(?:\n\s+[^\n]+)+",
        "定义图像加载函数load_image：使用PIL打开图片，将其转换为L单通道灰度图，并调用resize统一缩放到32乘32尺寸，最后将像素值列表化作为特征输入；",
        s,
    )
    s = re.sub(r"model\.fit\([^\)]+\)", "调用model的fit方法进行模型训练拟合；", s)
    s = re.sub(r"model\.predict\([^\)]+\)", "调用predict方法在测试集上进行结果预测；", s)
    s = re.sub(
        r"joblib\.dump\([^\)]+\)",
        "使用joblib库的dump方法将训练好的模型保存到考生文件夹；",
        s,
    )
    s = re.sub(
        r"to_csv\([^\)]+\)",
        "调用to_csv方法将结果保存为csv文件；",
        s,
    )
    return s


def build_question_narration(q: dict) -> tuple[str, str, str]:
    """
    Build spoken narration for a practical question.
    Returns: (full_speech_text, prompt_summary, takeaway_summary)
    """
    qid = q["id"]
    title = q["title"]
    paper_key = q["paperKey"]
    paper_name = PAPER_NAMES.get(paper_key, q.get("paperName", ""))
    sub_no = qid.split("-")[-1]
    qtype_name = QUESTION_TYPE_NAMES.get(sub_no, "实操技能题")

    # Reconstruct standard answer
    ans_parts = []
    for it in q["p"]:
        if isinstance(it, int):
            ans_parts.append(q["b"][it])
        else:
            ans_parts.append(it)
    raw_answer = "".join(ans_parts)

    # Summarize prompt
    prompt_lines = [l.strip() for l in q["prompt"].splitlines() if l.strip()]
    prompt_brief = prompt_lines[0] if prompt_lines else "根据业务场景完成实操设计"
    if len(prompt_brief) > 120:
        prompt_brief = prompt_brief[:115] + "等业务需求"

    # Translate code if code question
    if any(k in raw_answer for k in ["import pandas", "importpandas", "def load_image", "from sklearn"]):
        answer_spoken = format_code_for_speech(raw_answer)
    else:
        answer_spoken = raw_answer

    answer_spoken = clean_text_for_speech(answer_spoken)

    # Takeaway summaries based on question type
    takeaways = {
        "1": "业务流程设计通关口诀：需求明确定指标，来源清晰查真实，方式合理保时效，安全合规做备份，定期更新维生命周期。",
        "2": "业务效果优化通关口诀：三层归因查瓶颈，数据清洗补缺失，模型调优重验证，线上业务加兜底。",
        "3": "数据处理规范通关口诀：入库清洗排脏污，标注统一设质检，三率指标卡阈值，异常复盘建台账。",
        "4": "算法实操代码通关口诀：数据切分八比二，灰度缩放三十二，逻辑回归fit拟合，四维指标写报告。",
        "5": "系统监控优化通关口诀：性能业务双监控，阈值报警防漂移，熔断降级保可用，数据回流促闭环。",
        "6": "人机交互设计通关口诀：人机协同分边界，高低置信设分流，机器主攻高效率，人工托底控风险。",
        "7": "培训考核通关口诀：明确目标分层次，理论实操相结合，SOP动作要规范，考评验收建闭环。",
        "8": "指导考核通关口诀：找准痛点析成因，示范纠错手把手，案例复盘提认知，长效追踪促改进。",
    }
    takeaway = takeaways.get(sub_no, "实操通关法则：紧扣采分点，规范分步骤作答。")

    speech = (
        f"人工智能训练师高级实操精讲。"
        f"{paper_name}，第{sub_no}题：{title}。考核题型：{qtype_name}。"
        f"业务背景与核心任务：{prompt_brief}。"
        f"标准作答与采分重点如下：{answer_spoken}。"
        f"通关要点与记忆口诀：{takeaway}"
    )
    speech = re.sub(r"[。\.]{2,}", "。", speech)
    return speech, prompt_brief, takeaway


def chunk_text(text: str, max_chunk: int = 750) -> list[str]:
    """Split speech text into manageable chunks at sentence boundaries."""
    if len(text) <= max_chunk:
        return [text]

    sentences = re.split(r"(?<=[。；！？])", text)
    chunks = []
    cur = ""
    for s in sentences:
        if not s:
            continue
        if len(cur) + len(s) <= max_chunk:
            cur += s
        else:
            if cur:
                chunks.append(cur)
            if len(s) > max_chunk:
                # Sub-split long sentence by comma
                sub_parts = re.split(r"(?<=[，,])", s)
                sub_cur = ""
                for p in sub_parts:
                    if len(sub_cur) + len(p) <= max_chunk:
                        sub_cur += p
                    else:
                        if sub_cur:
                            chunks.append(sub_cur)
                        sub_cur = p
                if sub_cur:
                    cur = sub_cur
                else:
                    cur = ""
            else:
                cur = s
    if cur:
        chunks.append(cur)
    return chunks


def synthesize_question_audio(
    q: dict,
    api_key: str,
    *,
    voice: str = VOICE,
    endpoint: str = MIMO_ENDPOINT,
    force: bool = False,
) -> dict:
    """Synthesize audio for a single practical question."""
    qid = q["id"]
    paper_key = q["paperKey"]
    sub_no = qid.split("-")[-1]
    slug = f"ai-trainer-{paper_key}-{sub_no}"
    mp3_path = OUT_DIR / f"{slug}.mp3"

    speech_text, prompt_brief, takeaway = build_question_narration(q)
    chunks = chunk_text(speech_text, max_chunk=750)

    chunk_wavs = []
    for idx, chunk in enumerate(chunks):
        c_slug = f"{slug}-c{idx+1}"
        wav_path = CACHE_DIR / f"{c_slug}.wav"
        if not wav_path.exists() or wav_path.stat().st_size < 1024 or force:
            print(f"  [{slug}] TTS chunk {idx+1}/{len(chunks)} ({len(chunk)} chars)...")
            synthesize_wav(
                chunk,
                wav_path,
                api_key=api_key,
                voice=voice,
                endpoint=endpoint,
                timeout=TTS_TIMEOUT,
            )
        chunk_wavs.append(wav_path)

    # Concat chunk wavs into single MP3
    silence_05 = CACHE_DIR / "silence_0_5s.wav"
    silence_10 = CACHE_DIR / "silence_1_0s.wav"
    make_silence(silence_05, 0.5)
    make_silence(silence_10, 1.0)

    concat_file = CACHE_DIR / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        for w in chunk_wavs:
            f.write(f"file '{w}'\n")
            f.write(f"file '{silence_05}'\n")
        f.write(f"file '{silence_10}'\n")

    if not mp3_path.exists() or mp3_path.stat().st_size < 1024 or force:
        proc = run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-ar", "24000", "-ac", "1",
            "-codec:a", "libmp3lame", "-b:a", BITRATE,
            str(mp3_path),
        ])
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed for {slug}: {proc.stderr}")

    dur = probe_duration(mp3_path)
    sz = mp3_path.stat().st_size if mp3_path.exists() else 0

    return {
        "id": qid,
        "index": q.get("index", 1),
        "slug": slug,
        "title": q["title"],
        "paperKey": paper_key,
        "paperName": PAPER_NAMES.get(paper_key, q.get("paperName", "")),
        "subNo": int(sub_no),
        "qtypeName": QUESTION_TYPE_NAMES.get(sub_no, "实操技能"),
        "file": f"podcasts/ai-trainer/{slug}.mp3",
        "duration": round(dur, 1),
        "size": sz,
        "promptBrief": prompt_brief,
        "takeaway": takeaway,
        "charCount": len(speech_text),
    }


def merge_paper_podcast(
    paper_key: str,
    paper_name: str,
    question_items: list[dict],
    api_key: str,
    *,
    voice: str = VOICE,
    endpoint: str = MIMO_ENDPOINT,
    force: bool = False,
) -> dict:
    """Merge 8 questions of a paper into one full-paper podcast episode."""
    slug = f"ai-trainer-paper-{paper_key}"
    mp3_path = OUT_DIR / f"{slug}.mp3"

    intro_wav = CACHE_DIR / f"{slug}-intro.wav"
    if not intro_wav.exists() or intro_wav.stat().st_size < 1024 or force:
        intro_text = (
            f"欢迎收听人工智能训练师高级实操全真试卷带背。"
            f"本期节目为{paper_name}，全卷共8道实操大题，涵盖业务流程设计、效果优化、"
            f"数据规范、算法实操、系统监控、人机交互、培训考核与指导考核。"
            f"现在，让我们开始第1题。"
        )
        synthesize_wav(intro_text, intro_wav, api_key=api_key, voice=voice, endpoint=endpoint)

    outro_wav = CACHE_DIR / f"{slug}-outro.wav"
    if not outro_wav.exists() or outro_wav.stat().st_size < 1024 or force:
        outro_text = (
            f"{paper_name}实操全部8道大题带背完毕。"
            f"建议结合通关博客与挖空连击系统反复强化练习。祝您顺利通过考试！"
        )
        synthesize_wav(outro_text, outro_wav, api_key=api_key, voice=voice, endpoint=endpoint)

    silence_2s = CACHE_DIR / "silence_2s.wav"
    make_silence(silence_2s, 2.0)

    concat_file = CACHE_DIR / f"{slug}.concat.txt"
    with concat_file.open("w", encoding="utf-8") as f:
        f.write(f"file '{intro_wav}'\n")
        f.write(f"file '{silence_2s}'\n")
        for item in question_items:
            # We can use the individual mp3 or chunk wavs
            sub_slug = item["slug"]
            # Find chunk wavs
            c_wavs = sorted(CACHE_DIR.glob(f"{sub_slug}-c*.wav"))
            for cw in c_wavs:
                f.write(f"file '{cw}'\n")
            f.write(f"file '{silence_2s}'\n")
        f.write(f"file '{outro_wav}'\n")

    if not mp3_path.exists() or mp3_path.stat().st_size < 1024 or force:
        proc = run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-ar", "24000", "-ac", "1",
            "-codec:a", "libmp3lame", "-b:a", BITRATE,
            str(mp3_path),
        ])
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed for episode {slug}: {proc.stderr}")

    dur = probe_duration(mp3_path)
    sz = mp3_path.stat().st_size if mp3_path.exists() else 0

    return {
        "slug": slug,
        "title": f"人工智能训练师（高级）实操 · {paper_name}",
        "paperKey": paper_key,
        "file": f"podcasts/ai-trainer/{slug}.mp3",
        "duration_seconds": round(dur),
        "size_bytes": sz,
        "question_count": len(question_items),
        "desc": f"涵盖{paper_name}全部8道实操大题的标准作答与核心采分点，采用MiMo TTS茉莉原声带背。",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate AI Trainer practical audio using MiMo TTS")
    parser.add_argument("--dry-run", action="store_true", help="Print scripts without calling TTS")
    parser.add_argument("--force", action="store_true", help="Force re-synthesis even if cached")
    parser.add_argument("--paper", help="Filter by paper: 01, 09, or 07")
    parser.add_argument("--question", help="Filter by question ID e.g. prac-01-1")
    parser.add_argument("--voice", default=VOICE, help="TTS voice name")
    parser.add_argument("--workers", type=int, default=3, help="Concurrent worker count")
    args = parser.parse_args()

    load_env_file(Path.home() / ".hermes" / ".env", override=True)
    api_key = os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: MIMO_KEY not found in ~/.hermes/.env", file=sys.stderr)
        return 1

    with BANK_JSON.open("r", encoding="utf-8") as f:
        bank = json.load(f)

    questions = bank.get("practical", [])
    if args.paper:
        questions = [q for q in questions if q["paperKey"] == args.paper]
    if args.question:
        questions = [q for q in questions if q["id"] == args.question]

    print(f"Loaded {len(questions)} practical questions.")

    if args.dry_run:
        print("\n=== DRY RUN MODE: PREVIEWING NARRATION SCRIPTS ===")
        total_chars = 0
        for i, q in enumerate(questions, 1):
            text, brief, takeaway = build_question_narration(q)
            chunks = chunk_text(text)
            total_chars += len(text)
            print(f"\n[{i:02d}] {q['id']} - {q['title']}")
            print(f"     Length: {len(text)} chars | Chunks: {len(chunks)} | Brief: {brief[:50]}...")
            print(f"     Takeaway: {takeaway}")
            print(f"     Preview: {text[:160]}...")
        print(f"\nTotal characters across {len(questions)} questions: {total_chars} chars.")
        est_minutes = round(total_chars / 3.5 / 60, 1)
        print(f"Estimated total audio duration: ~{est_minutes} minutes.")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nSynthesizing {len(questions)} practical questions using MiMo TTS ({args.voice})...")

    # Generate each question
    manifest_items = [None] * len(questions)
    t0 = time.time()

    def process_one(idx_q):
        idx, q = idx_q
        print(f"--> [{idx+1}/{len(questions)}] Starting {q['id']} - {q['title']}")
        try:
            item = synthesize_question_audio(
                q,
                api_key=api_key,
                voice=args.voice,
                endpoint=MIMO_ENDPOINT,
                force=args.force,
            )
            print(f"    ✓ Done [{idx+1}/{len(questions)}] {item['slug']}.mp3 ({item['duration']}s)")
            return idx, item
        except Exception as e:
            print(f"    ✗ Failed [{idx+1}/{len(questions)}] {q['id']}: {e}", file=sys.stderr)
            raise

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(process_one, (i, q)) for i, q in enumerate(questions)]
        for f in as_completed(futures):
            idx, item = f.result()
            manifest_items[idx] = item

    # Save manifest.json
    with MANIFEST_FILE.open("w", encoding="utf-8") as f:
        json.dump(manifest_items, f, ensure_ascii=False, indent=2)
    print(f"\nWrote manifest with {len(manifest_items)} items to {MANIFEST_FILE}")

    # Merge into paper episodes if full papers were generated
    episodes = []
    paper_groups = {}
    for item in manifest_items:
        paper_groups.setdefault(item["paperKey"], []).append(item)

    for p_key, p_items in sorted(paper_groups.items()):
        p_name = PAPER_NAMES.get(p_key, f"试卷{p_key}")
        print(f"\n--> Merging paper episode for {p_name} ({len(p_items)} questions)...")
        ep = merge_paper_podcast(
            p_key,
            p_name,
            p_items,
            api_key=api_key,
            voice=args.voice,
            endpoint=MIMO_ENDPOINT,
            force=args.force,
        )
        print(f"    ✓ Generated episode {ep['slug']}.mp3 ({ep['duration_seconds']}s, {round(ep['size_bytes']/1024/1024, 2)}MB)")
        episodes.append(ep)

    # Save episodes.json
    with EPISODES_FILE.open("w", encoding="utf-8") as f:
        json.dump(episodes, f, ensure_ascii=False, indent=2)
    print(f"Wrote episodes with {len(episodes)} items to {EPISODES_FILE}")

    elapsed = round(time.time() - t0, 1)
    print(f"\nAll done in {elapsed}s!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
