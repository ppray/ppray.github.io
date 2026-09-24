// 华胥经济—政治模型。step() 是纯函数：旧状态进、新状态 + 因果账本出。
// 浏览器、推演（庙算）、Node 平衡测试共用这一份代码。
//
// 因果链（对应课程）：
//   美元潮汐（美联储利率、风险偏好）→ 热钱/外债流向（利差 − 预期贬值 − 风险溢价）
//   → 国际收支压力 → 按汇率制度分给「汇率」或「外储」吸收（三元悖论）
//   → 外汇占款 → 冲销 or 放水（冲销成本 · 通胀 · 资产泡沫）
//   → 增长/就业/通胀 → 五大利益集团的「剥夺与补贴」→ 合法性
import { makeRng } from './rng.js';
import { GROUPS, PHASES } from './defs.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export const clone = s => (typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s)));

export function phaseOf(q, hikeStart) {
  if (q < hikeStart - 2) return 'fangshui';
  if (q < hikeStart) return 'chuipao';
  if (q < hikeStart + 3) return 'shoushui';
  return 'shouge';
}

function buildFedPath(sc, hikeStart, rng, maxQ) {
  const peak = rng.range(sc.tide.peak[0], sc.tide.peak[1]);
  const path = [];
  let r = sc.tide.floor;
  for (let q = 1; q <= maxQ + 1; q++) {
    if (q >= hikeStart && r < peak) r = Math.min(peak, r + rng.range(sc.tide.step[0], sc.tide.step[1]));
    path.push(round(r, 2));
  }
  return path;
}

export function initState(sc, seed, opts = {}) {
  const rng = makeRng(seed);
  const hikeStart = rng.int(sc.tide.hikeStart[0], sc.tide.hikeStart[1]);
  const S = {
    v: 1, scenario: sc.id, seed, q: 1, maxQ: sc.maxQ,
    name: opts.name || sc.country.name, mode: opts.mode || 'calm',
    world: { fed: sc.tide.floor, fedPath: buildFedPath(sc, hikeStart, rng, sc.maxQ), hikeStart, phase: phaseOf(1, hikeStart), risk: 0.78, demand: 1, oil: 1, tariff: 0, pus: 100 },
    eco: { ...sc.eco, e0: sc.e0, rrrPrev: sc.eco.rrr, eTrend: 0, dEpct: 0, ca: 15, kf: 20, dR: 20, caShare: 2.5, adequacy: 1.8, realDeposit: 0, tri: 0 },
    pol: { ...sc.pol },
    soc: { groups: { ...sc.soc.groups }, mood: Object.fromEntries(GROUPS.map(g => [g.id, 0])), trust: sc.soc.trust, national: sc.soc.national, grievance: sc.soc.grievance },
    dip: { ...sc.dip },
    flags: {}, timers: {}, pending: [], seen: {},
    pc: sc.pc, legit: 0,
    hist: { controlledQs: 0, rows: [] },
    log: [], over: null, ledger: null,
  };
  S.rng = rng.state;
  S.legit = legitimacy(S, perfOf(S.eco));
  S.hist.rows.push(snapshot(S, 0));
  return S;
}

export function perfOf(eco) {
  return clamp(50 + 6 * (eco.g - 5) - 5 * Math.max(0, eco.pi - 3) - 6 * Math.max(0, eco.u - 5), 0, 100);
}

export function legitimacy(S, perf) {
  const wA = GROUPS.reduce((n, g) => n + S.soc.groups[g.id] * g.weight, 0);
  return clamp(6 + 0.42 * wA + 0.33 * perf + 0.15 * S.soc.trust + 0.1 * S.soc.national - 0.45 * Math.max(0, S.soc.grievance - 12), 0, 100);
}

// 三元悖论张力：钉住程度 × 资本开放程度 × 利率偏离「美联储 + 风险溢价」的程度（0–1）
export function trilemmaTension(S, iEff = S.eco.i) {
  const peg = { peg: 1, managed: 0.5, float: 0 }[S.pol.fxRegime];
  const open = [0, 0.35, 1][S.pol.capOpen];
  const gap = Math.min(1, Math.abs(iEff - S.world.fed - 2) / 2.5);
  return round(peg * open * gap, 3);
}

// 管控舆论时，你看到的也是被「美化」过的数：统计失真（独裁者的信息困境）
export const INFO_QUALITY = { open: 1, guided: 0.85, controlled: 0.55 };
export function reported(S) {
  const q = INFO_QUALITY[S.pol.press] * (S.flags.honestStats ? 1.25 : 1);
  const k = clamp(1 - q, 0, 1);
  const wob = Math.sin(S.q * 12.9898 + S.seed % 97) * 0.5; // 确定性抖动，推演与实盘一致
  const e = S.eco;
  return {
    g: e.g + k * (2.2 + wob), pi: e.pi - k * (1.5 + wob * 0.5), u: e.u - k * (1.6 + wob * 0.4),
    trust: clamp(S.soc.trust + k * 22, 0, 100), conf: clamp(e.conf + k * 8, 0, 100),
    grievance: clamp(S.soc.grievance * (1 - k * 0.8), 0, 100),
    distorted: k > 0.05,
  };
}

export function snapshot(S, q) {
  const e = S.eco, r = reported(S);
  return {
    q, g: round(e.g), pi: round(e.pi), u: round(e.u), i: e.i, e: round(e.e, 3), reserves: round(e.reserves, 1),
    fxDebt: round(e.fxDebt, 1), ca: round(e.ca, 1), kf: round(e.kf, 1), bubble: round(e.bubble, 1), conf: round(e.conf, 1),
    debt: round(e.debt, 1), npl: round(e.npl, 2), fed: S.world.fed, phase: S.world.phase, legit: round(S.legit, 1),
    trust: round(S.soc.trust, 1), grievance: round(S.soc.grievance, 1), tri: e.tri,
    groups: Object.fromEntries(GROUPS.map(g => [g.id, round(S.soc.groups[g.id], 1)])),
    rep: { g: round(r.g), pi: round(r.pi), u: round(r.u), trust: round(r.trust, 1) },
    press: S.pol.press, regime: S.pol.fxRegime, capOpen: S.pol.capOpen,
  };
}

// ─────────────────────────────────────────────────────────────  推进一个季度
export function step(S0, { noise = true, sc } = {}) {
  const S = clone(S0);
  const rng = makeRng(S.rng);
  const N = sd => (noise ? rng.normal() * sd : 0);
  const { eco, world, pol, soc, dip } = S;
  const q = S.q;
  const potential = sc.potential;
  const notes = [];

  // 计时器（托宾税、限购、IMF 计划……）
  for (const k of Object.keys(S.timers)) { S.timers[k] -= 1; if (S.timers[k] <= 0) delete S.timers[k]; }

  // ── 1. 世界：美元潮汐
  world.fed = world.fedPath[Math.min(q - 1, world.fedPath.length - 1)];
  world.phase = phaseOf(q, world.hikeStart);
  const riskBase = { fangshui: 0.78, chuipao: 0.68, shoushui: 0.46, shouge: 0.36 }[world.phase];
  world.risk = clamp(0.5 * world.risk + 0.5 * riskBase + N(0.04), 0.1, 1);
  world.demand = clamp(world.demand + 0.25 * (1 - world.demand) + N(0.015) - (world.phase === 'shouge' ? 0.01 : 0), 0.8, 1.15);
  world.oil = clamp(world.oil + 0.15 * (1 - world.oil) + N(0.03), 0.4, 2);
  world.pus *= 1.005;

  // ── 2. 贸易与收入
  const c = (eco.e / eco.e0) * (world.pus / eco.P);                 // 实际汇率：>1 = 华元更便宜
  const X = sc.trade.x0 * world.demand * c ** 0.9 * (1 - world.tariff);
  const M = sc.trade.m0 * (1 + (eco.g - 6) * 0.015) * c ** -0.5 * (0.85 + 0.15 * world.oil);
  const resYield = (world.fed + 0.6) * (1 - eco.gold / 100);
  const income = eco.reserves * resYield / 400 - eco.fdiStock * 0.15 * 0.35 / 4 - eco.fxDebt * (world.fed + 2.5) / 400;
  const CA = X - M + income;
  // 「负利差」：外资在华赚 15%，外储买美债只赚美联储利率上下——向美元体系交的贡
  const tribute = Math.min(eco.reserves, eco.fdiStock) * (15 - resYield) / 400;
  eco.tribute += Math.max(0, tribute);

  // ── 3. 资本流动
  const openIn = [0.12, 0.5, 1][pol.capOpen], openOut = [0.28, 0.6, 1][pol.capOpen];
  const iEff = eco.i + eco.bills / 400;                                // 央票存量推高市场利率（冲销悖论）
  const adequacy0 = eco.reserves / (eco.fxDebt + M);
  const caShare0 = CA / eco.gdpQ * 100;
  let expDep = 0.15 * clamp(eco.eTrend, -12, 12) + 0.35 * (eco.pi - 2) - 0.25 * caShare0 + (60 - eco.conf) / 12 + Math.max(0, 1.2 - adequacy0) * 8;
  expDep += 0.5 * Math.max(0, world.fed - 0.5);                      // 美联储加息 → 强美元 → 外围货币贬值预期
  expDep += 30 * (eco.e0 * (world.pus / eco.P) / eco.e - 1);          // 购买力锚：升得越多，市场越预期它回落
  expDep = clamp(expDep, -6, 30);
  if (pol.fxRegime === 'peg' && adequacy0 > 1.2) expDep *= 0.6;       // 可信的钉住能锚定预期——前提是弹药充足
  const premium = 1.5 + Math.max(0, 50 - eco.conf) / 10 + { fangshui: 0, chuipao: 0.3, shoushui: 0.8, shouge: 1.5 }[world.phase];
  const carry = iEff - world.fed - expDep - premium;
  let hot = 8 * carry + 45 * (world.risk - 0.58) + N(3);
  hot *= hot > 0 ? openIn : openOut;
  if (hot > 0 && S.timers.tobin) hot *= 0.5;
  const flight = -Math.max(0, 45 - eco.conf) * 0.7 * openOut;
  // 居民资产外迁：开放了换汇渠道、又预期贬值时，储户与企业自己把钱搬出去（2015–16 年外流的主体）
  const resident = -openOut * Math.max(0, expDep + (world.fed - eco.i) + 1.5) * 7 * (pol.capOpen === 0 ? 0.5 : 1);
  const fdi = eco.fdiFlow * (0.6 + dip.us / 150) * (world.tariff > 0 ? 0.7 : 1);
  eco.fdiStock += Math.max(0, fdi);
  const cheap = Math.max(0, 2 - world.fed);
  const borrow = cheap * 10 * [1, 0.4, 0.05][pol.macropru] * [0.3, 0.7, 1.3][pol.capOpen] * world.risk / 0.7;
  const rollover = clamp(0.35 + eco.conf / 100 * 0.55 + (world.phase === 'fangshui' ? 0.1 : 0) - (world.phase === 'shouge' ? 0.1 : 0), 0.2, 0.98);
  const repay = eco.fxDebt * 0.25 * (1 - rollover);                   // 到期不续 = 急停
  eco.fxDebt = Math.max(0, eco.fxDebt + borrow - repay);
  const KF = fdi + hot + flight + resident + borrow - repay;

  // ── 4. 外汇市场：压力由谁吸收（汇率制度）
  const P = CA + KF;
  const depth = 10;                                                    // 每 1% 汇率变动可消化的资金（十亿美元）
  let dEpct = 0, interv;
  if (pol.fxRegime === 'peg') interv = P;
  else if (pol.fxRegime === 'managed') { dEpct = clamp(-0.3 * P / depth, -2, 2); interv = P + dEpct * depth; }
  else { dEpct = clamp(-0.9 * P / depth * (eco.conf < 40 ? 1.4 : 1), -15, 15); interv = 0.1 * P; }
  if (S.timers.gradualApp) dEpct -= 1;
  eco.e *= 1 + dEpct / 100;
  eco.reserves += interv;
  const floorR = 0.3 * M;
  if (eco.reserves < floorR && pol.fxRegime !== 'float') {
    // 弹药耗尽：被迫浮动（1997 泰国式）
    const jump = noise ? rng.range(25, 40) : 32;
    eco.e *= 1 + jump / 100; dEpct += jump;
    interv += floorR - eco.reserves; eco.reserves = floorR;
    pol.fxRegime = 'float';
    eco.conf -= 15; eco.shock += 3.5;
    S.flags.forcedFloat = q;
    notes.push({ kind: 'collapse', text: `外储跌破警戒线，${S.name}被迫放弃汇率目标，华元单季贬值 ${jump.toFixed(0)}%。` });
  }
  eco.eTrend = dEpct * 4;

  // ── 5. 货币：外汇占款与冲销
  const s = pol.sterilize / 100;
  let sterilized = s * interv;
  if (eco.bills + sterilized < 0) sterilized = -eco.bills;
  eco.bills += sterilized;
  const unster = interv - sterilized;
  const rrrDrain = (eco.rrr - eco.rrrPrev) * 18;
  eco.rrrPrev = eco.rrr;
  const mImpNow = (unster - rrrDrain) / eco.gdpQ * 100 + (S.timers.lolr ? 1.5 : 0);
  eco.mImp = 0.5 * eco.mImp + 0.5 * mImpNow;
  const sterCostQ = eco.bills * Math.max(0, iEff - (world.fed + 0.6)) / 400;
  eco.sterCost += sterCostQ;

  // ── 6. 实体经济
  const r = iEff - eco.pi;
  const fi = pol.fiscal * 1.5 + (S.timers.stimulus ? 1 : 0);
  const caShare = CA / eco.gdpQ * 100;
  const stress = Math.max(0, eco.e / eco.e0 - 1.05) * eco.fxDebt / 15;   // 货币错配：贬值放大美元债
  const gParts = [
    ['潜在增速', potential],
    ['财政', 0.5 * fi],
    ['实际利率', -0.5 * (r - 2)],
    ['净出口', 0.5 * (caShare - 2.5)],
    ['外需', (world.demand - 1) * 8],
    ['资产价格', 0.05 * (eco.bubble - 100)],
    ['货币投放', 0.12 * eco.mImp],
    ['危机冲击', -eco.shock],
    ['信心不足', -0.06 * Math.max(0, 55 - eco.conf)],
    ['美元债压力', -stress],
    ['外债急停', -repay / eco.gdpQ * 100 * 0.6],
  ];
  const gT = gParts.reduce((n, [, v]) => n + v, 0);
  eco.g = clamp(0.5 * eco.g + 0.5 * gT + N(0.3), -15, 14);
  eco.shock *= 0.55;
  const passThrough = 0.2 * Math.max(0, dEpct) + 0.05 * Math.min(0, dEpct);
  const piParts = [
    ['通胀预期', 2],
    ['产出缺口', 0.35 * (eco.g - potential)],
    ['外汇占款放水', 0.3 * eco.mImp],
    ['油价', (world.oil - 1) * 2.5],
  ];
  const piT = piParts.reduce((n, [, v]) => n + v, 0);
  eco.pi = clamp(0.6 * eco.pi + 0.4 * piT + 0.6 * passThrough + N(0.2), -4, 60);
  piParts.push(['汇率传导', 0.6 * passThrough]);
  const uT = sc.u0 - 0.4 * (eco.g - potential) + Math.max(0, 0.96 - c) * 12;
  eco.u = clamp(0.6 * eco.u + 0.4 * uT + N(0.1), 2, 30);
  eco.P *= 1 + eco.pi / 400;
  eco.gdpQ *= (1 + (eco.g + eco.pi) / 400) / (1 + dEpct / 100);

  // 资产价格与破裂
  const bParts = [
    ['货币投放', 1.0 * Math.max(0, eco.mImp)],
    ['低实际利率', 0.8 * (2 - r)],
    ['热钱', hot > 0 ? hot / 15 : hot / 25],
    ['限购限贷', S.timers.purchaseLimits ? -2.5 : 0],
    ['均值回归', -0.04 * (eco.bubble - 100)],
  ];
  eco.bubble = clamp(eco.bubble + bParts.reduce((n, [, v]) => n + v, 0) + N(0.8), 50, 250);
  const cooled = S.flags.burst && q - S.flags.burst < 3;
  if (!cooled && eco.bubble > 116 && (world.phase === 'shoushui' || world.phase === 'shouge' || r > 3.5)) {
    const p = (eco.bubble - 112) / 50 + (hot < -10 ? 0.12 : 0);
    if (noise ? rng.chance(p) : p > 0.5) {
      const drop = 0.28 * (eco.bubble - 92);
      eco.bubble -= drop; eco.shock += 3 + drop / 6; eco.conf -= 8; eco.npl += drop * 0.12;
      // 财富缩水、土地财政断流、银行坏账——留成长期旧账
      soc.mood.savers = (soc.mood.savers || 0) - 6; soc.mood.local = (soc.mood.local || 0) - 8; soc.mood.finance = (soc.mood.finance || 0) - 5;
      S.flags.burst = q;
      notes.push({ kind: 'burst', text: `资产泡沫破裂：房价与股价单季下跌约 ${Math.round(drop / (eco.bubble + drop) * 100)}%。` });
    }
  }
  eco.npl = clamp(eco.npl * 0.93 + 0.12 * Math.max(0, 5 - eco.g) + stress * 0.25 + (r > 5 ? 0.1 * (r - 5) : 0), 0, 40);
  const deficit = 3 + pol.fiscal * 2.2 + (S.timers.stimulus ? 1 : 0);
  eco.debt = clamp(eco.debt + deficit / 4 - eco.debt * (eco.g + eco.pi) / 400, 0, 300);

  // ── 7. 市场信心
  const M2 = sc.trade.m0 * (1 + (eco.g - 6) * 0.015);
  const adequacy = eco.reserves / (eco.fxDebt + M2);
  const tri = trilemmaTension(S, iEff);
  const cParts = [
    ['基准', 52],
    ['外储充足度', 12 * clamp(adequacy - 1.5, -1.5, 0.6)],
    ['通胀', -2.5 * Math.max(0, eco.pi - 4)],
    ['增长', 2 * (eco.g - 5.5)],
    ['三元悖论张力', -10 * tri],
    ['资产泡沫', -0.2 * Math.max(0, eco.bubble - 115)],
    ['银行不良', -2.5 * Math.max(0, eco.npl - 4)],
    ['政府债务', -0.25 * Math.max(0, eco.debt - 60)],
    ['财政纪律', -2.5 * Math.max(0, pol.fiscal)],
    ['信息透明', { open: 3, guided: 0, controlled: -4 }[pol.press]],
    ['外部援助', (S.timers.imf ? 6 : 0) + (dip.swap ? 3 : 0)],
    ['潮汐阶段', world.phase === 'shouge' ? -3 : 0],
  ];
  const cT = cParts.reduce((n, [, v]) => n + v, 0);
  eco.conf = clamp(0.55 * eco.conf + 0.45 * cT + N(1.5), 0, 100);

  // ── 8. 利益集团：剥夺与补贴
  const depositRate = Math.max(0, eco.i - (S.flags.rateLib ? 0.5 : 1.5) - Math.max(0, eco.rrr - 12) * 0.08);
  eco.realDeposit = round(depositRate - eco.pi);
  const gp = {
    exporters: [['基准', 58], ['汇率竞争力', 140 * (c - 1)], ['外需', 40 * (world.demand - 1)], ['融资成本', -2.2 * (iEff - 4)], ['关税', -70 * world.tariff], ['汇率稳定', { peg: 3, managed: 0, float: -3 }[pol.fxRegime]], ['景气', 1.2 * (eco.g - 6)]],
    finance: [['基准', 52], ['资本开放', 5 * pol.capOpen], ['准备金税', -1.1 * (eco.rrr - 15)], ['利差', 0.7 * (eco.i - 4)], ['资产上涨', 0.18 * (eco.bubble - 100)], ['坏账', -4 * Math.max(0, eco.npl - 3)], ['外债管制', -1.5 * pol.macropru], ['被摊派央票', -0.02 * eco.bills]],
    workers: [['基准', 58], ['失业', -10 * (eco.u - 4.5)], ['物价', -3 * Math.max(0, eco.pi - 3)], ['景气', 2.5 * (eco.g - 6)], ['财政', 3 * pol.fiscal]],
    savers: [['基准', 52], ['实际存款利率', 4 * eco.realDeposit], ['准备金税转嫁', -0.7 * (eco.rrr - 15)], ['房产', 0.12 * (eco.bubble - 100)], ['贬值缩水', -1.5 * Math.max(0, dEpct)], ['银行风险', -3 * Math.max(0, eco.npl - 5)], ['换汇自由', pol.capOpen ? 2 : 0]],
    local: [['基准', 58], ['财政', 7 * pol.fiscal], ['融资成本', -2 * (iEff - 4)], ['土地财政', 0.22 * (eco.bubble - 100)], ['景气', 2.5 * (eco.g - 6)], ['债务约束', eco.debt > 60 ? -3 : 0], ['外债管制', -1.2 * pol.macropru]],
  };
  const groupTargets = {};
  soc.mood = soc.mood || Object.fromEntries(GROUPS.map(g => [g.id, 0]));
  for (const g of GROUPS) {
    gp[g.id].push(['旧账与人情', soc.mood[g.id]]);                   // 事件与政令留下的记忆，慢慢淡去
    soc.mood[g.id] *= 0.88;
    const T = gp[g.id].reduce((n, [, v]) => n + v, 0);
    groupTargets[g.id] = T;
    soc.groups[g.id] = clamp(soc.groups[g.id] + 0.35 * (T - soc.groups[g.id]) + N(0.8), 0, 100);
  }

  // ── 9. 民心：信任、积怨、合法性
  const perf = perfOf(eco);
  const avgPop = (soc.groups.workers + soc.groups.savers) / 2;
  const trustT = 0.5 * avgPop + 0.35 * perf + 7.5 + { open: 4, guided: 0, controlled: -6 }[pol.press];
  soc.trust = clamp(0.7 * soc.trust + 0.3 * trustT + N(1), 0, 100);
  const pain = GROUPS.reduce((n, g) => n + Math.max(0, 50 - soc.groups[g.id]) * g.weight, 0);
  const release = { open: 0.45, guided: 0.25, controlled: 0.08 }[pol.press];
  soc.grievance = clamp(soc.grievance * (1 - release) + pain * 0.9 + Math.max(0, eco.u - 5.5) * 2 + Math.max(0, eco.pi - 4) * 1.2, 0, 100);
  soc.national = clamp(soc.national + 0.1 * (45 - soc.national), 0, 100);
  if (pol.press === 'controlled') S.hist.controlledQs += 1;
  S.legit = legitimacy(S, perf);
  S.pc = Math.min(6, S.pc + 1 + (S.legit >= 60 ? 1 : 0) + (S.legit >= 75 ? 1 : 0));

  // ── 10. 派生量与账本
  eco.ca = round(CA, 1); eco.kf = round(KF, 1); eco.dR = round(interv, 1); eco.dEpct = round(dEpct, 2);
  eco.caShare = round(caShare, 2); eco.adequacy = round(adequacy, 2); eco.tri = tri;
  const sum = parts => parts.map(([label, v]) => ({ label, v: round(v, 2) })).filter(p => Math.abs(p.v) >= 0.05);
  S.ledger = {
    q,
    reserves: sum([['经常账户', CA], ['外商直接投资', fdi], ['热钱（利差与避险）', hot], ['居民资产外迁', resident], ['外债借入', borrow], ['外债到期不续', -repay], ['资本外逃', flight], ['汇率变动吸收', interv - P]]),
    growth: sum(gParts), inflation: sum(piParts), bubble: sum(bParts), confidence: sum(cParts),
    groups: Object.fromEntries(GROUPS.map(g => [g.id, { target: round(groupTargets[g.id], 1), parts: sum(gp[g.id]) }])),
    money: { interv: round(interv, 1), sterilized: round(sterilized, 1), unster: round(unster, 1), rrrDrain: round(rrrDrain, 1), sterCostQ: round(sterCostQ, 2), tribute: round(tribute, 2), iEff: round(iEff, 2), carry: round(carry, 2), expDep: round(expDep, 2) },
    notes,
  };

  // ── 11. 终局判定
  if (S.legit < 36) S.over = 'ousted';
  else if (eco.debt > 110 && eco.conf < 20) S.over = 'default';
  S.hist.rows.push(snapshot(S, q));
  S.rng = rng.state;
  S.q = q + 1;
  if (!S.over && S.q > S.maxQ) S.over = 'term';
  return S;
}

export { PHASES };
