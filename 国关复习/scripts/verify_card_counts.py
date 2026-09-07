#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对速查卡 SVG 里的「关键词 频次」与 chapter_keywords.py 当前统计是否一致。

用法：
    python3 verify_card_counts.py            # 报告模式：只列出不一致项
    python3 verify_card_counts.py --fix      # 修复模式：就地改卡片里的频次数字

背景：词表 variant 若互含（如 ["强制结售汇","强制结汇","结售汇","结汇"]），
朴素子串计数会把同一个词数多遍，导致已交付卡片里的频次虚高。
修完词表后必须跑本脚本把卡片数字拉齐。
"""
import re
import sys
import importlib.util
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent          # 国关复习/
SRC = BASE / "翟东升《货币与金融的国际政治经济学》复习笔记.md"
CK = BASE / "scripts" / "chapter_keywords.py"

# 卡片 → (章节 id, 卡片文件名)
CARDS = [
    ("外汇储备", "外汇储备-关键词速查卡.html"),
    ("人民币汇率", "人民币汇率-关键词速查卡.html"),
    ("金本位制度", "金本位制度-关键词速查卡.html"),
    ("人民币国际化", "人民币国际化-关键词速查卡.html"),
    ("布雷顿森林与牙买加体系", "布雷顿森林与牙买加体系-关键词速查卡.html"),
    ("中心-外围体系", "中心-外围体系-关键词速查卡.html"),
    ("货币政策工具与机制", "货币政策工具与机制-关键词速查卡.html"),
    ("全球金融危机史", "全球金融危机史-关键词速查卡.html"),
    ("外资-fdi-与中国工业化", "外资FDI与中国工业化-关键词速查卡.html"),
    ("美元霸权与美国政策", "美元霸权与美国政策-关键词速查卡.html"),
    ("经济周期与理论模型", "经济周期与理论模型-关键词速查卡.html"),
    ("新自由主义与全球化变迁", "新自由主义与全球化变迁-关键词速查卡.html"),
    ("区域合作与特定项目", "区域合作与特定项目-关键词速查卡.html"),
]


def load_ck():
    spec = importlib.util.spec_from_file_location("ck", CK)
    m = importlib.util.module_from_spec(spec)
    sys.argv = ["x", "--lint"]          # 防止加载时执行 main
    spec.loader.exec_module(m)
    return m


# 自动匹配会把卡片标签对到错误词条（如"SDR/纸黄金"→"黄金"），此处人工指定。
# 值：("cn", [变体]) 在中文语料计数；("lat", [变体]) 在拉丁语料计数。
OVERRIDE = {
    "布雷顿森林与牙买加体系-关键词速查卡.html": {
        "SDR/纸黄金": ("mix", ["纸黄金"], ["SDR"]),
        "SWIFT 制裁": ("lat", ["SWIFT"]),
    },
    "中心-外围体系-关键词速查卡.html": {
        "依附理论": ("cn", ["依附", "附庸"]),
        "制造业/工业产能": ("cn", ["制造业", "工业产能"]),
    },
    "人民币国际化-关键词速查卡.html": {
        "CIPS · SWIFT": ("lat", ["CIPS", "SWIFT"]),
        "外储冻结风险": ("cn", ["冻结"]),
    },
    "金本位制度-关键词速查卡.html": {
        "贸易顺差": ("cn", ["顺差"]),
    },
    "经济周期与理论模型-关键词速查卡.html": {
        "去工业化·空心化": ("cn", ["产业空心化", "去工业化"]),
        "资产泡沫": ("cn", ["资产泡沫", "失衡泡沫"]),
        "泡沫破裂": ("cn", ["泡沫破裂"]),
    },
    "新自由主义与全球化变迁-关键词速查卡.html": {
        "全球化": ("cn", ["全球化"], ["逆全球化", "去全球化"]),
        "IMF贷款": ("cn", ["条件性"]),
        "中间品": ("cn", ["中间品"]),
    },
}


def norm(s):
    """归一化：去空白与分隔符，便于卡片标签与词表 key 互相对齐"""
    return re.sub(r"[\s/·、（）()\-—]+", "", s)


def find_key(m, label):
    """卡片标签 → DOMAIN key。先全等，再互相包含，最后拿标签去匹配 variant"""
    nl = norm(label)
    keys = list(m.DOMAIN) + list(m.LATIN)
    for k in keys:
        if norm(k) == nl:
            return m.DOMAIN.get(k) or m.LATIN[k], k, "DOMAIN" if k in m.DOMAIN else "LATIN"
    cands = [k for k in keys if norm(k) in nl or nl in norm(k)]
    if len(cands) == 1:
        k = cands[0]
        return m.DOMAIN.get(k) or m.LATIN[k], k, "DOMAIN" if k in m.DOMAIN else "LATIN"
    for k, vs in m.DOMAIN.items():
        if any(norm(v) in nl or nl in norm(v) for v in vs):
            return vs, k, "DOMAIN"
    for k, vs in m.LATIN.items():
        if any(norm(v) == nl for v in vs):
            return vs, k, "LATIN"
    return None, None, None


def main():
    fix = "--fix" in sys.argv
    m = load_ck()
    total_fix = 0

    for ch, fname in CARDS:
        path = BASE / fname
        if not path.exists():
            print(f"[跳过] {fname} 尚未生成")
            continue
        start, end = m.locate(str(SRC), ch)
        raw = "".join(open(SRC, encoding="utf-8").readlines()[start - 1:end - 1])
        cn, lat = m.clean(raw), m.clean_latin(raw)
        html = open(path, encoding="utf-8").read()

        # 卡片里频次出现两处：SVG 图谱的 <text>节点 + 释义表的 <td class="n">
        pairs = []
        for mt in re.finditer(r"<text[^>]*>([\s\S]{0,200}?)</text>", html):
            txt = re.sub(r"<[^>]+>", "", mt.group(1)).strip()
            mm = re.fullmatch(r"(.+?)\s+(\d{1,4})", txt)
            if mm and not mm.group(1).startswith(("0", "Q")):
                pairs.append((mm.group(1), int(mm.group(2)), "svg"))
        for mt in re.finditer(
                r'<td[^>]*class="kw"[^>]*>([\s\S]{0,60}?)</td>\s*'
                r'<td[^>]*class="n"[^>]*>(\d{1,4})</td>', html):
            pairs.append((re.sub(r"<[^>]+>", "", mt.group(1)).strip(),
                          int(mt.group(2)), "table"))

        ov = OVERRIDE.get(fname, {})
        diffs, unmatched = [], []
        for label, old, _ in pairs:
            if label in ov:
                spec2 = ov[label]
                if spec2[0] == "mix":
                    new = m.count_key(cn, spec2[1], None) + sum(lat.count(v) for v in spec2[2])
                    shown = f"覆盖 {spec2[1]}+{spec2[2]}"
                else:
                    tgt = lat if spec2[0] == "lat" else cn
                    excl = spec2[2] if len(spec2) > 2 else None
                    new = m.count_key(tgt, spec2[1], excl)
                    shown = f"覆盖 {spec2[1]}"
                if new != old:
                    diffs.append((label, shown, old, new))
                continue
            vs, key, where = find_key(m, label)
            if vs is None:
                unmatched.append(label)
                continue
            if where == "LATIN":
                new = sum(lat.count(v) for v in vs)
            else:
                new = m.count_key(cn, vs, m.EXCLUDE.get(key))
            if new != old:
                diffs.append((label, key, old, new))

        print(f"\n{'='*60}\n{ch}  ({fname})")
        if diffs:
            for label, key, old, new in diffs:
                print(f"  ✗ {label:<16} [{key}]  卡片 {old}  →  实际 {new}")
        else:
            print("  ✓ 全部一致")
        if unmatched:
            print(f"  ? 未匹配词表（人工确认）: {' / '.join(unmatched)}")

        if fix and diffs:
            for label, key, old, new in diffs:
                esc = re.escape(label)
                # SVG：整块匹配 <text>…</text>，再替换块尾的频次数字
                # （数字可能被 <tspan> 包着，正则不能跨标签，故先取整块）
                def repl(mt, esc=esc, old=str(old), new=str(new)):
                    blk = mt.group(0)
                    txt = re.sub(r"<[^>]+>", "", blk).strip()
                    if not re.fullmatch(esc + r"\s+" + old, txt):
                        return blk
                    nb, c = re.subn(r"\b" + old + r"\b(?=\s*</tspan>|\s*</text>)", new, blk, count=1)
                    if c:
                        return nb
                    nb, c = re.subn(r"(" + esc + r"\s*)" + old + r"(?=\s*</text>)",
                                    lambda mo: mo.group(1) + new, blk, count=1)
                    return nb if c else blk

                before = html
                html = re.sub(r"<text[^>]*>[\s\S]*?</text>", repl, html)
                n1 = 1 if html != before else 0
                # 表格：<td class="kw">标签</td><td class="n">数字</td>
                html, n2 = re.subn(
                    r'(<td[^>]*class="kw"[^>]*>\s*' + esc + r'\s*</td>\s*'
                    r'<td[^>]*class="n"[^>]*>)' + str(old) + r"(</td>)",
                    lambda mo: mo.group(1) + str(new) + mo.group(2), html)
                if not (n1 or n2):
                    print(f"    ⚠ 未替换成功: {label} {old}→{new}")
                total_fix += n1 + n2
            open(path, "w", encoding="utf-8").write(html)
            print(f"  → 已就地修正 {len(diffs)} 处")

    print(f"\n共修正 {total_fix} 处频次")


if __name__ == "__main__":
    main()
