# -*- coding: utf-8 -*-
"""国关复习 · 13 张速查卡全量复核（一次跑完七大项）。

复核项：
  A 总览数字  —— 徽章/页脚的「N (个)概念 · M 次命中」是否等于当前统计真值
  B 题目闭环  —— 笔记该题号·题型序列 vs 卡片 Q 编号与「名×a 简×b 论×c」徽章
  C 标签闭合  —— svg/table/div/span/tspan/tr 成对
  D 文件卫生  —— 体积异常 + present_files 预览注入的 data-page-node-id
  E 出处告警  —— 含他人执笔章节的卡是否有 ⚠️ 出处告警块
  F 图谱覆盖  —— 该章词频 TOP30 里，有多少词没进卡片分层表（结构未同步的信号）

用法：
    PYTHONIOENCODING=utf-8 <py> scripts/audit_all_cards.py
退出码：0 = 无 ERROR，1 = 有 ERROR（WARN 不计）
"""
import re
import sys
import importlib.util
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "翟东升《货币与金融的国际政治经济学》复习笔记.md"
SCRIPTS = BASE / "scripts"

# 含他人执笔内容、必须标出处告警的章节（据 SKILL.md 已知列表）
NEED_SOURCE_WARN = {
    "全球金融危机史", "美元霸权与美国政策",
}

problems = []          # (级别, 章节, 说明)


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.argv = ["x", "--lint"]
    spec.loader.exec_module(m)
    return m


def note_questions(m, start, end):
    """返回该章 [(题号, 题型)]，题号按笔记内 1..N"""
    lines = SRC.read_text(encoding="utf-8").split("\n")
    seg = "\n".join(lines[start - 1:end])
    return [(int(a), b) for a, b in
            re.findall(r'####\s*\*\*(\d+)\.\s*\[([^\]]+)\]', seg)]


def card_questions(html):
    qs = sorted({int(x) for x in re.findall(r'Q(\d+)(?![-\d])', html)})
    return qs


def tag_balance(html):
    out = {}
    for tag in ("svg", "table", "div", "span", "tspan", "tr", "td", "th", "figure"):
        o = len(re.findall(rf'<{tag}[\s>]', html))
        c = len(re.findall(rf'</{tag}>', html))
        if o != c:
            out[tag] = (o, c)
    return out


def main():
    ck = load_mod("ck", SCRIPTS / "chapter_keywords.py")
    meta = load_mod("rcm", SCRIPTS / "refresh_card_meta.py")
    sys.path.insert(0, str(SCRIPTS))
    from verify_card_counts import CARDS

    lines = SRC.read_text(encoding="utf-8").split("\n")
    chapters = {n: (s, e) for n, s, e, *_ in meta.chapter_meta(ck)}

    print("=" * 92)
    print("国关复习 · 13 张速查卡全量复核")
    print("=" * 92)

    for ch, fname in CARDS:
        p = BASE / fname
        if not p.exists():
            problems.append(("ERROR", ch, f"卡片文件缺失 {fname}"))
            continue
        html = p.read_text(encoding="utf-8")
        s, e = chapters[ch]
        cn = ck.clean("\n".join(lines[s - 1:e]))
        truth_n = truth_c = 0
        for k, vs in ck.DOMAIN.items():
            truth_c += ck.count_key(cn, vs, ck.EXCLUDE.get(k)) and 1 or 0
        # 复用 chapter_meta 的真值口径
        for name, _s, _e, _w, n1, c1, n2, c2, _t in meta.chapter_meta(ck):
            if name == ch:
                truth_n, truth_c = n1 + n2, c1 + c2
        print(f"\n── {ch}  ({fname})")

        # A 总览数字（两种写法都要查：徽章常写「N 概念」缺「个」）
        hits = re.findall(r'(\d[\d,]*)\s*(?:个)?概念\s*·\s*(\d[\d,]*)\s*次命中', html)
        if not hits:
            problems.append(("WARN", ch, "卡片内未找到「N 概念 · M 次命中」总览标注"))
            print(f"   A 总览   ⚠ 未找到总览标注")
        for a, b in hits:
            a_n, b_n = int(a.replace(",", "")), int(b.replace(",", ""))
            ok = (a_n == truth_n and b_n == truth_c)
            print(f"   A 总览   {'✓' if ok else '✗'} {a} 概念 · {b} 次命中"
                  f"  (真值 {truth_n} · {truth_c})")
            if not ok:
                problems.append(("ERROR", ch,
                                 f"总览数字过期：卡上 {a_n}·{b_n}，真值 {truth_n}·{truth_c}"))

        # B 题目闭环
        nq = note_questions(ck, s, e)
        types = [t for _, t in nq]
        seq = "".join(t[0] for t in types if t)
        cnt = {t: types.count(t) for t in dict.fromkeys(types)}
        cqs = card_questions(html)
        miss = [i for i in range(1, len(nq) + 1) if i not in cqs]
        ok_b = not miss and len(nq) == len(cqs)
        print(f"   B 题目   {'✓' if ok_b else '✗'} 笔记 {len(nq)} 题 [{seq}]"
              f" 卡片 Q{cqs if len(cqs) < 12 else str(cqs[:12]) + '…'}")
        if miss:
            problems.append(("ERROR", ch, f"卡片缺题号 {miss}（笔记共 {len(nq)} 题）"))
        # 题型徽章在卡片头部（h1 之后、第一个 h2 之前）。写法有三种：
        # 「名 1 · 简 3 · 论 1」/「名×1 简×3 论×3」/「名 2 · 简 2」（无某题型时省略）
        seg = html[:html.find("<h2")] if "<h2" in html else html[:3000]
        tc = {}
        for t in ("名", "简", "论"):
            m = re.search(t + r"\s*[×·]?\s*(\d+)", seg)
            if m:
                tc[t] = int(m.group(1))
        if tc:
            exp = {t: cnt.get(t, 0) for t in ("名", "简", "论")}
            diff = {t: (tc.get(t, 0), exp[t]) for t in exp if tc.get(t, 0) != exp[t]}
            if diff:
                problems.append(("ERROR", ch, f"题型标注与笔记不符 {diff}"))
                print(f"          ✗ 题型标注 {tc} ≠ 笔记 {exp}")
        else:
            problems.append(("WARN", ch, "未找到「名×a 简×b 论×c」题型标注"))

        # C 标签闭合
        tb = tag_balance(html)
        print(f"   C 闭合   {'✓ 全部成对' if not tb else '✗ ' + str(tb)}")
        for tag, (o, c) in tb.items():
            problems.append(("ERROR", ch, f"<{tag}> 开 {o} 闭 {c}"))

        # D 文件卫生
        inj = len(re.findall(r'data-page-node-id="[A-Za-z0-9]+"', html))
        size = p.stat().st_size
        flag = "✓"
        if inj:
            flag = "✗"
            problems.append(("ERROR", ch, f"预览注入 {inj} 处 data-page-node-id"))
        if size > 60000:
            flag = "✗"
            problems.append(("WARN", ch, f"体积 {size:,}B 异常（正常 26–36KB）"))
        print(f"   D 卫生   {flag} {size:,}B  注入 {inj}")

        # E 出处告警
        warn_blocks = html.count('class="warn"')
        has_src = ("出处" in html)
        if ch in NEED_SOURCE_WARN:
            ok = warn_blocks > 0 and has_src
            print(f"   E 出处   {'✓' if ok else '✗'} {warn_blocks} 个 warn 块 / 含「出处」{has_src}")
            if not ok:
                problems.append(("ERROR", ch, "缺 ⚠️ 出处告警（该章含他人执笔内容）"))
        else:
            print(f"   E 出处   · {warn_blocks} 个 warn 块 / 含「出处」{has_src}")

        # F 图谱覆盖：词频 TOP30 是否进了卡片分层表
        freq = []
        for k, vs in ck.DOMAIN.items():
            c = ck.count_key(cn, vs, ck.EXCLUDE.get(k))
            if c:
                freq.append((c, k))
        freq.sort(reverse=True)
        top = freq[:30]
        # 关键词实际落在「第二列 td」里，写作「中心—外围(116) · 依附理论(10)」；
        # 也有部分在 SVG <text> 与 <span class="kw"> 层名里。三处都要采。
        kws = set()
        for w in re.findall(r'([一-鿿A-Za-z0-9·—\-/]{2,12})\(\d+\)', html):
            kws.add(w)
        for t in re.findall(r'<text[^>]*>(.*?)</text>', html, re.S):
            t = re.sub(r'<[^>]+>', '', t).strip()
            if t:
                kws.add(t)
        for t in re.findall(r'<span class="kw">(.*?)</span>', html, re.S):
            kws.add(re.sub(r'<[^>]+>', '', t).strip())
        kws = {k for k in kws if k}

        def covered(key):
            """词表 key 形如「美元霸权/美元体系」，任一变体在卡片里出现即算收录"""
            for seg in re.split(r'[/、]', key):
                seg = seg.strip()
                if not seg:
                    continue
                if seg in kws:
                    return True
                if any(seg in x or x in seg for x in kws if x):
                    return True
            return False

        miss_kw = [k for c, k in top if not covered(k)]
        cov = (len(top) - len(miss_kw)) / len(top) * 100 if top else 100
        lv = "✓" if cov >= 70 else ("⚠" if cov >= 50 else "✗")
        print(f"   F 覆盖   {lv} TOP30 覆盖 {cov:.0f}%"
              + (f"  未收录：{'、'.join(k for k in miss_kw[:8])}"
                 + ("…" if len(miss_kw) > 8 else "") if miss_kw else ""))
        if cov < 50:
            problems.append(("ERROR", ch, f"图谱覆盖仅 {cov:.0f}%，结构疑似未同步"))
        elif cov < 70:
            problems.append(("WARN", ch, f"图谱覆盖 {cov:.0f}%，建议抽查"))

    print("\n" + "=" * 92)
    errs = [x for x in problems if x[0] == "ERROR"]
    warns = [x for x in problems if x[0] == "WARN"]
    if errs:
        print(f"❌ ERROR {len(errs)} 项：")
        for lv, ch, msg in errs:
            print(f"   · [{ch}] {msg}")
    if warns:
        print(f"⚠️  WARN {len(warns)} 项：")
        for lv, ch, msg in warns:
            print(f"   · [{ch}] {msg}")
    if not errs and not warns:
        print("✅ 全量复核通过：13 张卡七项全绿")
    print("=" * 92)
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
