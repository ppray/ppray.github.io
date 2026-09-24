// 回合编排：开季 → 抽事件 → 抉择 → 政令 → 结季。全部是纯函数（旧状态进、新状态出），
// 浏览器与 Node 平衡测试走同一条路径。
import { makeRng } from './rng.js';
import { initState, step, clone, reported, INFO_QUALITY } from './model.js';
import { evalCond, applyEffects, getPath } from './effects.js';
import { POLICIES, DIALS, POLICY_REACT, GROUPS } from './defs.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function newGame(sc, events, seed, opts = {}) {
  const S = initState(sc, seed, opts);
  S.intel = { asked: 0, correct: 0, byConcept: {}, wrong: [] };
  S.news = [];
  return beginQuarter(S, events);
}

// ── 事件
export const optionAvailable = (S, opt) => !opt.when || evalCond(S, opt.when);

export function eligible(S, ev) {
  if (S.seen[ev.id]) return false;
  if (ev.scheduledOnly) return false;
  if (S.q < ev.window[0] || S.q > ev.window[1]) return false;
  return evalCond(S, ev.when);
}

export function beginQuarter(S0, events) {
  const S = clone(S0);
  const rng = makeRng(S.rng);
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  const queue = [];
  // 1. 预约事件（IMF 条件等）
  const due = S.pending.filter(p => p.q <= S.q);
  S.pending = S.pending.filter(p => p.q > S.q);
  for (const p of due) {
    const ev = byId[p.id];
    if (ev && !S.seen[ev.id] && evalCond(S, ev.when)) queue.push(ev.id);
  }
  // 2. 必出事件（按优先级）
  const pool = events.filter(e => eligible(S, e) && !queue.includes(e.id));
  for (const ev of pool.filter(e => e.forced).sort((a, b) => b.priority - a.priority)) {
    if (queue.length < 2) queue.push(ev.id);
  }
  // 3. 随机事件：第一张 90%，第二张 40%
  let rest = pool.filter(e => !e.forced && !queue.includes(e.id));
  while (queue.length < 2 && rest.length) {
    if (!rng.chance(queue.length === 0 ? 0.9 : 0.4)) break;
    const ev = rng.weighted(rest, e => (e.weight || 5) * (1 + (e.priority || 0) / 10));
    queue.push(ev.id);
    rest = rest.filter(e => e !== ev);
  }
  // 危机优先
  queue.sort((a, b) => (byId[b].kind === 'crisis') - (byId[a].kind === 'crisis') || (byId[b].priority || 0) - (byId[a].priority || 0));
  for (const id of queue) S.seen[id] = S.q;
  S.queue = queue;
  S.rng = rng.state;
  S.phaseOfTurn = queue.length ? 'events' : 'desk';
  return S;
}

export function chooseOption(S0, events, eventId, optIdx) {
  const ev = events.find(e => e.id === eventId);
  const opt = ev.options[optIdx];
  if (!optionAvailable(S0, opt)) throw new Error(`选项不可用：${eventId}#${optIdx}`);
  const S = clone(S0);
  const changes = applyEffects(S, opt.effects);
  S.queue = S.queue.filter(id => id !== eventId);
  S.log.push({ q: S.q, id: ev.id, title: ev.title, kind: ev.kind, opt: optIdx, label: opt.label, review: opt.review || '', concepts: ev.concepts, mirror: ev.mirror });
  if (opt.headline) S.news.push({ q: S.q, text: opt.headline });
  if (!S.queue.length) S.phaseOfTurn = 'desk';
  return { S, changes };
}

// 事件正文里的 {占位符}
export function fmtText(S, text, sc) {
  const M = sc.trade.m0;
  const burn = (Math.abs(Math.min(S.eco.dR, 0)) + 0.1 * S.eco.reserves + 0.25 * S.eco.fxDebt) / 4;
  const weeks = clamp(Math.round((S.eco.reserves - 0.3 * M) / Math.max(1, burn)), 2, 30);
  const map = {
    name: S.name, currency: sc.country.currency, fed: S.world.fed.toFixed(2),
    reserves: Math.round(S.eco.reserves * 10).toLocaleString('zh-CN'), fxDebt: Math.round(S.eco.fxDebt * 10).toLocaleString('zh-CN'),
    e: S.eco.e.toFixed(2), weeks,
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

// ── 政令
export function policyCost(S, key, value) {
  if (key === 'reval') return 1;
  const def = POLICIES[key];
  return S.pol[key] === value ? 0 : def.cost;
}

export function setPolicy(S0, key, value) {
  const S = clone(S0);
  const cost = policyCost(S, key, value);
  if (cost > S.pc) return { S: S0, error: `政治资本不足：需要 ${cost}，现有 ${S.pc}` };
  const from = S.pol[key];
  if (from === value) return { S: S0 };
  S.pol[key] = value;
  S.pc -= cost;
  let reactKey;
  if (key === 'fxRegime' || key === 'press') reactKey = `${key}:${value}`;
  else reactKey = `${key}:${value > from ? 'up' : 'down'}`;
  applyReact(S, POLICY_REACT[reactKey]);
  S.log.push({ q: S.q, policy: key, from, to: value });
  return { S };
}

// 调整中间价（钉住/有管理浮动时可用）：±3%
export function revalue(S0, dir) {
  const S = clone(S0);
  if (S.pol.fxRegime === 'float') return { S: S0, error: '自由浮动下汇率由市场决定，无法调整中间价。' };
  if (S.pc < 1) return { S: S0, error: '政治资本不足：需要 1' };
  S.pc -= 1;
  S.eco.e *= dir > 0 ? 0.97 : 1.03;
  applyReact(S, POLICY_REACT[dir > 0 ? 'reval:up' : 'reval:down']);
  S.log.push({ q: S.q, policy: 'reval', to: dir > 0 ? '升值 3%' : '贬值 3%' });
  return { S };
}

export function setDial(S0, key, value) {
  const d = DIALS[key];
  const S = clone(S0);
  const field = key === 'rate' ? 'i' : 'rrr';
  const base = S.dialBase?.[field] ?? S.eco[field];
  const v = clamp(Math.round(value / d.step) * d.step, Math.max(d.min, base - d.maxMove), Math.min(d.max, base + d.maxMove));
  S.dialBase = { ...(S.dialBase || {}), [field]: base };
  S.eco[field] = v;
  return { S };
}

function applyReact(S, react = {}) {
  for (const [k, v] of Object.entries(react)) {
    if (S.soc.groups[k] !== undefined) { S.soc.groups[k] = clamp(S.soc.groups[k] + v, 0, 100); S.soc.mood[k] = (S.soc.mood[k] || 0) + 0.6 * v; }
    else if (k === 'conf') S.eco.conf = clamp(S.eco.conf + v, 0, 100);
    else if (k === 'us') S.dip.us = clamp(S.dip.us + v, 0, 100);
    else if (k === 'trust' || k === 'national') S.soc[k] = clamp(S.soc[k] + v, 0, 100);
  }
}

// ── 结季
export function endQuarter(S0, events, sc) {
  if (S0.queue && S0.queue.length) throw new Error('还有未处理的事件');
  const before = S0;
  let S = step(S0, { sc });
  S.dialBase = null;
  S.lastReport = { q: before.q, before: summarize(before), after: summarize(S), ledger: S.ledger, news: S.news.filter(n => n.q === before.q) };
  if (!S.over) S = beginQuarter(S, events);
  return S;
}

export function summarize(S) {
  const r = reported(S);
  return {
    g: S.eco.g, pi: S.eco.pi, u: S.eco.u, e: S.eco.e, reserves: S.eco.reserves, fxDebt: S.eco.fxDebt, conf: S.eco.conf,
    bubble: S.eco.bubble, debt: S.eco.debt, legit: S.legit, trust: S.soc.trust, grievance: S.soc.grievance,
    groups: { ...S.soc.groups }, rep: r, fed: S.world.fed, phase: S.world.phase, us: S.dip.us, i: S.eco.i,
  };
}

// ── 庙算：对每个选项跑一遍确定性推演（无随机冲击），看两个季度后的局面
export const FORECAST_KEYS = [
  { key: 'reserves', label: '外储', unit: '亿$', scale: 10, digits: 0, good: 1 },
  { key: 'e', label: '汇率', unit: '', digits: 2, good: 0 },
  { key: 'g', label: '增长', unit: '%', digits: 1, good: 1 },
  { key: 'pi', label: '通胀', unit: '%', digits: 1, good: -1 },
  { key: 'conf', label: '市场信心', unit: '', digits: 0, good: 1 },
  { key: 'legit', label: '合法性', unit: '', digits: 0, good: 1 },
];

export function forecastOptions(S0, ev, sc, horizon = 2) {
  return ev.options.map((opt, idx) => {
    if (!optionAvailable(S0, opt)) return null;
    let S = clone(S0);
    applyEffects(S, opt.effects);
    S.queue = [];
    for (let h = 0; h < horizon && !S.over; h++) S = step(S, { sc, noise: false });
    const out = {};
    for (const k of FORECAST_KEYS) out[k.key] = k.key === 'legit' ? S.legit : k.key === 'conf' ? S.eco.conf : S.eco[k.key];
    out.groups = { ...S.soc.groups };
    out.over = S.over;
    out.forcedFloat = !!S.flags.forcedFloat && !S0.flags.forcedFloat;
    out.burst = S.flags.burst && S.flags.burst !== S0.flags.burst;
    return out;
  });
}

// 不做任何事、两季之后会怎样（仪表盘上的「潮汐预警」）
export function outlook(S0, sc, horizon = 2) {
  let S = clone(S0);
  S.queue = [];
  for (let h = 0; h < horizon && !S.over; h++) S = step(S, { sc, noise: false });
  return summarize(S);
}

export { getPath, GROUPS, INFO_QUALITY };
