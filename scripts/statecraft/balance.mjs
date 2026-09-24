#!/usr/bin/env node
// 《庙算》平衡测试：用几种「玩家策略」各跑 N 局完整游戏（与浏览器走同一条 game.js 路径），
// 统计结局分布、危机触发率、事件可达性，并按预设目标给出 PASS/FAIL。
//   node scripts/statecraft/balance.mjs            # 默认每种策略 400 局
//   node scripts/statecraft/balance.mjs --n 2000   # 更多局
//   node scripts/statecraft/balance.mjs --smoke    # CI：每种 60 局，只检查不崩溃、不出 NaN
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = p => pathToFileURL(path.join(ROOT, 'games/statecraft', p)).href;
const { default: EVENTS } = await import(G('data/events.js'));
const { default: SC } = await import(G('data/scenario-tide.js'));
const game = await import(G('js/sim/game.js'));
const { ending } = await import(G('js/sim/endings.js'));
const { makeRng } = await import(G('js/sim/rng.js'));
const { GROUPS } = await import(G('js/sim/defs.js'));

const args = process.argv.slice(2);
const SMOKE = args.includes('--smoke');
const N = SMOKE ? 60 : Number(args[args.indexOf('--n') + 1]) || 400;
const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// 选项打分：推演两季后的局面（「得算」玩家才能用）
const score = f => f ? f.legit + 0.25 * f.conf + 0.02 * f.reserves - (f.forcedFloat ? 25 : 0) - (f.over && f.over !== 'term' ? 60 : 0) : -1e9;

const STRATEGIES = {
  // 随手点：随机选项，偶尔随机调政令
  random: {
    pick: (S, ev, rng) => rng.pick(ev.options.map((o, i) => i).filter(i => game.optionAvailable(S, ev.options[i]))),
    desk: (S, rng) => {
      if (rng.chance(0.25)) {
        const key = rng.pick(['fxRegime', 'capOpen', 'sterilize', 'fiscal', 'press', 'macropru']);
        const vals = { fxRegime: ['peg', 'managed', 'float'], capOpen: [0, 1, 2], sterilize: [0, 50, 100], fiscal: [-1, 0, 1], press: ['open', 'guided', 'controlled'], macropru: [0, 1, 2] }[key];
        S = game.setPolicy(S, key, rng.pick(vals)).S;
      }
      if (rng.chance(0.3)) S = game.setDial(S, 'rate', S.eco.i + rng.pick([-0.5, 0.5])).S;
      return S;
    },
  },
  // 民粹：只看选项带来的即时支持度（不召对、不推演），财政永远扩张
  populist: {
    pick: (S, ev) => {
      let best = -1, bestV = -1e9;
      ev.options.forEach((o, i) => {
        if (!game.optionAvailable(S, o)) return;
        const v = o.effects.reduce((n, e) => n + (e.path && e.path.startsWith('soc.groups.') ? e.add || 0 : 0) + (e.path === 'soc.national' ? (e.add || 0) * 0.5 : 0), 0);
        if (v > bestV) { bestV = v; best = i; }
      });
      return best;
    },
    desk: S => (S.pol.fiscal < 1 ? game.setPolicy(S, 'fiscal', 1).S : S),
  },
  // 得算：每个事件都召对成功、看推演再拍板；政令不动
  oracle: {
    pick: (S, ev) => {
      const fc = game.forecastOptions(S, ev, SC);
      let best = 0;
      fc.forEach((f, i) => { if (score(f) > score(fc[best])) best = i; });
      return best;
    },
    desk: S => S,
  },
  // 教科书：得算 + 按课程逻辑主动管理政令（放水期冲销、控外债、资本账户不过度开放；收水期灵活汇率、利率跟上）
  textbook: {
    pick: (S, ev) => STRATEGIES.oracle.pick(S, ev),
    desk: S => {
      const ph = S.world.phase;
      if (S.pol.macropru < 2 && S.pc >= 1) S = game.setPolicy(S, 'macropru', 2).S;
      if (S.pol.capOpen > 1 && S.pc >= 2) S = game.setPolicy(S, 'capOpen', 1).S;
      if ((ph === 'fangshui' || ph === 'chuipao') && S.pol.sterilize < 100) S = game.setPolicy(S, 'sterilize', 100).S;
      if ((ph === 'shoushui' || ph === 'shouge') && S.pol.sterilize > 50) S = game.setPolicy(S, 'sterilize', 50).S;
      if (S.eco.pi > 4) S = game.setDial(S, 'rate', S.eco.i + 0.5).S;
      else if (S.eco.g < 4.5 && S.eco.i > 2) S = game.setDial(S, 'rate', S.eco.i - 0.5).S;
      if (S.eco.i > 8 && S.eco.conf > 45) S = game.setDial(S, 'rate', S.eco.i - 2).S;   // 危机加息后回落
      if (S.pol.press !== 'open' && S.pc >= 3) S = game.setPolicy(S, 'press', 'open').S;
      return S;
    },
  },
};

function playOne(strategy, seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  let S = game.newGame(SC, EVENTS, seed);
  const seen = [];
  let guard = 0;
  while (!S.over && guard++ < 100) {
    while (S.queue.length) {
      const id = S.queue[0];
      seen.push(id);
      const idx = strategy.pick(S, byId[id], rng);
      S = game.chooseOption(S, EVENTS, id, idx).S;
    }
    S = strategy.desk(S, rng);
    S = game.endQuarter(S, EVENTS, SC);
    for (const row of [S.hist.rows.at(-1)]) {
      for (const [k, v] of Object.entries(row)) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`seed ${seed} Q${row.q}: ${k} = ${v}`);
    }
  }
  const end = ending(S);
  const rows = S.hist.rows;
  return {
    end: end.id, legit: S.legit, seen, forced: !!S.flags.forcedFloat, burst: !!S.flags.burst,
    minRes: Math.min(...rows.map(r => r.reserves)), maxBubble: Math.max(...rows.map(r => r.bubble)),
    quarters: rows.length - 1, groupsMin: Math.min(...GROUPS.map(g => S.soc.groups[g.id])),
  };
}

const pct = (n, d) => `${(100 * n / d).toFixed(0)}%`.padStart(4);
const out = {};
for (const [name, strat] of Object.entries(STRATEGIES)) {
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(playOne(strat, 1000 + i * 7919));
  const ends = {};
  for (const r of runs) ends[r.end] = (ends[r.end] || 0) + 1;
  const evFreq = {};
  for (const r of runs) for (const id of new Set(r.seen)) evFreq[id] = (evFreq[id] || 0) + 1;
  out[name] = { runs, ends, evFreq };
  const avg = k => (runs.reduce((n, r) => n + r[k], 0) / runs.length).toFixed(1);
  const q = p => { const a = runs.map(r => r.legit).sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))].toFixed(1); };
  console.log(`\n■ ${name.padEnd(9)} 合法性 p10/p50/p90 ${q(.1)}/${q(.5)}/${q(.9)} · 被迫浮动 ${pct(runs.filter(r => r.forced).length, N)} · 泡沫破裂 ${pct(runs.filter(r => r.burst).length, N)} · 外储谷底均值 ${avg('minRes')}`);
  console.log('  结局：' + Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, N)}`).join(' · '));
}

// 事件可达性（跨全部策略）
const allRuns = Object.values(out).flatMap(o => o.runs);
const reach = {};
for (const r of allRuns) for (const id of new Set(r.seen)) reach[id] = (reach[id] || 0) + 1;
console.log('\n■ 事件出现率（全部策略）');
console.log('  ' + EVENTS.map(e => `${e.id} ${pct(reach[e.id] || 0, allRuns.length)}`).join(' · '));

// 目标：得算/教科书明显优于随手点与民粹；每张卡都能出现；危机卡在一个合理区间
const good = s => ((out[s].ends.stood || 0) + (out[s].ends.survived || 0)) / N;
const bad = s => ['default', 'street', 'palace', 'ousted', 'harvested'].reduce((n, k) => n + (out[s].ends[k] || 0), 0) / N;
const poor = s => bad(s) + ['lame', 'naked', 'iron'].reduce((n, k) => n + (out[s].ends[k] || 0), 0) / N;
const targets = [
  ['教科书「潮退而立」≥ 35%', (out.textbook.ends.stood || 0) / N >= 0.35],
  ['得算的好结局率 > 随手点 + 15 个百分点', good('oracle') > good('random') + 0.15],
  ['教科书的坏结局 ≤ 10%', bad('textbook') <= 0.10],
  ['随手点的差结局（下台/违约/被收割/跛脚/裸泳/铁幕）在 20%–60%', poor('random') >= 0.20 && poor('random') <= 0.60],
  ['随手点「潮退而立」≤ 15%', (out.random.ends.stood || 0) / N <= 0.15],
  ['民粹不优于得算', good('populist') <= good('oracle')],
  ['每张常规事件卡出现率 ≥ 3%（后果卡 ≥ 0.5%）', EVENTS.every(e => (reach[e.id] || 0) / allRuns.length >= (e.scheduledOnly ? 0.005 : 0.03))],
  ['外储保卫战出现率在 15%–75%', (reach.attack || 0) / allRuns.length >= 0.15 && (reach.attack || 0) / allRuns.length <= 0.75],
];
console.log('\n■ 平衡目标');
for (const [label, ok] of targets) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
if (SMOKE) { console.log('\nsmoke：全部对局跑完，无 NaN / 异常。'); process.exit(0); }
process.exit(targets.every(t => t[1]) ? 0 : 1);
