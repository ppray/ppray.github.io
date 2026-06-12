"""
危机抄底候选股筛选框架 (Crisis-Resilience Stock Screener)
============================================================

设计思想:把"危机后屡创新高公司的五大共同点"翻译成可量化指标,
对任意股票池(美股/港股)批量打分、排序,生成观察清单。

五大支柱 → 量化代理指标:

  P1 商业模式韧性 (危机伤股价不伤模式)
     - 毛利率水平与稳定性(高且稳 = 定价权)
     - 营收波动率(低 = 需求刚性)

  P2 资产负债表生存能力 (能扛"收入归零")
     - 净现金 / 市值
     - 总债务 / EBITDA
     - 利息覆盖倍数 (EBIT / 利息支出)
     - 生存月数:现金能覆盖多少个月的经营开支

  P3 逆势投资能力 (危机中敢进攻)
     - 自由现金流持续为正的年数
     - FCF / 营收 (自由现金流利润率)

  P4 收税型/重复购买型模式
     - 资本开支强度 (Capex/营收,越低越好)
     - FCF 转化率 (FCF/净利润,>1 说明利润是真金白银)
     - 高毛利作为"过路费"模式的代理

  P5 长期增长趋势
     - 营收 CAGR
     - 股本是否在缩减(回购)而非稀释(增发)

输出:每家公司 0-100 的综合分 + 各支柱分项分 + 原始指标,
便于你按自己的认知调整权重重新排序。

用法:
  python crisis_screener.py --tickers AAPL MSFT V COST          # 指定股票
  python crisis_screener.py --file my_universe.txt              # 从文件读股票池(每行一个代码)
  python crisis_screener.py --demo                              # 用内置样本数据演示(无需联网)
  python crisis_screener.py --tickers AAPL MSFT --weights P2=0.4,P1=0.2,P3=0.15,P4=0.15,P5=0.1

  # 危机性质诊断
  python crisis_screener.py --detect                            # 诊断当前市场并打印证据
  python crisis_screener.py --detect --log crisis_log.csv       # 每日定时跑,追加记录监控压力趋势
  python crisis_screener.py --crisis auto --file universe.txt   # 自动诊断并接管筛选剧本
  # 定时任务示例(crontab,每个交易日收盘后):
  #   30 13 * * 2-6 cd /path && python crisis_screener.py --detect --log crisis_log.csv >> detect.out 2>&1

港股代码格式:0700.HK, 9988.HK 等(yfinance 格式)。

数据源说明:
  默认用 yfinance(免费,但年报财务数据通常只有约 4 年历史)。
  若要更长历史(回测穿越 2008 的能力),建议接入 FMP / SimFin / Tiingo,
  只需替换 fetch_fundamentals() 一个函数,其余逻辑不变。

免责:这是研究工具,不构成投资建议。分数高 ≠ 应该买,
     它只回答"哪些公司更接近历史幸存者的财务画像"。
"""

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass, asdict, field

import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------
# 1. 配置:指标定义与默认权重 —— 这是你注入"自己认知"的地方
# ----------------------------------------------------------------------------

# 各支柱默认权重(总和=1)。危机筛选的核心是活下来,所以 P2 权重最高。
DEFAULT_PILLAR_WEIGHTS = {
    "P1_resilience": 0.18,   # 商业模式韧性
    "P2_survival":   0.27,   # 资产负债表生存能力
    "P3_offense":    0.12,   # 逆势投资能力
    "P4_toll_model": 0.18,   # 收税型模式
    "P5_secular":    0.12,   # 长期趋势
    "P6_valuation":  0.13,   # 危机调整后估值(正常化/压力盈利收益率)
}

# 危机剧本:不同性质的危机 → 板块惩罚(0~1,扣减综合分的比例上限)
# + 支柱权重覆盖 + 盈利压力折扣基准。
# 板块名采用 yfinance 的 sector 命名。
CRISIS_PLAYBOOKS = {
    "generic": dict(  # 不预设危机性质,只用通用压力折扣
        sector_penalty={},
        weight_override={},
        base_haircut=0.30,
    ),
    "financial": dict(  # 2008 型:金融体系/信贷危机
        sector_penalty={"Financial Services": 0.50, "Real Estate": 0.40,
                        "Consumer Cyclical": 0.20, "Industrials": 0.15},
        weight_override={"P2_survival": 0.35},
        base_haircut=0.35,
    ),
    "rates_debt": dict(  # 债务/利率危机:高杠杆、利率敏感行业最危险
        sector_penalty={"Real Estate": 0.50, "Utilities": 0.30,
                        "Financial Services": 0.30, "Consumer Cyclical": 0.15},
        weight_override={"P2_survival": 0.40, "P5_secular": 0.08},
        base_haircut=0.30,
    ),
    "services": dict(  # 2020 型:线下服务/出行停摆
        sector_penalty={"Consumer Cyclical": 0.50, "Energy": 0.30,
                        "Real Estate": 0.30, "Industrials": 0.25},
        weight_override={"P1_resilience": 0.25},
        base_haircut=0.35,
    ),
    "inflation_energy": dict(  # 滞胀/能源冲击型:利率与油价齐升,长久期资产受压
        sector_penalty={"Consumer Cyclical": 0.35, "Technology": 0.25,
                        "Communication Services": 0.20, "Industrials": 0.15},
        weight_override={"P2_survival": 0.32, "P6_valuation": 0.18},
        base_haircut=0.30,
    ),
}

# 每个指标:所属支柱、方向(higher_is_better)、支柱内权重
METRIC_SPEC = {
    "gross_margin":        dict(pillar="P1_resilience", higher=True,  w=0.40),
    "gm_stability":        dict(pillar="P1_resilience", higher=True,  w=0.30),  # 1/毛利率标准差
    "rev_stability":       dict(pillar="P1_resilience", higher=True,  w=0.30),  # 1/营收波动率

    "net_cash_to_mcap":    dict(pillar="P2_survival",   higher=True,  w=0.30),
    "debt_to_ebitda_inv":  dict(pillar="P2_survival",   higher=True,  w=0.25),  # 取倒数,越高越好
    "interest_coverage":   dict(pillar="P2_survival",   higher=True,  w=0.25),
    "survival_months":     dict(pillar="P2_survival",   higher=True,  w=0.20),

    "fcf_positive_years":  dict(pillar="P3_offense",    higher=True,  w=0.50),
    "fcf_margin":          dict(pillar="P3_offense",    higher=True,  w=0.50),

    "capex_intensity_inv": dict(pillar="P4_toll_model", higher=True,  w=0.40),  # 1-Capex/营收
    "fcf_conversion":      dict(pillar="P4_toll_model", higher=True,  w=0.35),  # FCF/净利润
    "toll_margin_flag":    dict(pillar="P4_toll_model", higher=True,  w=0.25),  # 毛利>60% 的程度

    "revenue_cagr":        dict(pillar="P5_secular",    higher=True,  w=0.60),
    "share_count_change":  dict(pillar="P5_secular",    higher=False, w=0.40),  # 股本增长越少越好(负=回购)

    # P6 估值:不用表面 PE(危机中 E 会塌),用正常化与压力情景盈利收益率
    "norm_earnings_yield":     dict(pillar="P6_valuation", higher=True, w=0.45),  # 多年平均利润/市值
    "stressed_earnings_yield": dict(pillar="P6_valuation", higher=True, w=0.55),  # 压力折扣后利润/市值
}

# 硬性淘汰线(一票否决):不满足直接出局,不参与排序。
# 这对应"高杠杆公司资产再好也可能猝死"的教训。
HARD_FILTERS = {
    "interest_coverage_min": 3.0,    # 利息覆盖 < 3 倍 → 出局(无债务者视为通过)
    "survival_months_min":   12.0,   # 现金撑不过 12 个月 → 出局
    "max_debt_to_ebitda":    4.0,    # 债务/EBITDA > 4 → 出局
}


# ----------------------------------------------------------------------------
# 2. 数据获取层 —— 换数据源时只改这里
# ----------------------------------------------------------------------------

@dataclass
class Fundamentals:
    """一家公司参与打分所需的全部原始数据。换数据源时,填满这个结构即可。"""
    ticker: str
    name: str = ""
    sector: str = ""
    market_cap: float = np.nan
    cash: float = np.nan                 # 现金及等价物(含短期投资)
    total_debt: float = np.nan
    ebitda: float = np.nan
    ebit: float = np.nan
    interest_expense: float = np.nan
    operating_expense_annual: float = np.nan   # 年经营开支(用于生存月数)
    revenues: list = field(default_factory=list)        # 按年,旧→新
    gross_profits: list = field(default_factory=list)   # 与 revenues 对齐
    net_incomes: list = field(default_factory=list)
    fcf_history: list = field(default_factory=list)     # 自由现金流,旧→新
    capex: float = np.nan                # 最近一年资本开支(取绝对值)
    shares_history: list = field(default_factory=list)  # 总股本,旧→新
    error: str = ""


def fetch_fundamentals(ticker: str) -> Fundamentals:
    """从 yfinance 拉取数据。注意 yfinance 字段名偶尔变动,做了多重回退。"""
    import yfinance as yf
    f = Fundamentals(ticker=ticker)
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
        f.name = info.get("shortName") or info.get("longName") or ticker
        f.sector = info.get("sector", "") or ""
        f.market_cap = info.get("marketCap", np.nan)
        f.cash = info.get("totalCash", np.nan)
        f.total_debt = info.get("totalDebt", np.nan)
        f.ebitda = info.get("ebitda", np.nan)

        fin = t.financials  # 年度利润表,列=年份(新→旧)
        bs = t.balance_sheet
        cf = t.cashflow

        def rows(df, names):
            for n in names:
                if df is not None and not df.empty and n in df.index:
                    s = df.loc[n].dropna()
                    return list(s.values[::-1])  # 转为旧→新
            return []

        f.revenues = rows(fin, ["Total Revenue", "TotalRevenue"])
        f.gross_profits = rows(fin, ["Gross Profit", "GrossProfit"])
        f.net_incomes = rows(fin, ["Net Income", "NetIncome",
                                   "Net Income Common Stockholders"])
        ebit_hist = rows(fin, ["EBIT", "Operating Income", "OperatingIncome"])
        f.ebit = ebit_hist[-1] if ebit_hist else np.nan
        ie = rows(fin, ["Interest Expense", "InterestExpense"])
        f.interest_expense = abs(ie[-1]) if ie else np.nan

        opex = rows(fin, ["Operating Expense", "OperatingExpense",
                          "Total Operating Expenses"])
        if opex:
            f.operating_expense_annual = abs(opex[-1])
        elif f.revenues and f.gross_profits and f.ebit == f.ebit:
            f.operating_expense_annual = max(f.gross_profits[-1] - f.ebit, 0)

        fcf = rows(cf, ["Free Cash Flow", "FreeCashFlow"])
        if not fcf:
            ocf = rows(cf, ["Operating Cash Flow", "OperatingCashFlow",
                            "Total Cash From Operating Activities"])
            capex_h = rows(cf, ["Capital Expenditure", "CapitalExpenditure"])
            if ocf and capex_h:
                n = min(len(ocf), len(capex_h))
                fcf = [ocf[i] - abs(capex_h[i]) for i in range(-n, 0)]
        f.fcf_history = fcf
        capex_h = rows(cf, ["Capital Expenditure", "CapitalExpenditure"])
        f.capex = abs(capex_h[-1]) if capex_h else np.nan

        f.shares_history = rows(bs, ["Ordinary Shares Number",
                                     "Share Issued", "Common Stock Shares Outstanding"])
        if np.isnan(f.cash):
            cash_h = rows(bs, ["Cash And Cash Equivalents",
                               "Cash Cash Equivalents And Short Term Investments"])
            f.cash = cash_h[-1] if cash_h else np.nan
        if np.isnan(f.total_debt):
            debt_h = rows(bs, ["Total Debt", "TotalDebt"])
            f.total_debt = debt_h[-1] if debt_h else 0.0
    except Exception as e:  # 网络/字段问题不应中断整个批处理
        f.error = str(e)
    return f


# ----------------------------------------------------------------------------
# 3. 指标计算层:原始数据 → 五大支柱的代理指标
# ----------------------------------------------------------------------------

def _cagr(series):
    s = [x for x in series if x and x == x and x > 0]
    if len(s) < 2:
        return np.nan
    years = len(s) - 1
    return (s[-1] / s[0]) ** (1 / years) - 1


def compute_metrics(f: Fundamentals) -> dict:
    m = {"ticker": f.ticker, "name": f.name, "market_cap": f.market_cap}

    # --- P1 商业模式韧性 ---
    gms = [gp / r for gp, r in zip(f.gross_profits, f.revenues)
           if r and r == r and gp == gp and r > 0]
    m["gross_margin"] = gms[-1] if gms else np.nan
    m["gm_stability"] = 1.0 / (np.std(gms) + 0.01) if len(gms) >= 3 else np.nan
    rev_chg = [f.revenues[i] / f.revenues[i - 1] - 1
               for i in range(1, len(f.revenues))
               if f.revenues[i - 1] and f.revenues[i - 1] > 0]
    m["rev_stability"] = 1.0 / (np.std(rev_chg) + 0.01) if len(rev_chg) >= 2 else np.nan

    # --- P2 生存能力 ---
    net_cash = (f.cash if f.cash == f.cash else 0) - (f.total_debt if f.total_debt == f.total_debt else 0)
    m["net_cash"] = net_cash
    m["net_cash_to_mcap"] = net_cash / f.market_cap if f.market_cap and f.market_cap == f.market_cap else np.nan
    if f.ebitda and f.ebitda == f.ebitda and f.ebitda > 0:
        d2e = (f.total_debt or 0) / f.ebitda
        m["debt_to_ebitda"] = d2e
        m["debt_to_ebitda_inv"] = 1.0 / (d2e + 0.25)
    else:
        m["debt_to_ebitda"] = np.nan
        m["debt_to_ebitda_inv"] = np.nan
    if f.interest_expense and f.interest_expense > 0 and f.ebit == f.ebit:
        m["interest_coverage"] = f.ebit / f.interest_expense
    else:
        # 没有利息支出(无债)视为极高覆盖
        m["interest_coverage"] = 100.0 if (f.total_debt or 0) <= 0 else np.nan
    if f.operating_expense_annual and f.operating_expense_annual > 0 and f.cash == f.cash:
        m["survival_months"] = f.cash / (f.operating_expense_annual / 12.0)
    else:
        m["survival_months"] = np.nan

    # --- P3 逆势投资能力 ---
    m["fcf_positive_years"] = sum(1 for x in f.fcf_history if x == x and x > 0)
    if f.fcf_history and f.revenues and f.revenues[-1]:
        m["fcf_margin"] = f.fcf_history[-1] / f.revenues[-1]
    else:
        m["fcf_margin"] = np.nan

    # --- P4 收税型模式 ---
    if f.capex == f.capex and f.revenues and f.revenues[-1]:
        m["capex_intensity_inv"] = 1.0 - min(f.capex / f.revenues[-1], 1.0)
    else:
        m["capex_intensity_inv"] = np.nan
    if (f.fcf_history and f.net_incomes and f.net_incomes[-1]
            and f.net_incomes[-1] > 0):
        m["fcf_conversion"] = min(f.fcf_history[-1] / f.net_incomes[-1], 3.0)
    else:
        m["fcf_conversion"] = np.nan
    gm = m["gross_margin"]
    m["toll_margin_flag"] = max(min((gm - 0.40) / 0.30, 1.0), 0.0) if gm == gm else np.nan

    # --- P5 长期趋势 ---
    m["revenue_cagr"] = _cagr(f.revenues)
    m["share_count_change"] = _cagr(f.shares_history)  # 负值=回购,加分

    # --- P6 估值(危机调整) ---
    m["sector"] = f.sector
    # 正常化盈利:可得年份的平均净利润(穷人版席勒盈利),抹平单年波动
    nis = [x for x in f.net_incomes if x == x]
    norm_e = np.mean(nis) if nis else np.nan
    if norm_e == norm_e and f.market_cap and f.market_cap == f.market_cap:
        m["norm_earnings_yield"] = norm_e / f.market_cap
    else:
        m["norm_earnings_yield"] = np.nan
    # 周期性:历史上单年净利润最大同比降幅(0~1),衰退中利润塌方的倾向
    ni_dd = 0.0
    for i in range(1, len(nis)):
        if nis[i - 1] > 0:
            ni_dd = max(ni_dd, max(0.0, (nis[i - 1] - nis[i]) / nis[i - 1]))
    m["ni_max_drawdown"] = min(ni_dd, 1.0) if nis else np.nan
    # stressed_earnings_yield 在 score() 中按危机剧本计算(依赖危机类型)
    return m


# ----------------------------------------------------------------------------
# 4. 打分层:百分位归一 → 支柱分 → 综合分,外加硬性淘汰
# ----------------------------------------------------------------------------

def apply_hard_filters(df: pd.DataFrame) -> pd.DataFrame:
    reasons = []
    for _, r in df.iterrows():
        why = []
        ic = r.get("interest_coverage")
        if ic == ic and ic < HARD_FILTERS["interest_coverage_min"]:
            why.append(f"利息覆盖{ic:.1f}x过低")
        sm = r.get("survival_months")
        if sm == sm and sm < HARD_FILTERS["survival_months_min"]:
            why.append(f"现金仅撑{sm:.0f}个月")
        d2e = r.get("debt_to_ebitda")
        if d2e == d2e and d2e > HARD_FILTERS["max_debt_to_ebitda"]:
            why.append(f"债务/EBITDA={d2e:.1f}过高")
        reasons.append("; ".join(why))
    df = df.copy()
    df["eliminated_reason"] = reasons
    return df


def score(df: pd.DataFrame, pillar_weights=None, crisis="generic") -> pd.DataFrame:
    playbook = CRISIS_PLAYBOOKS.get(crisis, CRISIS_PLAYBOOKS["generic"])

    pw = dict(DEFAULT_PILLAR_WEIGHTS)
    pw.update(playbook.get("weight_override", {}))   # 危机剧本先调权重
    if pillar_weights:
        pw.update(pillar_weights)                    # 用户手动权重优先级最高
    total = sum(pw.values())
    pw = {k: v / total for k, v in pw.items()}

    df = df.copy()

    # 压力盈利收益率:正常化收益率 × (1 - 折扣)
    # 折扣 = 剧本基准折扣 × (1 + 历史利润回撤倾向),封顶 75%。
    # 周期股在危机中利润塌得更狠,折扣自动放大——这就是"表面PE失真"的修正。
    base_h = playbook["base_haircut"]
    ni_dd = pd.to_numeric(df.get("ni_max_drawdown"), errors="coerce").fillna(0.3)
    haircut = (base_h * (1 + ni_dd)).clip(upper=0.75)
    df["stress_haircut"] = haircut.round(2)
    ney = pd.to_numeric(df.get("norm_earnings_yield"), errors="coerce")
    df["stressed_earnings_yield"] = ney * (1 - haircut)

    pillar_scores = {p: pd.Series(0.0, index=df.index) for p in pw}
    pillar_wsum = {p: pd.Series(0.0, index=df.index) for p in pw}

    for metric, spec in METRIC_SPEC.items():
        if metric not in df.columns:
            continue
        col = pd.to_numeric(df[metric], errors="coerce")
        pct = col.rank(pct=True)              # 横截面百分位
        if not spec["higher"]:
            pct = 1.0 - pct
        valid = pct.notna()
        p = spec["pillar"]
        pillar_scores[p][valid] += pct[valid] * spec["w"]
        pillar_wsum[p][valid] += spec["w"]

    for p in pw:
        with np.errstate(invalid="ignore"):
            df[p] = np.where(pillar_wsum[p] > 0,
                             pillar_scores[p] / pillar_wsum[p] * 100, np.nan)

    df["composite_score"] = sum(df[p].fillna(50) * w for p, w in pw.items())

    # 板块惩罚:危机性质决定哪些行业首当其冲,按比例扣减综合分
    pen_map = playbook.get("sector_penalty", {})
    sector = df.get("sector", pd.Series("", index=df.index)).fillna("")
    penalty = sector.map(lambda s: pen_map.get(s, 0.0))
    df["crisis_sector_penalty"] = penalty
    df["composite_score"] = df["composite_score"] * (1 - penalty)

    # 数据缺失太多的降权提示
    df["data_coverage"] = df[[c for c in METRIC_SPEC if c in df.columns]].notna().mean(axis=1).round(2)
    return df.sort_values("composite_score", ascending=False)


# ----------------------------------------------------------------------------
# 4.5 危机性质识别器:从市场数据的"指纹"诊断危机类型
# ----------------------------------------------------------------------------
# 原理:不同性质的危机在公开行情上留下不同指纹——
#   债市方向:  避险买国债(金融/外生冲击) vs 股债双杀(债务利率/滞胀)
#   信用利差:  高收益债 vs 国债的相对表现,信贷危机中崩得最狠
#   领跌板块:  银行(金融危机) / 航空与可选消费(服务停摆) / 地产公用(利率)
#   油价方向:  油价与利率齐升而股票下跌 = 滞胀指纹
#
# 局限(必须清楚):这是"现在判断"(nowcasting)而非预测,危机早期常被误诊
# (2007年最初被称为"次贷问题可控",2020年最初被当成供应链问题),
# 且危机会变形(2020服务冲击 → 2022演化成利率冲击)。
# 所以诊断结果是"当前证据指向的假设",应随危机演进反复重跑,而非一锤定音。

DETECTOR_TICKERS = ["SPY", "TLT", "HYG", "IEF", "XLF", "KRE", "XLRE", "XLU",
                    "XLY", "XLP", "XLE", "USO", "JETS", "^VIX"]


def fetch_market_data(period="1y", retries=2) -> pd.DataFrame:
    """拉取诊断所需的 ETF/指数日线收盘价。失败自动重试,最终失败抛出带原因的异常。"""
    import yfinance as yf
    last_err = None
    for attempt in range(retries + 1):
        try:
            px = yf.download(DETECTOR_TICKERS, period=period,
                             auto_adjust=True, progress=False)["Close"]
            px = px.dropna(how="all")
            if not px.empty and "SPY" in px.columns and px["SPY"].notna().sum() >= 90:
                return px
            last_err = RuntimeError("返回数据为空或 SPY 历史不足90天(可能被限流)")
        except Exception as e:
            last_err = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"行情数据获取失败(已重试{retries}次): {last_err}")


def detect_crisis(px: pd.DataFrame) -> dict:
    """输入收盘价矩阵,输出诊断:危机类型、各类型得分、证据清单。
    平静市场下也完整计算各信号(便于日常监测压力累积),
    但只有回撤达到危机级别且证据充分时才"宣布"危机类型。"""
    kinds = ["financial", "rates_debt", "services", "inflation_energy"]
    res = dict(crisis="generic", confidence=0.0,
               scores={k: 0.0 for k in kinds}, evidence=[], drawdown=np.nan)
    if "SPY" not in px.columns:
        res["evidence"].append("缺少 SPY 数据,无法诊断")
        return res
    spy = px["SPY"].dropna()
    if len(spy) < 90:
        res["evidence"].append("数据不足90天,无法诊断")
        return res

    peak_date = spy.idxmax()
    dd = spy.iloc[-1] / spy.max() - 1
    res["drawdown"] = dd
    res["evidence"].append(f"SPY 距高点回撤 {dd:.1%}(高点 {peak_date.date()})")
    crisis_level = dd <= -0.12
    if not crisis_level:
        res["evidence"].append("回撤未达危机级别(-12%),以下信号仅作日常监测参考")

    def wret(t):
        """高点以来的区间收益"""
        if t not in px.columns:
            return np.nan
        s = px[t].dropna()
        s = s[s.index >= peak_date]
        return s.iloc[-1] / s.iloc[0] - 1 if len(s) >= 2 else np.nan

    def rel(a, b):
        ra, rb = wret(a), wret(b)
        return ra - rb if ra == ra and rb == rb else np.nan

    # 核心信号
    credit = rel("HYG", "IEF")            # 信用利差代理:越负=信贷压力越大
    banks = rel("XLF", "SPY")
    regional = rel("KRE", "SPY")
    tlt = wret("TLT")                     # 国债方向:正=避险买盘,负=股债双杀
    realestate = rel("XLRE", "SPY")
    utilities = rel("XLU", "SPY")
    discr = rel("XLY", "XLP")             # 可选 vs 必需消费
    jets = rel("JETS", "SPY")
    oil = wret("USO")
    energy = rel("XLE", "SPY")
    if {"SPY", "TLT"}.issubset(px.columns):
        r = px[["SPY", "TLT"]].dropna().pct_change().tail(60)
        sb_corr = r["SPY"].corr(r["TLT"]) if len(r) >= 30 else np.nan
    else:
        sb_corr = np.nan
    vix = px["^VIX"].dropna().iloc[-1] if "^VIX" in px.columns and not px["^VIX"].dropna().empty else np.nan

    scores = {k: 0.0 for k in kinds}
    ev = res["evidence"]

    def hit(kind, pts, text):
        scores[kind] += pts
        ev.append(f"[{kind} +{pts}] {text}")

    # --- 金融/信贷危机指纹 ---
    if credit == credit:
        if credit < -0.08: hit("financial", 2, f"信用利差剧烈走阔(HYG-IEF {credit:.1%})")
        elif credit < -0.03: hit("financial", 1, f"信用利差走阔(HYG-IEF {credit:.1%})")
    if banks == banks and banks < -0.10: hit("financial", 2, f"银行股深度领跌(XLF相对 {banks:.1%})")
    elif banks == banks and banks < -0.05: hit("financial", 1, f"银行股领跌(XLF相对 {banks:.1%})")
    if regional == regional and regional < -0.12: hit("financial", 1, f"区域银行重挫(KRE相对 {regional:.1%})")
    if tlt == tlt and tlt > 0.02: hit("financial", 1, f"资金避险涌入国债(TLT {tlt:+.1%})")

    # --- 债务/利率危机指纹 ---
    if tlt == tlt:
        if tlt < -0.08: hit("rates_debt", 2, f"国债与股票同跌,股债双杀(TLT {tlt:+.1%})")
        elif tlt < -0.03: hit("rates_debt", 1, f"国债下跌(TLT {tlt:+.1%})")
    if sb_corr == sb_corr and sb_corr > 0.25:
        hit("rates_debt", 2, f"股债相关性转正({sb_corr:.2f}),债券失去避险功能")
    if realestate == realestate and realestate < -0.05: hit("rates_debt", 1, f"地产领跌(XLRE相对 {realestate:.1%})")
    if utilities == utilities and utilities < -0.05: hit("rates_debt", 1, f"公用事业领跌(XLU相对 {utilities:.1%})")

    # --- 服务停摆型指纹 ---
    if discr == discr:
        if discr < -0.15: hit("services", 2, f"可选消费相对必需消费崩塌(XLY-XLP {discr:.1%})")
        elif discr < -0.08: hit("services", 1, f"可选消费显著弱于必需(XLY-XLP {discr:.1%})")
    if jets == jets and jets < -0.10: hit("services", 2, f"航空出行股领跌(JETS相对 {jets:.1%})")
    if oil == oil and oil < -0.20: hit("services", 1, f"油价暴跌,需求停摆信号(USO {oil:+.1%})")
    if vix == vix and vix > 40: hit("services", 1, f"恐慌指数极端飙升(VIX {vix:.0f})")

    # --- 滞胀/能源冲击型指纹 ---
    if oil == oil and oil > 0.15: hit("inflation_energy", 2, f"油价逆势大涨(USO {oil:+.1%})")
    if energy == energy and energy > 0.05: hit("inflation_energy", 1, f"能源板块逆势跑赢(XLE相对 {energy:+.1%})")
    if tlt == tlt and tlt < -0.03 and oil == oil and oil > 0:
        hit("inflation_energy", 1, "利率与油价齐升而股票下跌")

    max_pts = {"financial": 7, "rates_debt": 6, "services": 6, "inflation_energy": 4}
    norm = {k: scores[k] / max_pts[k] for k in scores}
    res["scores"] = {k: round(v, 2) for k, v in norm.items()}
    best = max(norm, key=norm.get)
    if crisis_level and norm[best] >= 0.40:
        res["crisis"], res["confidence"] = best, norm[best]
    elif crisis_level:
        ev.append("回撤达危机级别但各类型证据均不充分,维持 generic(混合型或早期阶段)")
    return res


def demo_market_data():
    """合成一段 2008 型金融危机行情,用于无网络环境演示诊断逻辑。"""
    rng = np.random.default_rng(8)
    n_calm, n_crisis = 120, 80
    dates = pd.bdate_range(end="2026-06-12", periods=n_calm + n_crisis)

    def path(calm_drift, crisis_drift, vol, anti_spy=0.0, spy_ret=None):
        ret = np.concatenate([rng.normal(calm_drift, vol, n_calm),
                              rng.normal(crisis_drift, vol * 1.8, n_crisis)])
        if spy_ret is not None and anti_spy:
            ret[n_calm:] += anti_spy * -spy_ret[n_calm:]
        return 100 * np.cumprod(1 + ret)

    spy_ret = np.concatenate([rng.normal(0.0004, 0.008, n_calm),
                              rng.normal(-0.0048, 0.018, n_crisis)])
    spy = 100 * np.cumprod(1 + spy_ret)
    data = {
        "SPY": spy,
        "TLT": path(0.0001, 0.0012, 0.006, anti_spy=0.35, spy_ret=spy_ret),
        "HYG": path(0.0002, -0.0032, 0.006),
        "IEF": path(0.0001, 0.0008, 0.003),
        "XLF": path(0.0004, -0.0085, 0.020),
        "KRE": path(0.0004, -0.0095, 0.022),
        "XLRE": path(0.0003, -0.0060, 0.015),
        "XLU": path(0.0002, -0.0030, 0.010),
        "XLY": path(0.0005, -0.0058, 0.016),
        "XLP": path(0.0002, -0.0022, 0.009),
        "XLE": path(0.0003, -0.0050, 0.018),
        "USO": path(0.0003, -0.0045, 0.020),
        "JETS": path(0.0004, -0.0055, 0.020),
        "^VIX": np.concatenate([np.full(n_calm, 15.0),
                                np.linspace(20, 52, n_crisis)]),
    }
    return pd.DataFrame(data, index=dates)


# ----------------------------------------------------------------------------
# 5. 演示数据(--demo 模式,展示打分逻辑,数字为示意而非实时数据)
# ----------------------------------------------------------------------------

def demo_universe():
    B = 1e9
    sectors = {"TOLLCO": "Financial Services", "FORTRESS": "Consumer Defensive",
               "LEVERED": "Real Estate", "GROWTH": "Technology",
               "CYCLICAL": "Industrials"}
    raw = [
        # ticker, name, mcap, cash, debt, ebitda, ebit, int_exp, opex,
        # revenues(旧→新), gross_profits, net_incomes, fcf, capex, shares
        ("TOLLCO", "收税型支付网络", 500*B, 20*B, 15*B, 22*B, 21*B, 0.6*B, 12*B,
         [24*B, 27*B, 30*B, 33*B], [19*B, 22*B, 24*B, 27*B], [12*B, 14*B, 15*B, 17*B],
         [13*B, 15*B, 16*B, 18*B], 1*B, [2.1*B, 2.05*B, 2.0*B, 1.95*B]),
        ("FORTRESS", "净现金消费品牌", 300*B, 60*B, 10*B, 25*B, 23*B, 0.4*B, 30*B,
         [80*B, 84*B, 88*B, 95*B], [35*B, 37*B, 40*B, 43*B], [18*B, 19*B, 20*B, 22*B],
         [17*B, 18*B, 19*B, 21*B], 3*B, [16*B, 15.8*B, 15.5*B, 15.2*B]),
        ("LEVERED", "高杠杆地产商", 40*B, 3*B, 55*B, 8*B, 6*B, 3.5*B, 9*B,
         [20*B, 22*B, 25*B, 24*B], [8*B, 9*B, 10*B, 9*B], [2*B, 2.5*B, 2*B, 1*B],
         [1*B, 0.5*B, -0.5*B, -1*B], 6*B, [4*B, 4.3*B, 4.8*B, 5.5*B]),
        ("GROWTH", "高增长云软件", 150*B, 12*B, 4*B, 5*B, 4*B, 0.2*B, 14*B,
         [8*B, 11*B, 15*B, 20*B], [6*B, 8.5*B, 11.5*B, 15.5*B], [0.5*B, 1*B, 1.8*B, 2.5*B],
         [1*B, 1.6*B, 2.5*B, 3.5*B], 0.8*B, [3*B, 3.05*B, 3.1*B, 3.12*B]),
        ("CYCLICAL", "重资产周期股", 60*B, 8*B, 25*B, 9*B, 6*B, 1.2*B, 7*B,
         [30*B, 45*B, 38*B, 28*B], [9*B, 16*B, 11*B, 7*B], [2*B, 6*B, 3*B, 0.5*B],
         [1.5*B, 5*B, 2*B, -0.3*B], 5*B, [2*B, 2*B, 2.1*B, 2.2*B]),
    ]
    out = []
    for r in raw:
        out.append(Fundamentals(
            ticker=r[0], name=r[1], sector=sectors.get(r[0], ""),
            market_cap=r[2], cash=r[3], total_debt=r[4],
            ebitda=r[5], ebit=r[6], interest_expense=r[7],
            operating_expense_annual=r[8], revenues=r[9], gross_profits=r[10],
            net_incomes=r[11], fcf_history=r[12], capex=r[13], shares_history=r[14]))
    return out


# ----------------------------------------------------------------------------
# 6. 主流程
# ----------------------------------------------------------------------------

def parse_weights(s):
    mapping = {"P1": "P1_resilience", "P2": "P2_survival", "P3": "P3_offense",
               "P4": "P4_toll_model", "P5": "P5_secular"}
    out = {}
    for part in s.split(","):
        k, v = part.split("=")
        out[mapping.get(k.strip(), k.strip())] = float(v)
    return out


def main():
    ap = argparse.ArgumentParser(description="危机抄底候选股筛选框架")
    ap.add_argument("--tickers", nargs="*", help="股票代码,如 AAPL MSFT 0700.HK")
    ap.add_argument("--file", help="股票池文件,每行一个代码")
    ap.add_argument("--demo", action="store_true", help="用内置样本演示打分逻辑")
    ap.add_argument("--weights", help="自定义支柱权重,如 P2=0.4,P1=0.2,P3=0.15,P4=0.15,P5=0.1")
    ap.add_argument("--crisis", default="generic",
                    choices=list(CRISIS_PLAYBOOKS) + ["auto"],
                    help="危机剧本: generic / financial(2008型) / rates_debt(债务利率型) "
                         "/ services(2020型) / inflation_energy(滞胀型) / auto(自动诊断)")
    ap.add_argument("--detect", action="store_true",
                    help="只运行危机性质诊断并打印证据,不做个股筛选")
    ap.add_argument("--detect-demo", action="store_true",
                    help="用合成的2008型行情演示诊断逻辑(无需联网)")
    ap.add_argument("--log", help="将每次诊断结果追加到该CSV(配合每日定时任务监控压力趋势)")
    ap.add_argument("--out", default="screen_results.csv", help="输出 CSV 路径")
    ap.add_argument("--sleep", type=float, default=0.5, help="每只股票请求间隔秒数")
    args = ap.parse_args()

    # --- 危机性质诊断 ---
    crisis = args.crisis
    if args.detect or args.detect_demo or crisis == "auto" or args.log:
        diag = None
        try:
            px = demo_market_data() if args.detect_demo else fetch_market_data()
            diag = detect_crisis(px)
        except Exception as e:
            print(f"\n[警告] 危机诊断失败: {e}", file=sys.stderr)
            if crisis == "auto":
                crisis = "generic"
                print("[警告] --crisis auto 回退为 generic 剧本", file=sys.stderr)
        if diag:
            print("\n=== 危机性质诊断 ===")
            print(f"诊断结果: {diag['crisis']}  (置信度 {diag['confidence']:.0%})")
            print(f"各类型证据强度: {diag['scores']}")
            print("证据清单:")
            for e in diag["evidence"]:
                print(f"  - {e}")
            print("提示: 这是基于当前行情的'现在判断',危机早期常误诊且会变形,请随演进重跑。")
            if crisis == "auto":
                crisis = diag["crisis"]
                print(f"→ 自动采用剧本: {crisis}")
            if args.log:
                rec = {"date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
                       "spy_drawdown": round(float(diag["drawdown"]), 4)
                       if diag["drawdown"] == diag["drawdown"] else "",
                       "diagnosis": diag["crisis"],
                       "confidence": round(diag["confidence"], 2),
                       **{f"score_{k}": v for k, v in diag["scores"].items()}}
                import os
                pd.DataFrame([rec]).to_csv(args.log, mode="a", index=False,
                                           header=not os.path.exists(args.log))
                print(f"诊断已追加记录到: {args.log}")
        if (args.detect or args.detect_demo) and not (args.tickers or args.file or args.demo):
            return

    if args.demo:
        funds = demo_universe()
    else:
        tickers = list(args.tickers or [])
        if args.file:
            with open(args.file) as fh:
                tickers += [l.strip() for l in fh if l.strip() and not l.startswith("#")]
        if not tickers:
            ap.error("请用 --tickers / --file 提供股票池,或用 --demo 演示")
        funds = []
        for i, tk in enumerate(tickers, 1):
            print(f"[{i}/{len(tickers)}] 拉取 {tk} ...", file=sys.stderr)
            funds.append(fetch_fundamentals(tk))
            time.sleep(args.sleep)

    rows = [compute_metrics(f) for f in funds]
    df = pd.DataFrame(rows)
    df = apply_hard_filters(df)
    weights = parse_weights(args.weights) if args.weights else None

    survivors = df[df["eliminated_reason"] == ""].copy()
    eliminated = df[df["eliminated_reason"] != ""].copy()
    if not survivors.empty:
        survivors = score(survivors, weights, crisis=crisis)

    show_cols = ["ticker", "name", "sector", "composite_score",
                 "P1_resilience", "P2_survival", "P3_offense",
                 "P4_toll_model", "P5_secular", "P6_valuation",
                 "crisis_sector_penalty", "stress_haircut",
                 "norm_earnings_yield", "stressed_earnings_yield",
                 "net_cash_to_mcap", "interest_coverage",
                 "survival_months", "revenue_cagr", "data_coverage"]
    show_cols = [c for c in show_cols if c in survivors.columns]

    pd.set_option("display.width", 240)
    pd.set_option("display.max_columns", 60)
    print(f"\n=== 危机剧本: {crisis} | 通过硬性筛选,按综合分排序 ===")
    if survivors.empty:
        print("(无)")
    else:
        print(survivors[show_cols].round(2).to_string(index=False))

    if not eliminated.empty:
        print("\n=== 被硬性条件淘汰(一票否决) ===")
        print(eliminated[["ticker", "name", "eliminated_reason"]].to_string(index=False))

    full = pd.concat([survivors, eliminated], ignore_index=True)
    full.to_csv(args.out, index=False)
    print(f"\n完整结果已保存: {args.out}")


if __name__ == "__main__":
    main()
