// 结算内核。UI 只负责画，所有数字必须从这里出——校验脚本与平衡脚本跑的也是这一份。
//
// 权益是派生量：equity = START + Σ(每工具累计盈亏) - 费用 - 罚金
// 这样「政策干预把你的浮盈打折」只改一处，账就自动对上。
import {
  START_EQUITY, UNIT, MAX_STEP, MARGIN_RATE, MAINT_BASE, TRADE_COST, MCALL_FEE,
  HEAT_TRIGGER, INTEL_COST, LOBBY_COST, LOBBY_HEAT, TOOL_KINDS, HEAT_WEIGHT, gradeOf,
} from './defs.js';
import { makeRng, jitter } from './rng.js';

export function newGame(level, seed) {
  const rng = makeRng(`${level.id}:${seed}`);
  return {
    levelId: level.id,
    seed,
    round: 0,                       // 即将结算的回合下标（0 = 第一回合还没跑）
    pos: Object.fromEntries(level.tools.map(t => [t.id, 0])),
    pnl: Object.fromEntries(level.tools.map(t => [t.id, 0])),   // 每工具累计市值盈亏（百万）
    fees: 0,                        // 情报、游说
    penalty: 0,                     // 强平罚金
    heat: 0,
    intel: null,                    // 已买到的下回合情报
    crackdownFired: false,
    crackdownPending: false,
    marginCalls: 0,
    busted: false,
    log: [],
    rngState: 0,
    rng,
  };
}

// ── 派生量 ────────────────────────────────────────────────────────────────
export function gross(state, level) {
  return level.tools.reduce((s, t) => s + (state.pos[t.id] || 0) * UNIT, 0);
}
export function marginUsed(state, level) {
  return gross(state, level) * MARGIN_RATE;
}
export function equity(state) {
  const pnl = Object.values(state.pnl).reduce((a, b) => a + b, 0);
  return START_EQUITY + pnl - state.fees - state.penalty;
}
export function freeMargin(state, level) {
  return Math.max(0, equity(state) - marginUsed(state, level));
}
export function maxStepsFor(state, level, toolId) {
  const per = UNIT * MARGIN_RATE;
  return Math.max(0, Math.floor(freeMargin(state, level) / per));
}
export function liqOf(level, round) {
  const r = level.rounds[Math.min(round, level.rounds.length - 1)];
  return r && typeof r.liq === 'number' ? r.liq : 1;
}
export function maintReq(state, level, round) {
  return gross(state, level) * (MAINT_BASE / liqOf(level, round));
}

// ── 操作 ──────────────────────────────────────────────────────────────────
// 调仓：把某工具的档位设到 step（0..MAX_STEP），返回是否成功。
export function setStep(state, level, toolId, step) {
  const t = level.tools.find(x => x.id === toolId);
  if (!t) return { ok: false, why: '没有这个工具' };
  if (step < 0 || step > MAX_STEP) return { ok: false, why: '档位超出范围' };
  if (step > 0 && state.round < (t.open || 0)) return { ok: false, why: '这个仓位现在还买不到' };
  const cur = state.pos[toolId] || 0;
  const delta = step - cur;
  if (delta > 0) {
    const need = delta * UNIT * MARGIN_RATE;
    if (need > freeMargin(state, level) + 1e-9) return { ok: false, why: '保证金不够' };
    state.penalty += delta * UNIT * TRADE_COST;   // 滑点记在费用里
  }
  state.pos[toolId] = step;
  return { ok: true };
}

export function buyIntel(state, level) {
  if (state.intel) return { ok: false, why: '情报已经买过了' };
  if (state.round >= level.rounds.length - 1) return { ok: false, why: '已经是最后一回合' };
  if (equity(state) < INTEL_COST) return { ok: false, why: '权益不够付情报费' };
  state.fees += INTEL_COST;
  state.intel = peek(level, state.round, state.rng);
  return { ok: true, intel: state.intel };
}

export function lobby(state) {
  if (equity(state) < LOBBY_COST) return { ok: false, why: '权益不够付公关费' };
  state.fees += LOBBY_COST;
  state.heat = Math.max(0, state.heat + LOBBY_HEAT);
  return { ok: true };
}

// 情报：只泄露「方向」和「量级」，不泄露精确数字——否则就没有决策了。
export function peek(level, round, rng) {
  const next = level.rounds[round + 1];
  if (!next) return null;
  const r = rng || Math.random;
  const lines = level.tools.map(t => {
    const mv = t.dir * (next.mv[t.id] || 0);   // 转成「你这个仓位的收益方向」
    const mag = Math.abs(mv);
    const word = mag < 0.02 ? '几乎不动' : mag < 0.07 ? '小幅' : mag < 0.16 ? '可观' : '剧烈';
    const good = mv > 0;
    const noise = r() < 0.12;                  // 12% 概率情报失真（线人也会错）
    const sayGood = noise ? !good : good;
    return { id: t.id, label: t.label, sayGood, word, noise };
  });
  return { round: round + 1, lines, liq: next.liq };
}

// ── 结算 ──────────────────────────────────────────────────────────────────
// 推进一回合：市场变动 → 收益与 carry → 热度 → 流动性/维持保证金 → 干预 → 强平。
export function advance(state, level) {
  const ri = state.round;
  if (ri >= level.rounds.length) return { done: true };
  const rd = level.rounds[ri];
  const rng = state.rng;
  const before = equity(state);
  const lines = [];

  // 1) 市场：史实方向 + 幅度扰动。扰动不会翻转方向。
  for (const t of level.tools) {
    const stepNow = state.pos[t.id] || 0;
    if (!stepNow) continue;
    const base = rd.mv[t.id] || 0;
    const j = Math.min(0.03, Math.abs(base) * 0.3);
    const mv = base + (base === 0 ? 0 : jitter(rng, j));
    const kind = TOOL_KINDS[t.kind];
    const ret = t.dir * mv - kind.carry;
    const notional = stepNow * UNIT;
    const p = notional * ret;
    state.pnl[t.id] += p;
    lines.push({ id: t.id, label: t.label, mv, ret, pnl: p, step: stepNow });
  }

  // 2) 监管热度：仓位越大、越招摇（做空主权、买 CDS），涨得越快。
  let heatAdd = level.heatBase || 0;
  for (const t of level.tools) {
    const stepNow = state.pos[t.id] || 0;
    if (!stepNow) continue;
    const w = HEAT_WEIGHT[t.kind] ?? 0.5;
    heatAdd += w * ((stepNow * UNIT) / START_EQUITY) * 10;
  }
  state.heat = Math.min(140, state.heat + heatAdd);

  // 3) 政策干预：热度到顶 → 下一回合落地；热度下降则撤销预警。
  const cd = level.crackdown;
  let crackdown = null;
  if (cd && !state.crackdownFired) {
    if (state.crackdownPending) {
      state.crackdownFired = true;
      state.crackdownPending = false;
      for (const id of cd.tools) {
        if (state.pnl[id] > 0) {
          const lost = state.pnl[id] * (1 - cd.factor);
          state.pnl[id] *= cd.factor;
          lines.push({ id, label: (level.tools.find(t => t.id === id) || {}).label, intervention: true, lost });
        }
        state.pos[id] = 0;             // 强制平仓
      }
      crackdown = cd;
    } else if (state.heat >= HEAT_TRIGGER) {
      state.crackdownPending = true;
    } else if (state.heat < HEAT_TRIGGER - 25) {
      state.crackdownPending = false;
    }
  }

  // 4) 维持保证金：流动性越差，要求越高。不够就平到够为止。
  let marginCall = null;
  let maint = maintReq(state, level, ri);
  if (gross(state, level) > 0 && equity(state) < maint) {
    const order = level.tools.slice().sort((a, b) => (state.pos[b.id] || 0) - (state.pos[a.id] || 0));
    let closed = 0;
    for (const t of order) {
      if (equity(state) >= maint) break;
      const s = state.pos[t.id] || 0;
      if (!s) continue;
      state.pos[t.id] = 0;
      closed += s * UNIT;
      maint = maintReq(state, level, ri);
    }
    if (closed > 0) {
      const fee = closed * MCALL_FEE;
      state.penalty += fee;
      state.marginCalls += 1;
      marginCall = { closed, fee };
    }
  }

  const after = equity(state);
  const rec = {
    round: ri, date: rd.date, title: rd.title, wire: rd.wire, note: rd.note,
    lines, before, after, delta: after - before, heat: state.heat,
    crackdown: crackdown ? { title: crackdown.title, text: crackdown.text } : null,
    marginCall, liq: liqOf(level, ri),
  };
  state.log.push(rec);
  state.round += 1;
  state.intel = null;

  const done = state.round >= level.rounds.length;
  const busted = equity(state) <= 1;
  if (busted) state.busted = true;
  return { done: done || busted, rec, busted };
}

// ── 收官 ──────────────────────────────────────────────────────────────────
export function summary(state, level) {
  const eq = equity(state);
  const g = gradeOf(eq, state.busted);
  const peak = Math.max(...state.log.map(l => l.after), START_EQUITY);
  const worst = Math.min(...state.log.map(l => l.delta), 0);
  const best = Math.max(...state.log.map(l => l.delta), 0);
  return {
    equity: eq, ret: (eq / START_EQUITY - 1) * 100, grade: g, peak, worst, best,
    marginCalls: state.marginCalls, crackdown: state.crackdownFired,
    curve: [START_EQUITY, ...state.log.map(l => l.after)],
    dates: ['开局', ...state.log.map(l => l.date)],
  };
}
