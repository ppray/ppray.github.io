// 题库接入：复用《庙算》抽取好的全站题库（815 题，覆盖翟东升课程 14 章 + 政治学原理）。
// 抽题权重与《庙算》一致：没见过的 > 上次答错的 > 答对过的；本局问过的不再问。
//
// 为什么答对题才能看推演：这是备考游戏，不是纯爽游——你得先证明自己知道这个机制，
// 才有资格在牌桌上提前看到下一个回合。
import { store } from '../store.js';

// bank.js 在 /games/harvest/js/quiz/ → 上三级到 /games/，再进 statecraft 的题库目录
const BASE = new URL('../../../statecraft/data/questions/', import.meta.url);
let bankP = null;

export function loadBank() {
  if (!bankP) {
    bankP = fetch(new URL('bank.json', BASE))
      .then(r => { if (!r.ok) throw new Error(`题库加载失败：HTTP ${r.status}`); return r.json(); })
      .then(j => (j.items || []).filter(it => !it.meta));
  }
  return bankP;
}

const LEVEL_W = { must: 1.6, hard: 1.4, supp: 1.0, extra: 0.8, pol: 1.1 };
const TYPE_W = { choice: 1.2, tf: 1.0, multi: 1.0, decision: 1.1, cloze: 0.9, bins: 0.8, order: 0.8, dial: 0.7 };

export function pickQuestion(items, concepts, askedIds = new Set()) {
  const prog = store.progress();
  const want = new Set(concepts);
  const usable = items.filter(it => !askedIds.has(it.id));
  const cands = usable.filter(it => (it.concepts || []).some(c => want.has(c)));
  const pool = cands.length ? cands : usable;
  const weights = pool.map(it => {
    const p = prog[it.id];
    const fresh = !p ? 2.2 : p.last === 0 ? 2.8 : 0.5;
    const overlap = (it.concepts || []).filter(c => want.has(c)).length;
    const onPoint = (it.kw || []).filter(c => want.has(c)).length;
    return (LEVEL_W[it.level] || 1) * (TYPE_W[it.t] || 1) * fresh * (1 + 0.4 * overlap) * (onPoint ? 4 + 2 * onPoint : 1);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function shuffle(arr, seed = Math.random() * 1e9) {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function grade(it, ans) {
  switch (it.t) {
    case 'choice': return { correct: ans === it.a, expected: it.o[it.a] };
    case 'tf': return { correct: ans === it.a, expected: it.a ? '对' : '错' };
    case 'multi': {
      const want = [...it.a].sort().join(','), got = [...(ans || [])].sort().join(',');
      return { correct: want === got, expected: it.a.map(i => it.o[i]).join('、') };
    }
    case 'cloze': return { correct: Array.isArray(ans) && it.b.every((b, k) => ans[k] === b), expected: it.b.join(' / ') };
    case 'bins': return { correct: it.c.every((c, k) => ans && ans[k] === c.b), expected: it.bn.map((b, i) => `${b}：${it.c.filter(c => c.b === i).map(c => c.t).join('、')}`).join('；') };
    case 'order': return { correct: Array.isArray(ans) && ans.length === it.o.length && ans.every((v, k) => v === it.o[k]), expected: it.o.join(' → ') };
    case 'decision': return { correct: ans != null && !!it.o[ans]?.ok, expected: it.o.find(o => o.ok)?.t };
    case 'dial': return { correct: ans >= it.zone[0] && ans <= it.zone[1], expected: `${it.zone[0]}–${it.zone[1]}（${it.labels?.[1] || ''}）` };
    default: return { correct: false, expected: '' };
  }
}

export function record(it, correct) { store.recordAnswer(it.id, correct); }
