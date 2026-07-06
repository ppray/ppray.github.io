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


def classify_theme(question: dict) -> str:
    """把一道题归到 12 个主题集之一。

    基于翟东升《货币与金融的国际政治经济学》四层理论框架:
      ①历史演变(金本位/布雷顿/牙买加) ②现实结构(美元霸权/中心-外围)
      ③中国处境(外汇储备/汇率/货币工具/金融危机) ④破局之路(FDI/人民币国际化)
    学术人物按其理论领域打散到对应主题集。
    """
    # 只用题干匹配(更精确),避免答案里的关联词污染分类
    qt = question.get("question", "")
    qid = question["id"]

    # 学术人物按理论领域打散
    if question["category"] == "学术人物":
        scholar_map = {
            "ipe-scholar-03": "hegemony",   # 基欧汉 霸权后合作
            "ipe-scholar-09": "hegemony",   # 金德尔伯格 霸权稳定论
            "ipe-scholar-11": "structure",  # 沃勒斯坦 世界体系
            "ipe-scholar-12": "structure",  # 卡多佐 依附理论
            "ipe-scholar-02": "structure",  # 斯特兰奇 结构性权力
            "ipe-scholar-10": "structure",  # 克拉斯纳 国际机制
            "ipe-scholar-06": "monetary",   # 库珀 相互依存
            "ipe-scholar-07": "monetary",   # 科斯 制度/交易成本
            "ipe-scholar-08": "monetary2",  # 诺思 制度变迁
            "ipe-scholar-04": "monetary2",  # 奥斯特罗姆 多中心治理
            "ipe-scholar-05": "industry",   # 卡赞斯坦 国际化
            "ipe-scholar-01": "rmb-intl",   # 考克斯 批判理论/新自由主义批判
        }
        return scholar_map.get(qid, "tools")

    # 关键词归层。规则顺序经过精心排列以避免误判:
    # 更具体/更窄的主题放前面,通用词放后面。
    rules = [
        # ③层细分(最具体,优先判断)
        ("reserves", r"外汇储备|外汇占款|强制结售汇|双顺差|持有美债|持有美国国债|货币地租|持有巨额美债"),
        ("crisis", r"金融危机|次贷|欧债|拉美.*危机|亚洲金融|主权债务|债务违约|违约|华盛顿共识|金融自由化|进口替代|资产泡沫|系统性.*金融危机|历次.*危机|发展中国家主权"),
        ("monetary2", r"公开市场操作.*困境|央行.*池子|货币政策.*政治考量|央行独立|利息节省"),
        ("monetary", r"存款准备金|公开市场|基础货币|货币乘数|央票|MLF|SLF|冲销|货币创造机制|国债收益率|预算软约束"),
        ("fx", r"人民币汇率|汇率操纵|汇率.*阶段|固定汇率|浮动汇率|汇率套利|大幅贬值|渐进升值|高估|低估|购买力平价|一价定律|利率平价|可贸易品|老龄化.*汇率|技术进步.*汇率"),
        # ④层
        ("industry", r"外商直接投资|FDI|三外路线|雁行|微笑曲线|产业链编辑|CICE|产业转移|产业升级|全球供应链|友岸外包|加工贸易|资源诅咒|去工业化|出口导向|荷兰病"),
        ("rmb-intl", r"人民币国际化|货币互换|一带一路|RCEP|去风险|脱钩|CIPS|日元国际化|新自由主义|逆全球化|搭便车|拜登经济学|新华盛顿共识|经济安全|人民币的锚|工业产能"),
        # ②层
        ("structure", r"中心.?外围|依附理论|世界市场体系|全球货币市场份额|国际货币含义|原罪|巴拉萨|贸易溢出|中央国家的代价"),
        ("hegemony", r"美元霸权|石油美元|SWIFT|美元指数|铸币税|美元潮汐|债务上限|特朗普减税|美元结算|金融核弹|金融制裁|美国.*量化宽松|QE.*美元"),
        # ①层(①两集合并为history,题量太少)
        ("history", r"金本位|金汇兑|黄金输送|金块本位|布雷顿|牙买加|特里芬|SDR|特别提款权|最优货币区|国际收支|全球货币体系.*特点"),
        # 兜底
        ("tools", r"康德拉|康波|通胀|债务.*观|债务经济学|滞涨"),
    ]
    for theme, pat in rules:
        if re.search(pat, qt):
            return theme
    return "tools"


# 11 个主题集定义(按四层主线排列):slug → (层标签, 集标题)
# ①层金本位与布雷顿题量都偏少,合并为一集
THEME_EPISODES = [
    ("history",   "①历史", "① 货币体系演变·金本位到牙买加体系"),
    ("hegemony",  "②结构", "② 现实结构(上)·美元霸权机制"),
    ("structure", "②结构", "② 现实结构(下)·中心-外围体系"),
    ("reserves",  "③处境", "③ 中国处境·外汇储备"),
    ("fx",        "③处境", "③ 中国处境·人民币汇率"),
    ("monetary",  "③处境", "③ 中国处境·货币政策工具"),
    ("monetary2", "③处境", "③ 中国处境·货币政策的政治维度与央行独立性"),
    ("crisis",    "③处境", "③ 中国处境·金融危机史镜鉴"),
    ("industry",  "④破局", "④ 破局之路(上)·产业升级与FDI"),
    ("rmb-intl",  "④破局", "④ 破局之路(下)·人民币国际化与全球化重构"),
    ("tools",     "工具",  "工具概念箱·跨主题理论概念"),
]


def episode_plan(questions: list[dict]) -> list[dict]:
    # 排除填空题(名词解释的镜像,音频叙事冗余)
    items = [q for q in questions if q["category"] != "填空题"]
    by_theme: dict[str, list[dict]] = {slug: [] for slug, _, _ in THEME_EPISODES}
    for q in items:
        theme = classify_theme(q)
        by_theme[theme].append(q)

    episodes: list[dict] = []
    for ep_no, (slug, layer, title) in enumerate(THEME_EPISODES, start=1):
        chunk = by_theme.get(slug, [])
        if not chunk:
            continue
        episodes.append({
            "episode": ep_no,
            "slug": f"ipe-ep{ep_no:02d}-{slug}",
            "title": f"国政经 · {title}",
            "category": layer,
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
    # type 字段:用每集内占比最大的题型,反映该集主要题型
    from collections import Counter
    cat_count = Counter(q["category"] for q in episode["questions"])
    type_map = {"名词解释": "term", "简答题": "short", "论述题": "essay", "学术人物": "scholar"}
    main_cat = cat_count.most_common(1)[0][0]
    return {
        "title": episode["title"],
        "file": str(mp3.relative_to(ROOT)),
        "duration_seconds": round(duration),
        "size_bytes": size,
        "type": type_map.get(main_cat, "mixed"),
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
    parser.add_argument("--concat-only", action="store_true",
                        help="只重新拼接分集(复用缓存wav),不TTS不QC。用于纯重组分集。")
    parser.add_argument("--probe-auth", action="store_true")
    args = parser.parse_args()

    load_env_file(Path.home() / ".hermes" / ".env")
    # MIMO_TTS_KEY is the dedicated TTS credential (preferred); MIMO_KEY is a
    # general key that does NOT authorize the TTS endpoint (returns 401).
    api_key = os.environ.get("MIMO_TTS_KEY") or os.environ.get("MIMO_KEY")
    if not api_key and not args.dry_run and not args.concat_only:
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
            if args.concat_only:
                # 纯重组:只检查缓存wav存在,不TTS不QC
                if not wav.exists() or wav.stat().st_size < 1024:
                    print(f"  MISSING {q['id']} (缓存wav不存在,--concat-only无法生成)")
                    return 3
                print(f"  cached {global_no:03d} {q['id']}")
            else:
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
