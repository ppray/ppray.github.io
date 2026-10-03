// 《猎潮》数据与内核自检：
//   1) 关卡结构完整（工具、回合、干预、复盘、出处告警）
//   2) 每回合的 mv 只引用本关存在的工具；每个工具在每个回合都有 mv 或可解释为 0
//   3) 每关至少两条 ⚠️ 出处告警、四条史实复盘（长官定下的硬规矩）
//   4) 内核不产生 NaN / 负权益穿底，评级分档闭合
// 用法：node scripts/harvest/validate.mjs
import { LEVELS } from '../../games/harvest/data/levels/index.js';
import { newGame, setStep, advance, equity, summary } from '../../games/harvest/js/sim/model.js';
import { TOOL_KINDS, MAX_STEP, GRADES } from '../../games/harvest/js/sim/defs.js';

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

const ids = new Set();
for (const L of LEVELS) {
  if (ids.has(L.id)) E(`关卡 id 重复：${L.id}`);
  ids.add(L.id);

  for (const f of ['num', 'title', 'year', 'place', 'concept', 'lesson', 'brief', 'crackdown', 'review', 'warnings'])
    if (!L[f]) E(`${L.id} 缺字段 ${f}`);

  // 工具
  const toolIds = new Set();
  for (const t of L.tools) {
    if (toolIds.has(t.id)) E(`${L.id} 工具 id 重复：${t.id}`);
    toolIds.add(t.id);
    if (!TOOL_KINDS[t.kind]) E(`${L.id}/${t.id} 工具类型未知：${t.kind}`);
    if (t.dir !== 1 && t.dir !== -1) E(`${L.id}/${t.id} dir 必须是 ±1`);
    if (!t.label || !t.hint) E(`${L.id}/${t.id} 缺 label/hint`);
    if (t.open != null && (t.open < 0 || t.open >= L.rounds.length)) E(`${L.id}/${t.id} open 越界：${t.open}`);
  }
  if (L.tools.length < 5) W(`${L.id} 工具少于 5 个`);

  // 回合
  if (L.rounds.length !== 7) W(`${L.id} 回合数 ${L.rounds.length}（约定 7）`);
  // 决策前的局势（不剧透）：缺了就会把结果先告诉玩家，游戏性直接没了
  if (!Array.isArray(L.scenes) || L.scenes.length !== L.rounds.length)
    E(`${L.id} scenes 数组必须存在且与回合数一致（${L.scenes?.length} vs ${L.rounds.length}）`);
  L.rounds.forEach((r, i) => {
    if (!r.date || !r.title || !r.wire) E(`${L.id} 回合 ${i} 缺 date/title/wire`);
    if (!r.mv) E(`${L.id} 回合 ${i} 缺 mv`);
    for (const k of Object.keys(r.mv || {})) if (!toolIds.has(k)) E(`${L.id} 回合 ${i} 的 mv 引用了不存在的工具 ${k}`);
    for (const t of L.tools) {
      if (t.open != null && i < t.open && (r.mv[t.id] || 0) !== 0) W(`${L.id} 回合 ${i}：${t.id} 未解锁却有价格变动`);
    }
    if (r.liq != null && (r.liq <= 0 || r.liq > 1)) E(`${L.id} 回合 ${i} liq 应在 (0,1]`);
  });

  // 干预
  for (const id of L.crackdown?.tools || []) if (!toolIds.has(id)) E(`${L.id} crackdown 引用了不存在的工具 ${id}`);
  if (L.crackdown && !(L.crackdown.factor > 0 && L.crackdown.factor < 1)) E(`${L.id} crackdown.factor 应在 (0,1)`);

  // 复盘与告警（长官的硬规矩）
  if ((L.review || []).length < 4) E(`${L.id} 史实复盘少于 4 条`);
  const w = (L.warnings || []).filter(x => x.startsWith('⚠️'));
  if (w.length < 2) E(`${L.id} ⚠️ 出处告警少于 2 条`);
  if (w.length !== (L.warnings || []).length) E(`${L.id} 存在未以 ⚠️ 开头的告警条目`);

  // 内核：四种策略各跑一局，检查不炸、不 NaN
  const strategies = {
    空仓: () => 0,
    半仓常驻: (t) => 3,
    满仓常驻: () => MAX_STEP,
    只做空主力: (t, L2) => (t.id === L2.tools[0].id ? MAX_STEP : 0),
  };
  for (const [name, fn] of Object.entries(strategies)) {
    const st = newGame(L, `v:${name}`);
    let guard = 0;
    while (st.round < L.rounds.length && guard++ < 50) {
      for (const t of L.tools) setStep(st, L, t.id, Math.min(MAX_STEP, fn(t, L) || 0));
      advance(st, L);
    }
    const s = summary(st, L);
    if (!Number.isFinite(s.equity)) E(`${L.id}/${name} 权益为 NaN`);
    if (s.equity < 0) E(`${L.id}/${name} 权益为负：${s.equity.toFixed(1)}`);
    if (s.curve.some(v => !Number.isFinite(v))) E(`${L.id}/${name} 曲线含 NaN`);
  }
}

// 评级分档闭合
for (let i = 1; i < GRADES.length; i++) {
  if (GRADES[i].min !== GRADES[i - 1].max) E(`评级分档在 ${GRADES[i].key} 处不闭合`);
}

console.log(`关卡：${LEVELS.length} 个：${LEVELS.map(l => l.num + l.title).join('、')}`);
for (const w of warns) console.log(`  提示 · ${w}`);
if (errors.length) {
  console.log(`\n✗ 校验未通过，${errors.length} 项：`);
  for (const e of errors) console.log(`  · ${e}`);
  process.exit(1);
}
console.log('\n✓ 全部校验通过');
