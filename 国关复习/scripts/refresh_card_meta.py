# -*- coding: utf-8 -*-
"""刷新速查卡的三类元信息：行范围 / 中文字数 / "N 个概念·合计 N 次"总览。

源笔记每改动一次，所有卡片的 these 三类标注就集体过期（8835→8899→10063 行已发生两次）。
本脚本从笔记锚点实时计算真值，默认只报告，--fix 就地替换。

用法：
    PYTHONIOENCODING=utf-8 <py> scripts/refresh_card_meta.py           # 报告
    PYTHONIOENCODING=utf-8 <py> scripts/refresh_card_meta.py --fix     # 就地修正

只替换紧跟在「复习笔记 / 笔记第」后的行号，以及「中文正文 N 字」与两式总览，
避免误伤卡片正文里引用他章的行号。
"""
import re
import sys
import importlib.util
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "翟东升《货币与金融的国际政治经济学》复习笔记.md"
CK = BASE / "scripts" / "chapter_keywords.py"
SKIP = ("一机制通吃三题", "理论框架与背诵路线图")


def load_ck():
    spec = importlib.util.spec_from_file_location("ck", CK)
    m = importlib.util.module_from_spec(spec)
    sys.argv = ["x", "--lint"]          # 防止加载时执行 main
    spec.loader.exec_module(m)
    return m


def chapter_meta(m):
    """返回 [(章节id, 起始行, 结束行, 中文字数, 中文概念, 中文次数, 拉丁概念, 拉丁次数, 拉丁top串)]"""
    lines = SRC.read_text(encoding="utf-8").split("\n")
    anch = [(i + 1, x.group(1)) for i, l in enumerate(lines)
            if (x := re.match(r'## <a id="([^"]+)">', l))]
    anch = [a for a in anch if a[1] not in SKIP]
    out = []
    for i, (ln, name) in enumerate(anch):
        end = (anch[i + 1][0] - 1) if i + 1 < len(anch) else len(lines)
        seg = "\n".join(lines[ln - 1:end])
        cn = m.clean(seg)
        cn_n = cn_tot = lat_n = lat_tot = 0
        for k, vs in m.DOMAIN.items():
            c = m.count_key(cn, vs, m.EXCLUDE.get(k))
            if c:
                cn_n += 1
                cn_tot += c
        latd = {}
        for k, vs in m.LATIN.items():
            c = sum(seg.count(v) for v in vs)
            if c:
                lat_n += 1
                lat_tot += c
                latd[k.split()[0].split("/")[0]] = c   # 取 "CICE" 而非全名
        top = " · ".join(f"{k} {v}" for k, v in
                         sorted(latd.items(), key=lambda x: -x[1])[:5])
        out.append((name, ln, end, len(cn), cn_n, cn_tot, lat_n, lat_tot, top))
    return out


def main():
    fix = "--fix" in sys.argv
    m = load_ck()
    # 卡片文件名：章节 id → 文件（与 verify_card_counts.py 的 CARDS 保持一致）
    sys.path.insert(0, str(BASE / "scripts"))
    from verify_card_counts import CARDS
    fmap = {ch: f for ch, f in CARDS}

    print("=" * 78)
    print(f"{'章节':<24}{'行范围':>14}{'字数':>8}{'概念':>6}{'次数':>7}  状态")
    print("=" * 78)
    n_fix = 0
    for name, s, e, nchar, cn_n, cn_tot, lat_n, lat_tot, lat_top in chapter_meta(m):
        f = fmap.get(name)
        new_ln = f"{s}–{e}"
        new_w = f"{nchar:,}"
        new_tot = cn_n + lat_n
        new_cnt = cn_tot + lat_tot
        if not f or not (BASE / f).exists():
            print(f"{name:<24}{new_ln:>14}{new_w:>8}{new_tot:>6}{new_cnt:>7}  — 无卡片")
            continue
        p = BASE / f
        html = p.read_text(encoding="utf-8")
        orig = html

        # ① 行号：只动「复习笔记 / 笔记第 / 笔记行」后紧跟的那一处
        #    三种写法都要覆盖：'复习笔记 228–1020 行' / '笔记第 228–1020 行' / '笔记行 228–1020'
        #    （缺了「笔记行」式会让早期卡片的行号永远校不到 —— 区域合作卡因此停在旧行号 8537）
        html, a = re.subn(r'(复习笔记|笔记第|笔记行)\s*[\d]{3,5}[–-][\d]{3,5}(\s*行)?',
                          lambda mm: f"{mm.group(1)} {new_ln}{mm.group(2) or ''}", html)
        # ② 字数
        html, b = re.subn(r'(中文正文\s*)[\d,]+(\s*字)',
                          lambda mm: f"{mm.group(1)}{new_w}{mm.group(2)}", html)
        # ③ 总览（两式）
        html, c1 = re.subn(
            r'（\d+ 个概念、合计 [\d,]+ 次(?:；拉丁另计[^）]*)?）',
            lambda mm: (f"（{new_tot} 个概念、合计 {new_cnt:,} 次"
                        + (f"；拉丁另计 {lat_top}）" if lat_top else "）")), html)
        html, c2 = re.subn(
            r'\d+ 个概念 · [\d,]+ 次命中（中文领域词 \d+/[\d,]+ \+ 拉丁缩写 \d+/[\d,]+）',
            f"{new_tot} 个概念 · {new_cnt:,} 次命中（中文领域词 {cn_n}/{cn_tot:,}"
            f" + 拉丁缩写 {lat_n}/{lat_tot}）", html)
        #    c3 的「个」必须可选：徽章常写作「97 概念 · 404 次命中」，
        #    写死「个概念」会漏掉这类卡片，让过期数字显示为「✓ 一致」（假绿）
        html, c3 = re.subn(r'\d+\s*(个)?概念\s*·\s*[\d,]+\s*次命中',
                           lambda mm: (f"{new_tot} {mm.group(1) or ''}概念"
                                       f" · {new_cnt:,} 次命中"), html)
        changed = html != orig
        if changed and fix:
            p.write_text(html, encoding="utf-8")
            n_fix += 1
        flag = ("→ 已修正" if changed and fix else
                "⚠ 需更新" if changed else "✓ 一致")
        print(f"{name:<24}{new_ln:>14}{new_w:>8}{new_tot:>6}{new_cnt:>7}  {flag} "
              f"(行{a} 字{b} 览{c1 + c2 + c3})")
    print("=" * 78)
    print(f"已就地修正 {n_fix} 张卡" if fix else
          "（仅报告。加 --fix 就地修正）")


if __name__ == "__main__":
    main()
