#!/usr/bin/env node
// 把全站题库抽成《庙算》的统一题库：games/statecraft/data/questions/{bank,cards,index}.json
//
//   node scripts/statecraft/extract-questions.mjs          # 生成
//   node scripts/statecraft/extract-questions.mjs --check  # 只检查是否过期（CI 用），过期则退出码 1
//
// 来源（全部只读，不改原文件）：
//   1. games/<slug>/index.html   —— 11 部纪年页游的 DATA（执行页面里的 Component 类取出，不用正则拆 JS）
//   2. 国关复习/mfipe-data.js     —— 《货币与金融的国际政治经济学》14 章名词/简答/论述（闪卡）
//   3. quiz-questions.js          —— 政治学 + IPE 模拟卷（填空可拆的转挖空题，其余闪卡）
//   4. games/statecraft/data/authored/*.js —— 无页游的两章（FDI、区域合作）按速查卡补写
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'games/statecraft/data/questions');
const C = await import(pathToFileURL(path.join(ROOT, 'games/statecraft/data/concepts.js')));
const CHECK = process.argv.includes('--check');

// 章节自动判分题的最低数量：必背/重难点 ≥ 20，其余 ≥ 8。低于即视为「重点未覆盖」，生成失败。
const MIN_AUTO = { must: 20, hard: 20, supp: 8, extra: 0, pol: 20 };

const GAME_ORDER = ['fx-reserves', 'fx-rate', 'rmb-intl', 'gold-std', 'bretton', 'center-periphery',
  'monetary-tools', 'crisis-history', 'us-hegemony', 'deglobalization', 'cycles'];

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// ── 1. 纪年页游
function loadGameData(slug) {
  const file = path.join(ROOT, 'games', slug, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${slug}: 找不到 <script type="text/x-dc">`);
  const stubReact = { createRef: () => ({ current: null }) };
  const Comp = new Function('DCLogic', 'React', `${m[1]}\n;return Component;`)(class { constructor(p) { this.props = p; } }, stubReact);
  const inst = new Comp({});
  const data = inst.DATA;
  if (!Array.isArray(data)) throw new Error(`${slug}: DATA 不是数组`);
  return data;
}

// 各页游题型 → 统一题型。返回数组（timed 会展开成多道单选）。
function normalizeGameItem(it) {
  const base = { q: it.q, scene: it.scene || undefined, hint: it.hint || undefined, w: it.w || '', s: it.s || '', sr: it.sr || '' };
  switch (it.t) {
    case 'choice': return [{ ...base, t: 'choice', o: it.o, a: it.a }];
    case 'tf': return [{ ...base, t: 'tf', a: !!it.a }];
    case 'multi': return [{ ...base, t: 'multi', o: it.o, a: it.a }];
    case 'cloze': {
      // 两种写法：p 数组，或 text 里用【0】【1】标空位（危机纪年等几部）
      const p = Array.isArray(it.p) ? it.p
        : String(it.text || '').split(/【(\d+)】/).map((seg, i) => (i % 2 ? Number(seg) : seg)).filter(x => x !== '');
      return [{ ...base, t: 'cloze', p, b: it.b, d: it.d || [] }];
    }
    case 'bins': case 'scale': return [{ ...base, t: 'bins', bn: it.bn, c: it.c }];
    case 'flow': case 'order': return [{ ...base, t: 'order', o: it.o }];
    case 'decision': return [{ ...base, t: 'decision', o: it.o }];
    case 'dial': return [{ ...base, t: 'dial', zone: it.zone, labels: it.labels || [], unit: it.unit || '' }];
    case 'timed': return (it.rounds || []).map(r => ({ ...base, t: 'choice', q: r.q, o: r.o, a: r.a, scene: undefined, hint: `数字闪电战 · ${it.q}` }));
    default: throw new Error(`未知题型 ${it.t}`);
  }
}

// ── 2. mfipe-data.js
function loadMfipe() {
  const src = fs.readFileSync(path.join(ROOT, '国关复习/mfipe-data.js'), 'utf8');
  return new Function(`${src}\n;return TOPICS;`)();
}
function mfipeChapter(title) {
  for (const [re, id] of C.MFIPE_TOPIC_RULES) if (re.test(title)) return id;
  return 'general';
}

// ── 3. quiz-questions.js
function loadQuiz() {
  const src = fs.readFileSync(path.join(ROOT, 'quiz-questions.js'), 'utf8');
  return new Function(`${src}\n;return questions;`)();
}
const splitAnswers = s => String(s).split(/、/).map(x => x.trim()).filter(Boolean);

// 干扰项要「像」答案才有区分度：优先同尾字（…型/…性/…制）、同首字、长度相近的其他填空答案。
// 纯确定性（按 id 哈希打破平局），保证 --check 可复现。
function pickDistractors(id, ans, pool) {
  const avg = ans.reduce((n, a) => n + a.length, 0) / ans.length;
  const tails = new Set(ans.map(a => a.slice(-1))), heads = new Set(ans.map(a => a[0]));
  const isNum = ans.every(a => /^[\d.%～~\-—年月]+$/.test(a));
  const seed = parseInt(fnv(id), 36);
  const scored = pool
    .filter(c => !ans.includes(c) && c.length <= 24 && !ans.some(a => a.includes(c) || c.includes(a)))
    .filter(c => !isNum || /^[\d.%～~\-—年月]+$/.test(c))
    .map((c, i) => ({ c, score: (tails.has(c.slice(-1)) ? 3 : 0) + (heads.has(c[0]) ? 1 : 0) - Math.abs(c.length - avg) / 3 + ((seed + i * 7919) % 97) / 1000 }))
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, Math.min(4, ans.length + 1)).map(x => x.c);
}

function quizToItem(q, pool) {
  const w = [q.explanation, q.memorization].filter(Boolean).join('\n');
  if (q.category === '填空题') {
    const parts = q.question.split(/_{2,}/);
    const ans = splitAnswers(q.answer);
    if (parts.length > 1 && ans.length === parts.length - 1 && ans.every(a => a.length <= 40)) {
      const p = [];
      parts.forEach((seg, i) => { if (seg) p.push(seg); if (i < ans.length) p.push(i); });
      return { t: 'cloze', q: '补全填空', p, b: ans, d: pickDistractors(q.id, ans, pool), w, s: q.memorization || '', sr: q.source || q.category };
    }
  }
  const kind = { '名词解释': '名', '简答题': '简', '论述题': '论', '填空题': '填', '学术人物': '人' }[q.category] || '卡';
  const answer = [q.answer, q.explanation && q.explanation !== q.answer ? `\n**解析**：${q.explanation}` : '', q.memorization ? `\n**记忆**：${q.memorization}` : ''].join('');
  return { t: 'card', kind, q: q.question, answer, s: q.memorization || '', sr: q.source || q.category };
}

// ── 打标签
const ECON = C.CONCEPTS.filter(c => c.chapter !== 'politics');
const POL = C.CONCEPTS.filter(c => c.chapter === 'politics');
function textOf(it) {
  const opts = Array.isArray(it.o) ? it.o.map(o => (typeof o === 'string' ? o : o.t)).join(' ') : '';
  const bins = it.c ? it.c.map(c => c.t).join(' ') : '';
  const prompt = Array.isArray(it.p) ? it.p.filter(x => typeof x === 'string').join('') : '';
  return [it.q, it.scene, prompt, opts, bins, it.w, it.s, it.answer, Array.isArray(it.b) ? it.b.join(' ') : ''].filter(Boolean).join(' ');
}
// 题目的「名词标题」：闪卡取题干，IPE 填空取【】里的词。归章时标题命中优先于全文投票。
function titleOf(it) {
  const p = Array.isArray(it.p) ? it.p.filter(x => typeof x === 'string').join('') : '';
  const m = (it.q + p).match(/【([^】]+)】/);
  return m ? m[1] : it.q;
}
function tag(it, chapter) {
  const text = textOf(it);
  const pool = chapter === 'politics' ? POL : ECON;
  const set = new Set(C.CHAPTER_BASE[chapter] || []);
  for (const c of pool) if (c.re.test(text)) set.add(c.id);
  return [...set];
}
// 题干本身命中的概念（比「同章」更贴题）：召对抽题时优先
function keywords(it, chapter) {
  const head = [it.q, Array.isArray(it.p) ? it.p.filter(x => typeof x === 'string').join('') : '', Array.isArray(it.o) ? it.o.map(o => (typeof o === 'string' ? o : o.t)).join(' ') : ''].join(' ');
  const pool = chapter === 'politics' ? POL : ECON;
  return pool.filter(c => c.re.test(head)).map(c => c.id);
}
// 应试元问题（问章节结构、题型分值、答题套路）只进档案馆，不用于召对
const META_RE = /全章|真题|题型|考场|殿试|采分|答题|几道|[名简论]\s*[×x]\s*\d|章节定位|卷[一二三四五六七八九十\d]|口诀填空|记忆口诀/;
// 宽泛概念（几乎每道货币题都会提到汇率、危机）只在没有更具体命中时才参与归章
const BROAD = new Set(['fx-regime', 'crisis', 'center-periphery', 'reserves']);
function voteChapter(it) {
  const title = titleOf(it);
  const specific = ECON.find(c => !BROAD.has(c.id) && c.re.test(title)) || ECON.find(c => c.re.test(title));
  if (specific) return specific.chapter;
  const text = textOf(it);
  const score = {};
  for (const c of ECON) if (c.re.test(text)) score[c.chapter] = (score[c.chapter] || 0) + (BROAD.has(c.id) ? 0.5 : 1);
  let best = 'general', bestN = 0;
  for (const c of ECON) { const n = score[c.chapter] || 0; if (n > bestN) { best = c.chapter; bestN = n; } }
  return best;
}

// ── 组装
const bank = [], cards = [];
const seen = new Set();
function push(item) {
  item.kw = keywords(item, item.chapter);
  if (item.t !== 'card' && META_RE.test(item.q + ' ' + (item.scene || ''))) item.meta = true;
  if (seen.has(item.id)) item.id = `${item.id}.${fnv(JSON.stringify(item))}`;
  if (seen.has(item.id)) return; // 真重复（同源同题）：只留一条
  seen.add(item.id);
  (item.t === 'card' ? cards : bank).push(item);
}

const sources = [];
for (const slug of GAME_ORDER) {
  const data = loadGameData(slug);
  const ch = C.chapterById[slug];
  let n = 0;
  data.forEach((vol, ci) => {
    vol.items.forEach(raw => {
      for (const it of normalizeGameItem(raw)) {
        const id = `g.${slug}.${fnv(it.t + it.q + JSON.stringify(it.o || it.p || it.bn || ''))}`;
        push({ id, src: slug, from: `${ch.gameTitle} · ${vol.num}卷「${vol.title}」`, link: `/games/${slug}/`,
          chapter: slug, level: ch.level, concepts: tag(it, slug), ...it });
        n++;
      }
    });
  });
  sources.push({ id: slug, label: `${ch.gameTitle}（games/${slug}）`, items: n });
}

for (const mod of ['fdi', 'regional', 'politics']) {
  const { default: A } = await import(pathToFileURL(path.join(ROOT, `games/statecraft/data/authored/${mod}.js`)));
  const ch = C.chapterById[A.chapter];
  let n = 0;
  for (const sec of A.sections) for (const raw of sec.items) for (const it of normalizeGameItem(raw)) {
    push({ id: `a.${A.chapter}.${fnv(it.t + it.q)}`, src: `authored-${A.chapter}`, from: `${ch.label} · ${sec.title}（据速查卡补写）`,
      link: ch.card ? `/国关复习/${ch.card}` : ch.page, chapter: A.chapter, level: ch.level, concepts: tag(it, A.chapter), ...it });
    n++;
  }
  sources.push({ id: `authored-${A.chapter}`, label: `${ch.label}（据 ${A.source} 补写）`, items: n });
}

{
  let n = 0;
  for (const topic of loadMfipe()) {
    const chapter = mfipeChapter(topic.title);
    const ch = C.chapterById[chapter];
    for (const sec of topic.sections) for (const q of sec.questions) {
      const it = { t: 'card', kind: q.tag || '卡', q: q.title, answer: q.answer, s: '', sr: `${topic.title.replace(/^\S+\s*/, '')} · ${sec.title}` };
      push({ id: `m.${fnv(topic.title + q.title)}`, src: 'mfipe', from: `复习笔记 · ${sec.title}`, link: '/国关复习/mfipe-mindmap.html',
        chapter, level: ch.level, concepts: tag(it, chapter), ...it });
      n++;
    }
  }
  sources.push({ id: 'mfipe', label: '国关复习/mfipe-data.js（翟东升课程 14 章名词·简答·论述）', items: n });
}

{
  const Q = loadQuiz();
  const pools = {
    pol: [...new Set(Q.filter(q => q.category === '填空题' && !q.id.startsWith('ipe')).flatMap(q => splitAnswers(q.answer)))],
    ipe: [...new Set(Q.filter(q => q.category === '填空题' && q.id.startsWith('ipe')).flatMap(q => splitAnswers(q.answer)))],
  };
  let n = 0;
  for (const q of Q) {
    const isIpe = q.id.startsWith('ipe');
    const it = quizToItem(q, isIpe ? pools.ipe : pools.pol);
    if (it.t === 'cloze') it.q = isIpe ? `补全：${(q.question.match(/【([^】]+)】/) || [, '名词'])[1]}` : '补全填空';
    const chapter = isIpe ? voteChapter(it) : 'politics';
    const ch = C.chapterById[chapter];
    push({ id: `q.${q.id}`, src: 'quiz', from: isIpe ? `IPE 模拟卷 · ${q.category}` : `政治学 · ${q.category}`, link: '/quiz.html',
      chapter, level: ch.level, concepts: tag(it, chapter), ...it });
    n++;
  }
  sources.push({ id: 'quiz', label: 'quiz-questions.js（政治学 + IPE 模拟卷）', items: n });
}

// ── 覆盖统计
const byChapter = {}, byConcept = {};
for (const ch of C.CHAPTERS) byChapter[ch.id] = { auto: 0, cards: 0, types: {} };
for (const c of C.CONCEPTS) byConcept[c.id] = { auto: 0, cards: 0 };
for (const it of [...bank, ...cards]) {
  const k = it.t === 'card' ? 'cards' : 'auto';
  byChapter[it.chapter][k]++;
  byChapter[it.chapter].types[it.t] = (byChapter[it.chapter].types[it.t] || 0) + 1;
  for (const c of it.concepts) byConcept[c][k]++;
}

const errors = [];
for (const ch of C.CHAPTERS) {
  const s = byChapter[ch.id];
  if (s.auto < MIN_AUTO[ch.level]) errors.push(`章节「${ch.label}」自动判分题只有 ${s.auto} 道，要求 ≥ ${MIN_AUTO[ch.level]}（${C.LEVEL_LABEL[ch.level]}）`);
}
for (const c of C.CONCEPTS) if (byConcept[c.id].auto + byConcept[c.id].cards === 0) errors.push(`概念「${c.label}」(${c.id}) 没有命中任何题目`);

const index = {
  note: '由 scripts/statecraft/extract-questions.mjs 生成，勿手改。',
  total: { auto: bank.length, cards: cards.length, meta: bank.filter(it => it.meta).length },
  sources, byChapter, byConcept,
};

const files = {
  'bank.json': JSON.stringify({ items: bank }),
  'cards.json': JSON.stringify({ items: cards }),
  'index.json': JSON.stringify(index, null, 1) + '\n',
};

console.log(`自动判分 ${bank.length} 道 · 闪卡 ${cards.length} 张`);
for (const s of sources) console.log(`  ${String(s.items).padStart(4)}  ${s.label}`);
console.log('章节覆盖（自动判分 / 闪卡）:');
for (const ch of C.CHAPTERS) {
  const s = byChapter[ch.id];
  console.log(`  ${C.LEVEL_LABEL[ch.level].padEnd(3, '　')} ${ch.label.padEnd(12, '　')} ${String(s.auto).padStart(4)} / ${String(s.cards).padStart(3)}`);
}
if (errors.length) {
  console.error('\n覆盖不达标：\n  ' + errors.join('\n  '));
  process.exit(1);
}

if (CHECK) {
  const stale = Object.entries(files).filter(([f, body]) => {
    const p = path.join(OUT_DIR, f);
    return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== body;
  }).map(([f]) => f);
  if (stale.length) { console.error(`\n题库已过期：${stale.join(', ')}。请运行 node scripts/statecraft/extract-questions.mjs`); process.exit(1); }
  console.log('\n题库是最新的。');
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(OUT_DIR, f), body);
  const kb = f => (fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(0) + 'KB';
  console.log(`\n已写入 ${Object.keys(files).map(f => `${f} ${kb(f)}`).join(' · ')}`);
}
