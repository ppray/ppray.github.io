#!/usr/bin/env node
// 《填空连击》题库构建：games/cloze-combo/bank/*.mjs → games/cloze-combo/bank.json
//
//   node scripts/cloze-combo/build.mjs          # 校验并生成
//   node scripts/cloze-combo/build.mjs --check  # 只校验、并检查 bank.json 是否过期（CI 用），不通过退出码 1
//   node scripts/cloze-combo/build.mjs --draft  # 写题途中用：缺章节文件、考点没覆盖只警告，照样生成
//
// 题库只从 10 套模拟卷出题，不取任何页游的题：
//   bank/syllabus.mjs —— 137 道题面 → 考点（复习笔记的题号 / 名词词条）
//   bank/<章节>.mjs   —— 手写的挖空题，每道用 cover 标出覆盖哪些考点；内容取自复习笔记的「考场标准作答」与名词定义
// 校验三层，任何一层不过都不写文件：
//   1. 考纲 ↔ 复习笔记：笔记的每道题都要有题面指向它，名词组里的每个词都要在 TERMS 里，题量与 62/45/30 一致；
//   2. 题目本身：空位顺序、词卡上限、干扰项不与答案重合、可互换空位组合法、id 唯一；
//   3. 覆盖：每道题面的每个考点至少有一道题。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANK_DIR = path.join(ROOT, 'games/cloze-combo/bank');
const OUT = path.join(ROOT, 'games/cloze-combo/bank.json');
// 复习笔记的正文在页面的 <script id="md-source"> 里（同名 .md 是预渲染脚本从这里同步出去的副本），直接读源头
const NOTES_HTML = path.join(ROOT, '国关复习/翟东升《货币与金融的国际政治经济学》复习笔记.html');
const NOTES_URL = '/国关复习/翟东升《货币与金融的国际政治经济学》复习笔记.html';
const CHECK = process.argv.includes('--check');
const DRAFT = !CHECK && process.argv.includes('--draft');
const MAX_CHIPS = 11; // 键盘 1…0、- 一共 11 个键
const TYPE_LABEL = { 名: '名词', 简: '简答', 论: '论述' };

const S = await import(pathToFileURL(path.join(BANK_DIR, 'syllabus.mjs')));

// ── 复习笔记：节锚点与每道题的标题
function parseNotes(md) {
  const anchors = new Set();
  const heads = new Map(); // '<节 key>.<题号>' → { type, title, line }
  const keyOfAnchor = new Map(Object.entries(S.SECTIONS).map(([k, a]) => [a, k]));
  let sec = null;
  md.split('\n').forEach((l, i) => {
    const a = l.match(/^#{2,3} <a id="([^"]+)"><\/a>/);
    if (a) { anchors.add(a[1]); sec = keyOfAnchor.get(a[1]) || null; return; }
    const h = l.match(/^#### (?:\*\*)?(\d+)\.\s*\[([名简论])\]\s*(.*?)(?:\*\*)?\s*$/);
    if (h && sec) heads.set(`${sec}.${h[1]}`, { type: h[2], title: h[3], line: i + 1 });
  });
  return { anchors, heads };
}
// 名词组标题 → 词条：按「/」拆，去掉「概念辨析：」、括注与句末标点
const normTerm = (t) => t.replace(/^概念辨析[:：]/, '').replace(/[（(][^）)]*[）)]/g, '').replace(/[\s。．.、]/g, '');
const termsOfHeading = (title) => title.split('/').map(normTerm).filter(Boolean)
  .flatMap((t) => S.TERM_ALIASES[t] || [t]);

function validateSyllabus(notes) {
  const errors = [];
  for (const [k, a] of Object.entries(S.SECTIONS)) if (!notes.anchors.has(a)) errors.push(`SECTIONS.${k}：复习笔记里没有锚点 #${a}`);
  const chSections = S.CHAPTERS.flatMap((c) => c.sections);
  for (const k of Object.keys(S.SECTIONS)) if (!chSections.includes(k)) errors.push(`笔记节 ${k} 没有归到任何章节`);

  const count = { 名: 0, 简: 0, 论: 0 };
  const keyOwners = new Map(); // 考点 key → 题面列表
  for (const [paper, list] of Object.entries(S.PAPERS)) {
    list.forEach((row, n) => {
      const [type, text, ...keys] = Array.isArray(row) ? row : [];
      const tag = `卷${paper} 第${n + 1}题「${String(text || '').slice(0, 16)}」`;
      if (!TYPE_LABEL[type] || typeof text !== 'string' || !text) { errors.push(`${tag}：题型或题面缺失`); return; }
      count[type]++;
      if (!keys.length) errors.push(`${tag}：没有标考点`);
      for (const key of keys) {
        if (type === '名') {
          const term = key.startsWith('名:') ? key.slice(2) : null;
          if (!term || !S.TERMS[term]) errors.push(`${tag}：名词题的考点应是 TERMS 里的「名:<词条>」，实际是 ${key}`);
          if (keys.length !== 1) errors.push(`${tag}：名词题只能有一个考点`);
        } else {
          const head = key.split('.').slice(0, 2).join('.');
          const h = notes.heads.get(head);
          if (!h) errors.push(`${tag}：考点 ${key} 指向的笔记题 ${head} 不存在`);
          else if (h.type === '名') errors.push(`${tag}：简答/论述题的考点 ${key} 指向了名词题 ${head}`);
        }
        if (!keyOwners.has(key)) keyOwners.set(key, []);
        keyOwners.get(key).push({ paper, type, text });
      }
    });
  }
  for (const t of Object.keys(count)) if (count[t] !== S.PAPER_COUNTS[t]) errors.push(`题量不对：${TYPE_LABEL[t]} ${count[t]} 道，应为 ${S.PAPER_COUNTS[t]} 道`);

  // TERMS ↔ 笔记名词组
  for (const [term, heads] of Object.entries(S.TERMS)) {
    if (!keyOwners.has(`名:${term}`)) errors.push(`TERMS.${term}：没有任何题面考它`);
    for (const head of heads) {
      const h = notes.heads.get(head);
      if (!h) { errors.push(`TERMS.${term}：笔记题 ${head} 不存在`); continue; }
      if (h.type === '名' && !termsOfHeading(h.title).includes(term)) errors.push(`TERMS.${term}：笔记 ${head}「${h.title}」里没有这个词`);
    }
  }
  for (const [head, h] of notes.heads) {
    if (h.type === '名') {
      for (const term of termsOfHeading(h.title)) {
        if (!S.TERMS[term]) errors.push(`笔记 ${head}（第 ${h.line} 行）的名词「${term}」不在 TERMS 里`);
        else if (!S.TERMS[term].includes(head)) errors.push(`TERMS.${term} 漏了笔记 ${head}`);
      }
    } else if (![...keyOwners.keys()].some((k) => k === head || k.startsWith(`${head}.`))) {
      errors.push(`笔记 ${head}（第 ${h.line} 行）「${h.title.slice(0, 24)}」没有题面指向它`);
    }
  }
  return { valid: errors.length === 0, errors, keyOwners };
}

// ── 题目：声明式规则，每条 [判定, 出错说明]
const isStrArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x.length > 0);
const slotsOf = (it) => (Array.isArray(it.p) ? it.p.filter(Number.isInteger) : []);
const ITEM_RULES = [
  [(it) => typeof it.id === 'string' && /^[a-z0-9][a-z0-9.-]*$/.test(it.id), () => 'id 必须是手写的小写字母、数字、点、连字符'],
  [(it) => typeof it.q === 'string' && it.q.length > 0, () => '缺少题干 q'],
  [(it) => typeof it.s === 'string' && it.s.length > 0, () => '缺少记忆点 s'],
  [(it) => isStrArr(it.b), () => '答案 b 必须是非空字符串数组'],
  [(it) => Array.isArray(it.p) && it.p.every((x) => (typeof x === 'string' && x.length > 0) || Number.isInteger(x)), () => '题面 p 只能由非空字符串和整数空位组成'],
  [(it) => { const s = slotsOf(it); return s.length === it.b.length && s.every((v, k) => v === k); },
    (it) => `空位应按 0…${it.b.length - 1} 从左到右各出现一次，实际是 [${slotsOf(it).join(',')}]`],
  [(it) => it.d == null || isStrArr(it.d), () => '干扰项 d 必须是非空字符串数组'],
  [(it) => !(it.d || []).some((x) => it.b.includes(x)), (it) => `干扰项与答案重合：${(it.d || []).filter((x) => it.b.includes(x)).join('、')}`],
  [(it) => new Set(it.d || []).size === (it.d || []).length, () => '干扰项有重复'],
  [(it) => it.b.length + (it.d || []).length <= MAX_CHIPS, (it) => `答案 ${it.b.length} + 干扰项 ${(it.d || []).length} 超过 ${MAX_CHIPS} 张词卡`],
  [(it) => it.g == null || (Array.isArray(it.g) && it.g.every((grp) => Array.isArray(grp) && grp.length >= 2 && grp.every((k) => Number.isInteger(k) && k >= 0 && k < it.b.length))
    && new Set(it.g.flat()).size === it.g.flat().length), (it) => `可互换空位组 g 不合法（每组至少两个、在 0…${it.b.length - 1} 之内、不能重复）`],
  [(it) => Array.isArray(it.cover) && it.cover.length > 0 && it.cover.every((k) => typeof k === 'string'), () => '缺少 cover（覆盖的考点 key）'],
  [(it) => it.hint == null || typeof it.hint === 'string', () => 'hint 只能是字符串'],
  [(it) => it.w == null || typeof it.w === 'string', () => '解析 w 只能是字符串'],
];
function validateItem(it) {
  if (!it || typeof it !== 'object') return { valid: false, errors: ['题目不是对象'] };
  const errors = [];
  for (const [ok, msg] of ITEM_RULES) {
    let pass = false;
    try { pass = !!ok(it); } catch (e) { pass = false; }
    if (!pass) { errors.push(msg(it)); if (!Array.isArray(it.b) || !Array.isArray(it.p)) break; }
  }
  return { valid: errors.length === 0, errors };
}

// 题目的出处标签：覆盖到的题面按卷号排，例如「卷2 简答 · 卷8 论述」
function fromLabel(cover, keyOwners) {
  const seen = new Map();
  for (const k of cover) for (const o of keyOwners.get(k) || []) seen.set(`${o.paper}|${o.type}`, o);
  const list = [...seen.values()].sort((a, b) => a.paper.localeCompare(b.paper) || '名简论'.indexOf(a.type) - '名简论'.indexOf(b.type));
  return list.map((o) => `卷${Number(o.paper)} ${TYPE_LABEL[o.type]}`).join(' · ');
}

function readNotesSource() {
  const m = fs.readFileSync(NOTES_HTML, 'utf8').match(/<script type="text\/markdown" id="md-source">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${path.relative(ROOT, NOTES_HTML)}：找不到 <script type="text/markdown" id="md-source">`);
  return m[1];
}

async function build() {
  const errors = [], warnings = [];
  const notes = parseNotes(readNotesSource());
  const syl = validateSyllabus(notes);
  errors.push(...syl.errors.map((e) => `考纲：${e}`));

  const items = [];
  const ids = new Set();
  for (const ch of S.CHAPTERS) {
    const file = path.join(BANK_DIR, `${ch.id}.mjs`);
    if (!fs.existsSync(file)) { (DRAFT ? warnings : errors).push(`章节 ${ch.id}：缺少题库文件 bank/${ch.id}.mjs`); continue; }
    const { default: list } = await import(pathToFileURL(file));
    if (!Array.isArray(list)) { errors.push(`bank/${ch.id}.mjs：默认导出应是数组`); continue; }
    for (const it of list) {
      const tag = `bank/${ch.id}.mjs ${it && it.id ? it.id : '(无 id)'}`;
      const r = validateItem(it);
      if (!r.valid) { errors.push(...r.errors.map((e) => `${tag}：${e}`)); continue; }
      if (ids.has(it.id)) errors.push(`${tag}：id 重复`);
      ids.add(it.id);
      for (const k of it.cover) if (!syl.keyOwners.has(k)) errors.push(`${tag}：cover 里的 ${k} 不是任何题面的考点`);
      // 复查清单（不算错）：答案原样出现在题干或题面里，多半是把答案写漏在提示里了
      const text = it.q + it.p.filter((x) => typeof x === 'string').join('');
      const leaked = [...new Set(it.b)].filter((a) => a.length >= 2 && text.includes(a));
      if (leaked.length) warnings.push(`${it.id}：答案「${leaked.join('、')}」出现在题面里`);
      const near = (it.d || []).filter((x) => it.b.some((a) => a !== x && (a.includes(x) || x.includes(a))));
      if (near.length) warnings.push(`${it.id}：干扰项「${near.join('、')}」与答案互相包含，确认它在任何口径下都不对`);
      const sec = S.CHAPTERS.find((c) => c.id === ch.id).sections[0];
      items.push({
        id: it.id, chapter: ch.id, kind: it.kind === 'order' ? 'order' : 'cloze',
        from: fromLabel(it.cover, syl.keyOwners), link: `${NOTES_URL}#${S.SECTIONS[sec]}`,
        q: it.q, ...(it.hint ? { hint: it.hint } : {}), p: it.p, b: it.b, d: it.d || [], ...(it.g ? { g: it.g } : {}),
        s: it.s, w: it.w || '', cover: it.cover,
      });
    }
  }

  // 覆盖：每道题面的每个考点至少一道题
  const covered = new Set(items.flatMap((it) => it.cover));
  const missing = [...syl.keyOwners.keys()].filter((k) => !covered.has(k));
  for (const k of missing) {
    const o = syl.keyOwners.get(k)[0];
    (DRAFT ? warnings : errors).push(`覆盖：考点 ${k} 没有题（卷${o.paper} ${TYPE_LABEL[o.type]}「${o.text.slice(0, 20)}」）`);
  }

  const papersOf = (chId) => {
    const secs = S.CHAPTERS.find((c) => c.id === chId).sections;
    const keyChapter = (k) => (k.startsWith('名:') ? null : k.split('.')[0]);
    let n = 0;
    for (const list of Object.values(S.PAPERS)) for (const [, , ...keys] of list) {
      const own = keys.some((k) => {
        if (k.startsWith('名:')) return items.some((it) => it.chapter === chId && it.cover.includes(k));
        return secs.includes(keyChapter(k));
      });
      if (own) n++;
    }
    return n;
  };
  const out = {
    note: '由 scripts/cloze-combo/build.mjs 从 games/cloze-combo/bank/*.mjs 生成，勿手改。题目只取自 10 套模拟卷的题面与复习笔记的考场标准作答。',
    total: { items: items.length, blanks: items.reduce((n, it) => n + it.b.length, 0), papers: Object.keys(S.PAPERS).length,
      questions: Object.values(S.PAPERS).reduce((n, l) => n + l.length, 0), points: syl.keyOwners.size },
    chapters: S.CHAPTERS.filter((c) => !DRAFT || items.some((it) => it.chapter === c.id)).map((c) => ({ id: c.id, label: c.label, link: `${NOTES_URL}#${S.SECTIONS[c.sections[0]]}`, papers: papersOf(c.id) })),
    items,
  };
  return { valid: errors.length === 0, errors, warnings, out, missing };
}

const r = await build();
const body = JSON.stringify(r.out);
console.log(`《填空连击》题库：${r.out.total.items} 题 · ${r.out.total.blanks} 个空 · 覆盖 ${r.out.total.points - r.missing.length}/${r.out.total.points} 个考点（${r.out.total.questions} 道题面）`);
for (const c of r.out.chapters) {
  const list = r.out.items.filter((it) => it.chapter === c.id);
  console.log(`  ${c.label.padEnd(12, '　')} ${String(list.length).padStart(3)} 题 ${String(list.reduce((n, it) => n + it.b.length, 0)).padStart(4)} 空`);
}
if (r.warnings.length && !CHECK) console.log(`\n复查清单（不算错）：\n  ${r.warnings.join('\n  ')}`);
if (!r.valid) {
  console.error(`\n校验不通过（${r.errors.length} 条）：\n  ${r.errors.join('\n  ')}`);
  process.exit(1);
}
if (CHECK) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== body) {
    console.error('\nbank.json 已过期，请运行 node scripts/cloze-combo/build.mjs');
    process.exit(1);
  }
  console.log('\nbank.json 是最新的。');
} else {
  fs.writeFileSync(OUT, body);
  console.log(`\n已写入 ${path.relative(ROOT, OUT)}（${(fs.statSync(OUT).size / 1024).toFixed(0)}KB）`);
}
