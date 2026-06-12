"""
股票池生成工具 (Universe Builder)
====================================

从公开来源抓取指数成分股,生成 crisis_screener.py 可用的 universe.txt。

用法:
  python build_universe.py --sources sp500                       # 标普500
  python build_universe.py --sources sp500 nasdaq100 hangseng    # 多指数合并去重
  python build_universe.py --sources dow30 --extra my_picks.txt  # 指数 + 你的手工清单
  python build_universe.py --sources sp500 --exclude exclude.txt # 剔除你不碰的票
  python build_universe.py --sources sp500 --out universe.txt

支持的来源:
  sp500      标普500成分(约500只,美股核心母池,推荐)
  nasdaq100  纳斯达克100成分
  dow30      道琼斯30成分
  hangseng   恒生指数成分(港股,自动转为 0700.HK 格式)

数据来自维基百科成分股表格(社区维护、更新及时、格式稳定)。
成分股会变动,建议每季度重新生成一次。

依赖: pip install pandas lxml requests
(在 GitHub Actions 中运行时,把 lxml 加进安装依赖即可)

现实提醒:
  - 股票池大小决定筛选耗时:yfinance 逐只拉取,500只约需 5-10 分钟,
    且数据中心IP可能被限流。建议起步控制在 30-150 只。
  - 全市场遍历(美股约8000只)不适合免费数据源,那是 FMP/SimFin
    等付费API的领域,接入后替换 crisis_screener.py 的 fetch_fundamentals 即可。
  - 这个文件是你注入"自己认知"的主要入口:用指数当母池,
    删掉你不理解的行业,加上你长期跟踪的公司。筛选器只负责
    在你的认知边界内排序,不负责替你扩张认知。
"""

import argparse
import io
import re
import sys

import pandas as pd

WIKI = {
    "sp500": dict(
        url="https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        symbol_col="Symbol", market="US",
        match="Symbol"),
    "nasdaq100": dict(
        url="https://en.wikipedia.org/wiki/Nasdaq-100",
        symbol_col="Ticker", market="US",
        match="Ticker"),
    "dow30": dict(
        url="https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average",
        symbol_col="Symbol", market="US",
        match="Symbol"),
    "hangseng": dict(
        url="https://en.wikipedia.org/wiki/Hang_Seng_Index",
        symbol_col="Ticker", market="HK",
        match="Ticker"),
}

UA = {"User-Agent": "Mozilla/5.0 (universe-builder; research use)"}


def normalize(symbol: str, market: str) -> str:
    """把各来源的代码写法统一成 yfinance 格式。"""
    s = str(symbol).strip().upper()
    if not s or s == "NAN":
        return ""
    if market == "US":
        # 维基用 BRK.B / BF.B,yfinance 用 BRK-B / BF-B
        s = s.replace(".", "-")
        # 过滤明显非普通股的杂项(权证、单位等)
        if not re.fullmatch(r"[A-Z]{1,5}(-[A-Z])?", s):
            return ""
        return s
    if market == "HK":
        # 来源可能写成 "700"、"0700"、"SEHK: 700"、"0700.HK"
        m = re.search(r"(\d{1,5})", s)
        if not m:
            return ""
        return f"{int(m.group(1)):04d}.HK"
    return s


def fetch_index(name: str) -> list:
    """抓取一个指数的成分股代码列表。"""
    import requests
    cfg = WIKI[name]
    print(f"抓取 {name} 成分股: {cfg['url']}", file=sys.stderr)
    resp = requests.get(cfg["url"], headers=UA, timeout=30)
    resp.raise_for_status()
    tables = pd.read_html(io.StringIO(resp.text))
    # 在页面所有表格里找包含目标代码列的那张(维基页面结构偶有调整,按列名匹配最稳)
    for t in tables:
        cols = [str(c) for c in t.columns]
        hit = [c for c in cols if cfg["match"].lower() in c.lower()]
        if hit and len(t) >= 10:
            syms = [normalize(v, cfg["market"]) for v in t[hit[0]].tolist()]
            syms = sorted({s for s in syms if s})
            if len(syms) >= 10:
                print(f"  → {len(syms)} 只", file=sys.stderr)
                return syms
    raise RuntimeError(f"{name}: 页面上未找到成分股表格,来源格式可能已变动")


def read_list(path: str) -> list:
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.split("#")[0].strip()
            if line:
                out.append(line.upper())
    return out


def main():
    ap = argparse.ArgumentParser(description="生成 crisis_screener 股票池文件")
    ap.add_argument("--sources", nargs="+", choices=list(WIKI),
                    help="指数来源,可多选合并")
    ap.add_argument("--extra", help="追加合并的手工清单文件(每行一个代码)")
    ap.add_argument("--exclude", help="排除清单文件(每行一个代码,可加 # 注释)")
    ap.add_argument("--out", default="universe.txt", help="输出路径")
    args = ap.parse_args()

    symbols = set()
    for src in (args.sources or []):
        try:
            symbols.update(fetch_index(src))
        except Exception as e:
            print(f"[警告] {src} 抓取失败: {e}", file=sys.stderr)
    if args.extra:
        extra = read_list(args.extra)
        print(f"手工清单追加 {len(extra)} 只", file=sys.stderr)
        symbols.update(extra)
    if args.exclude:
        excl = set(read_list(args.exclude))
        before = len(symbols)
        symbols -= excl
        print(f"排除清单剔除 {before - len(symbols)} 只", file=sys.stderr)

    if not symbols:
        sys.exit("股票池为空:请检查 --sources / --extra 参数或网络")

    syms = sorted(symbols)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(f"# 由 build_universe.py 生成,共 {len(syms)} 只\n")
        fh.write(f"# 来源: {' '.join(args.sources or [])}"
                 f"{' + ' + args.extra if args.extra else ''}\n")
        fh.write("\n".join(syms) + "\n")
    print(f"已生成 {args.out}: {len(syms)} 只")
    if len(syms) > 200:
        print("提醒: 超过200只,免费数据源逐只拉取较慢且可能被限流,"
              "建议用 --exclude 收敛到你真正理解的范围。")


if __name__ == "__main__":
    main()
