#!/usr/bin/env node
// 《庙算》数据校验：事件、概念表、剧本、题库之间的引用完整性与字段合法性。
//   node scripts/statecraft/validate.mjs   → 打印 {valid, errors[]}，无效时退出码 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const G = p => pathToFileURL(path.join(ROOT, 'games/statecraft', p)).href;
const { default: EVENTS } = await import(G('data/events.js'));
const { default: SC } = await import(G('data/scenario-tide.js'));
const { CAST } = await import(G('data/cast.js'));
const C = await import(G('data/concepts.js'));
const { PATHS, POLICIES, GROUPS } = await import(G('js/sim/defs.js'));
const { validateCond, validateEffect } = await import(G('js/sim/effects.js'));

// 规则表：每个区块一个校验函数，统一返回 { valid, errors[] }
const result = (errors) => ({ valid: errors.length === 0, errors });

function checkConcepts() {
  const errors = [];
  const ids = new Set();
  for (const c of C.CONCEPTS) {
    if (ids.has(c.id)) errors.push(`概念 id 重复："${c.id}"`);
    ids.add(c.id);
    if (!C.chapterById[c.chapter]) errors.push(`概念 "${c.id}" 的 chapter "${c.chapter}" 不在 CHAPTERS 中`);
    if (!(c.re instanceof RegExp)) errors.push(`概念 "${c.id}" 缺少正则 re`);
  }
  for (const [ch, list] of Object.entries(C.CHAPTER_BASE)) {
    if (!C.chapterById[ch]) errors.push(`CHAPTER_BASE 里的章节 "${ch}" 不存在`);
    for (const id of list) if (!ids.has(id)) errors.push(`CHAPTER_BASE["${ch}"] 引用了不存在的概念 "${id}"`);
  }
  for (const ch of C.CHAPTERS) {
    if (!C.LEVEL_LABEL[ch.level]) errors.push(`章节 "${ch.id}" 的 level "${ch.level}" 无效，期望 ${Object.keys(C.LEVEL_LABEL).join('/')}`);
    if (ch.game && !fs.existsSync(path.join(ROOT, 'games', ch.game, 'index.html'))) errors.push(`章节 "${ch.id}" 指向的页游 games/${ch.game}/ 不存在`);
    if (ch.card && !fs.existsSync(path.join(ROOT, '国关复习', ch.card))) errors.push(`章节 "${ch.id}" 指向的速查卡 国关复习/${ch.card} 不存在`);
  }
  return result(errors);
}

const REQUIRED_EVENT = ['id', 'title', 'kind', 'advisor', 'window', 'concepts', 'text', 'mirror', 'options'];
function checkEvents() {
  const errors = [];
  const ids = new Set(EVENTS.map(e => e.id));
  if (ids.size !== EVENTS.length) errors.push('事件 id 有重复');
  const scheduled = new Set();
  for (const ev of EVENTS) for (const o of ev.options || []) for (const e of o.effects || []) if (e.schedule) scheduled.add(e.schedule);
  for (const ev of EVENTS) {
    const at = `事件「${ev.title || ev.id}」`;
    for (const k of REQUIRED_EVENT) if (ev[k] === undefined) errors.push(`${at}: 缺少字段 ${k}`);
    if (!['dilemma', 'crisis'].includes(ev.kind)) errors.push(`${at}: kind 应为 dilemma 或 crisis，收到 "${ev.kind}"`);
    if (!CAST[ev.advisor]) errors.push(`${at}: advisor "${ev.advisor}" 不在 cast.js 中`);
    if (!Array.isArray(ev.window) || ev.window.length !== 2 || ev.window[0] < 1 || ev.window[1] > SC.maxQ || ev.window[0] > ev.window[1])
      errors.push(`${at}: window ${JSON.stringify(ev.window)} 应为 [起, 止]，1 ≤ 起 ≤ 止 ≤ ${SC.maxQ}`);
    for (const c of ev.concepts || []) if (!C.conceptById[c]) errors.push(`${at}: 概念 "${c}" 不存在（见 data/concepts.js）`);
    if (ev.mirror) {
      for (const k of ['place', 'year', 'title', 'text', 'chapter']) if (!ev.mirror[k]) errors.push(`${at}: 历史镜鉴缺少 ${k}`);
      if (ev.mirror.chapter && !C.chapterById[ev.mirror.chapter]) errors.push(`${at}: 镜鉴章节 "${ev.mirror.chapter}" 不存在`);
    }
    validateCond(ev.when, `${at}.when`, errors);
    if (ev.scheduledOnly && !scheduled.has(ev.id)) errors.push(`${at}: 标记为 scheduledOnly，但没有任何选项预约它——永远不会出现`);
    const opts = ev.options || [];
    if (opts.length < 2 || opts.length > 6) errors.push(`${at}: 选项数 ${opts.length}，期望 2–6`);
    opts.forEach((o, i) => {
      const w = `${at} 选项${i + 1}「${o.label}」`;
      for (const k of ['label', 'desc', 'effects', 'reveal', 'review']) if (o[k] === undefined) errors.push(`${w}: 缺少字段 ${k}`);
      validateCond(o.when, `${w}.when`, errors);
      (o.effects || []).forEach((e, j) => validateEffect(e, `${w}.effects[${j}]`, errors, ids));
    });
    // 每个事件至少要有一个无条件可选的选项，否则可能卡死
    if (opts.length && opts.every(o => o.when)) errors.push(`${at}: 所有选项都带条件，可能出现无选项可选的死局`);
    for (const tok of (ev.text.match(/\{(\w+)\}/g) || [])) if (!['{name}', '{currency}', '{fed}', '{reserves}', '{fxDebt}', '{e}', '{weeks}'].includes(tok)) errors.push(`${at}: 正文占位符 ${tok} 未定义`);
  }
  return result(errors);
}

function checkScenario() {
  const errors = [];
  for (const [k, v] of Object.entries(SC.pol)) {
    const spec = PATHS[`pol.${k}`];
    if (!spec) errors.push(`剧本 pol.${k} 不是已登记的政令`);
    else if (!spec.values.includes(v)) errors.push(`剧本 pol.${k} = ${JSON.stringify(v)}，期望 ${JSON.stringify(spec.values)} 之一`);
  }
  for (const g of GROUPS) if (typeof SC.soc.groups[g.id] !== 'number') errors.push(`剧本缺少利益集团 "${g.id}" 的初始支持度`);
  for (const k of Object.keys(POLICIES)) if (!(k in SC.pol)) errors.push(`剧本缺少政令 "${k}" 的初始值`);
  if (SC.tide.hikeStart[1] > SC.maxQ) errors.push(`加息起点上限 ${SC.tide.hikeStart[1]} 超过总季度 ${SC.maxQ}`);
  return result(errors);
}

// 题库：按题型声明必填字段与答案合法性
const ITEM_RULES = {
  choice: it => Array.isArray(it.o) && it.o.length >= 2 && Number.isInteger(it.a) && it.a >= 0 && it.a < it.o.length || '需要 o[≥2] 与合法下标 a',
  tf: it => typeof it.a === 'boolean' || 'a 应为布尔',
  multi: it => Array.isArray(it.o) && Array.isArray(it.a) && it.a.length >= 1 && it.a.every(i => Number.isInteger(i) && i < it.o.length) || '需要 o 与合法下标数组 a',
  cloze: it => Array.isArray(it.p) && Array.isArray(it.b) && it.p.filter(x => typeof x === 'number').length === it.b.length && it.p.filter(x => typeof x === 'number').every(i => i < it.b.length) || 'p 中空位数须等于 b 的长度',
  bins: it => Array.isArray(it.bn) && Array.isArray(it.c) && it.c.every(c => Number.isInteger(c.b) && c.b < it.bn.length) || 'c[].b 须指向 bn 的合法下标',
  order: it => Array.isArray(it.o) && it.o.length >= 2 || '需要 o[≥2]（按正确顺序）',
  decision: it => Array.isArray(it.o) && it.o.some(o => o.ok) || '需要至少一个 ok 选项',
  dial: it => Array.isArray(it.zone) && it.zone.length === 2 && it.zone[0] < it.zone[1] || 'zone 应为 [下限, 上限]',
  card: it => typeof it.answer === 'string' && it.answer.length > 0 || '闪卡缺少 answer',
};
function checkBank() {
  const errors = [];
  const dir = path.join(ROOT, 'games/statecraft/data/questions');
  const bank = JSON.parse(fs.readFileSync(path.join(dir, 'bank.json'), 'utf8')).items;
  const cards = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8')).items;
  const ids = new Set();
  for (const it of [...bank, ...cards]) {
    const at = `题目 ${it.id}`;
    if (ids.has(it.id)) errors.push(`${at}: id 重复`);
    ids.add(it.id);
    const rule = ITEM_RULES[it.t];
    if (!rule) { errors.push(`${at}: 未知题型 "${it.t}"`); continue; }
    const ok = rule(it);
    if (ok !== true) errors.push(`${at}（${it.t}）: ${ok}`);
    if (!it.q) errors.push(`${at}: 缺少题干 q`);
    if (!C.chapterById[it.chapter]) errors.push(`${at}: 章节 "${it.chapter}" 不存在`);
    for (const c of it.concepts || []) if (!C.conceptById[c]) errors.push(`${at}: 概念 "${c}" 不存在`);
  }
  // 事件挂的每个概念，题库里至少要有 3 道可自动判分的题，否则「召对」会抽不到题
  const byConcept = {};
  for (const it of bank) for (const c of it.concepts) byConcept[c] = (byConcept[c] || 0) + 1;
  for (const ev of EVENTS) for (const c of ev.concepts) if ((byConcept[c] || 0) < 3) errors.push(`事件「${ev.title}」的概念 "${c}" 在题库里只有 ${byConcept[c] || 0} 道自动判分题（需 ≥ 3）`);
  return result(errors);
}

const report = { concepts: checkConcepts(), events: checkEvents(), scenario: checkScenario(), bank: checkBank() };
const valid = Object.values(report).every(r => r.valid);
for (const [k, r] of Object.entries(report)) {
  console.log(`${r.valid ? '✓' : '✗'} ${k}${r.valid ? '' : `（${r.errors.length} 处）`}`);
  for (const e of r.errors.slice(0, 40)) console.log(`    - ${e}`);
}
console.log(JSON.stringify({ valid, errors: Object.values(report).flatMap(r => r.errors).length }));
process.exit(valid ? 0 : 1);
