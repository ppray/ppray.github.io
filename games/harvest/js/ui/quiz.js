// 召对：答对一道真题，才能看到下一回合的推演线索。
// 题库来自《庙算》抽好的全站题库（翟东升课程 14 章 + 政治学原理）。
// 这里只支持可即时判分的题型；bins/order/dial 交互太重，抽题时直接过滤掉。
import { html, useState, useMemo } from '../../vendor/htm-preact.js';
import { grade, shuffle, record } from '../quiz/bank.js';

export const SUPPORTED = new Set(['choice', 'tf', 'multi', 'decision', 'cloze']);
const LEVEL_LABEL = { must: '必背', hard: '重难点', supp: '一般', extra: '补充', pol: '政治学' };

export function QuizCard({ item, onDone, onSkip }) {
  const [ans, setAns] = useState(null);
  const [result, setResult] = useState(null);
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), [item.id]);
  const submit = a => {
    if (result) return;
    const r = grade(item, a);
    setAns(a); setResult(r);
    record(item, r.correct);
    onDone && onDone(r.correct, item);
  };
  return html`
    <div class="quiz" aria-live="polite">
      <div class="src">
        <span>${LEVEL_LABEL[item.level] || ''} · ${item.from || ''}</span>
        ${onSkip ? html`<button class="btn ghost small" onClick=${onSkip}>跳过</button>` : null}
      </div>
      <div class="qq">${item.q}</div>
      ${item.hint ? html`<div class="hint">提示：${item.hint}</div>` : null}
      <${Body} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />
      ${result ? html`<${Verdict} item=${item} result=${result} />` : null}
    </div>`;
}

function Body({ item, seed, result, ans, submit }) {
  switch (item.t) {
    case 'choice': return html`<${Pick} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />`;
    case 'decision': return html`<${Pick} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />`;
    case 'tf': return html`<${TF} result=${result} ans=${ans} submit=${submit} />`;
    case 'multi': return html`<${Multi} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    case 'cloze': return html`<${Cloze} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    default: return html`<div class="faint">暂不支持的题型：${item.t}</div>`;
  }
}

function Pick({ item, seed, result, ans, submit }) {
  const order = useMemo(() => shuffle(item.o.map((_, i) => i), seed), [item.id, seed]);
  return html`<div>
    ${order.map(i => {
      const isAns = ans === i;
      const ok = result && item.t === 'decision' ? !!item.o[i].ok : result && i === item.a;
      const cls = result ? (ok ? 'opt right' : isAns ? 'opt wrong' : 'opt') : isAns ? 'opt sel' : 'opt';
      return html`<button key=${i} class=${cls} disabled=${!!result} onClick=${() => submit(i)}>${item.o[i].t || item.o[i]}</button>`;
    })}
  </div>`;
}

function TF({ result, ans, submit }) {
  return html`<div class="row">
    <button class=${result ? (true === 'x' ? 'opt' : 'opt') : ans === true ? 'opt sel' : 'opt'} disabled=${!!result} onClick=${() => submit(true)}>对</button>
    <button class=${ans === false ? 'opt sel' : 'opt'} disabled=${!!result} onClick=${() => submit(false)}>错</button>
  </div>`;
}

function Multi({ item, seed, result, submit }) {
  const [sel, setSel] = useState([]);
  const order = useMemo(() => shuffle(item.o.map((_, i) => i), seed), [item.id, seed]);
  const toggle = i => { if (result) return; setSel(sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i]); };
  return html`<div>
    ${order.map(i => html`
      <button key=${i} class=${result ? ((item.a || []).includes(i) ? 'opt right' : sel.includes(i) ? 'opt wrong' : 'opt') : sel.includes(i) ? 'opt sel' : 'opt'}
        disabled=${!!result} onClick=${() => toggle(i)}>${item.o[i].t || item.o[i]}</button>`)}
    ${result ? null : html`<button class="btn small brass mt" disabled=${!sel.length} onClick=${() => submit(sel)}>交卷</button>`}
  </div>`;
}

function Cloze({ item, seed, result, submit }) {
  const [vals, setVals] = useState(item.b.map(() => ''));
  const blanks = (item.p || '').split(/【\d+】/);
  const pool = useMemo(() => shuffle([...(item.d || []), ...item.b], seed), [item.id, seed]);
  const fill = v => {
    if (result) return;
    const i = vals.findIndex(x => !x);
    if (i < 0) return;
    const next = vals.slice(); next[i] = v; setVals(next);
  };
  const undo = () => { if (result) return; const i = vals.findIndex(x => !x); if (i <= 0) return; const next = vals.slice(); next[i - 1] = ''; setVals(next); };
  return html`<div>
    <div class="qq" style="margin-bottom:8px">
      ${blanks.map((s, i) => html`<span key=${i}>${s}${i < blanks.length - 1
        ? html`<span class="num" style="border-bottom:1px solid var(--brass);padding:0 6px;color:var(--brass-2)">${vals[i] || '　　'}</span>`
        : null}</span>`)}
    </div>
    ${result ? null : html`<div class="row">
      ${pool.map((v, i) => html`<button key=${i} class="btn small" onClick=${() => fill(v)}>${v}</button>`)}
      <button class="btn small ghost" onClick=${undo}>退格</button>
      <button class="btn small primary" disabled=${vals.some(v => !v)} onClick=${() => submit(vals)}>交卷</button>
    </div>`}
  </div>`;
}

function Verdict({ item, result }) {
  return html`<div class="verdict-line">
    ${result.correct
      ? html`<b>答对了。</b> 推演已解锁。`
      : html`<b>答错了。</b> 正确答案：${result.expected}。这一回合只能靠你自己判断。`}
    ${item.w ? html`<div class="why">${item.w}</div>` : null}
  </div>`;
}
