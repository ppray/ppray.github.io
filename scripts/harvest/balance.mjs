// 《猎潮》平衡测试：用脚本把每种打法各跑 N 局，看收益分布是否讲道理。
//
// 期望（PASS 目标）：
//   空仓          ≈ 100（不亏不赚，作为基准线）
//   满仓常驻      < 完美时机（无脑梭哈不该是最优解）
//   完美时机      ≥ 190（够得着「秃鹫」）
//   全关无 NaN、无负权益
//
// 用法：node scripts/harvest/balance.mjs [--smoke]
import { LEVELS } from '../../games/harvest/data/levels/index.js';
import { newGame, setStep, advance, equity, summary, freeMargin } from '../../games/harvest/js/sim/model.js';
import { MAX_STEP, UNIT, MARGIN_RATE } from '../../games/harvest/js/sim/defs.js';

const N = process.argv.includes('--smoke') ? 30 : 300;

// 各打法：接收 (state, level, round) 返回 {toolId: step}
const STRATS = {
  空仓: () => ({}),
  半仓常驻: (st, L) => Object.fromEntries(L.tools.map(t => [t.id, 3])),
  满仓梭哈: (st, L) => {
    // 保证金允许范围内尽可能满：先给第一个工具，剩余给第二个
    const out = {}; L.tools.forEach(t => out[t.id] = 0);
    let free = freeMargin(st, L);
    for (const t of L.tools) {
      const can = Math.min(MAX_STEP, Math.floor(free / (UNIT * MARGIN_RATE)));
      if (can <= 0) break;
      out[t.id] = can; free -= can * UNIT * MARGIN_RATE;
    }
    return out;
  },
  完美时机: (st, L) => {
    // 事后诸葛：只在本回合对该工具有利时持仓，且尽可能重
    const out = {};
    const rd = L.rounds[st.round];
    for (const t of L.tools) {
      if (st.round < (t.open || 0)) { out[t.id] = 0; continue; }
      const gain = t.dir * (rd.mv[t.id] || 0);
      out[t.id] = gain > 0.05 ? MAX_STEP : gain > 0.015 ? 3 : 0;
    }
    // 保证金不够时从后往前砍
    let used = Object.entries(out).reduce((s, [, v]) => s + v, 0) * UNIT * MARGIN_RATE;
    const eq = equity(st);
    for (const t of [...L.tools].reverse()) {
      if (used <= eq) break;
      const cut = Math.min(out[t.id], Math.ceil((used - eq) / (UNIT * MARGIN_RATE)));
      out[t.id] -= cut; used -= cut * UNIT * MARGIN_RATE;
    }
    return out;
  },
  只押主力: (st, L) => Object.fromEntries(L.tools.map((t, i) => [t.id, i === 0 ? MAX_STEP : 0])),
};

const rows = [];
let fail = 0;
for (const L of LEVELS) {
  const line = { 关卡: L.num + L.title };
  for (const [name, fn] of Object.entries(STRATS)) {
    let sum = 0, mn = Infinity, mx = -Infinity, bust = 0;
    for (let i = 0; i < N; i++) {
      const st = newGame(L, `b:${name}:${i}`);
      let guard = 0;
      while (st.round < L.rounds.length && guard++ < 50) {
        const want = fn(st, L, st.round);
        for (const t of L.tools) setStep(st, L, t.id, Math.max(0, Math.min(MAX_STEP, want[t.id] || 0)));
        advance(st, L);
      }
      const s = summary(st, L);
      if (!Number.isFinite(s.equity)) { console.log(`✗ ${L.id}/${name} 出现 NaN`); fail++; break; }
      sum += s.equity; mn = Math.min(mn, s.equity); mx = Math.max(mx, s.equity);
      if (st.busted || s.equity < 60) bust++;
    }
    line[name] = (sum / N).toFixed(0);
    line[name + '·区间'] = `${mn.toFixed(0)}–${mx.toFixed(0)}`;
    line[name + '·爆仓'] = `${((bust / N) * 100).toFixed(0)}%`;
  }
  rows.push(line);
}

console.log(`平衡测试：每关每策略 ${N} 局（单位：百万美元，起始 100）\n`);
console.log(['关卡', '空仓', '半仓常驻', '满仓梭哈', '完美时机', '只押主力'].join('\t'));
for (const r of rows) {
  console.log([r.关卡, r.空仓, r.半仓常驻, r.满仓梭哈, r.完美时机, r.只押主力].join('\t'));
}
console.log('\n区间与爆仓率：');
for (const r of rows) {
  console.log(`${r.关卡}\t梭哈 ${r['满仓梭哈·区间']}（爆仓 ${r['满仓梭哈·爆仓']}）\t完美 ${r['完美时机·区间']}（爆仓 ${r['完美时机·爆仓']}）\t主力 ${r['只押主力·区间']}（爆仓 ${r['只押主力·爆仓']}）`);
}

// PASS 目标
console.log('\n判定：');
for (const r of rows) {
  const ok1 = Math.abs(+r.空仓 - 100) < 1;
  const ok2 = +r.完美时机 >= 190;
  const ok3 = +r.满仓梭哈 < +r.完美时机;
  const pass = ok1 && ok2 && ok3;
  if (!pass) fail++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${r.关卡}  空仓=${r.空仓}（应≈100）  完美=${r.完美时机}（应≥190）  梭哈=${r.满仓梭哈}（应<完美）`);
}
console.log(fail ? `\n✗ ${fail} 项不达标` : '\n✓ 平衡达标');
process.exit(fail ? 1 : 0);
