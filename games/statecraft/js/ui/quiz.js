// 召对题卡：支持题库里的全部 8 种自动判分题型 + 闪卡。纪年页游的原题原样呈现。
import { html, useState, useMemo } from '../../vendor/htm-preact.js';
import { grade, shuffle } from '../quiz/bank.js';
import { chapterById, LEVEL_LABEL } from '../../data/concepts.js';

const KEYS = '甲乙丙丁戊己庚辛';

export function QuizCard({ item, onDone, compact }) {
  const [ans, setAns] = useState(null);
  const [result, setResult] = useState(null);
  const seed = useMemo(() => Math.floor(Math.random() * 1e9), [item.id]);
  const submit = a => {
    if (result) return;
    const r = grade(item, a);
    setAns(a); setResult(r);
    onDone && onDone(r.correct, item);
  };
  const ch = chapterById[item.chapter];
  return html`
    <div class="quiz" aria-live="polite">
      <div class="src">
        <span><span class="lvl">${LEVEL_LABEL[item.level]}</span> · ${ch ? ch.label : ''}</span>
        <span>${item.from}</span>
      </div>
      ${item.scene && !compact ? html`<p class="scene">${item.scene}</p>` : null}
      ${item.t !== 'cloze' || item.q !== '补全填空' ? html`<div class="qq">${item.q}</div>` : html`<div class="qq">补全填空</div>`}
      ${item.hint ? html`<div class="hint">提示：${item.hint}</div>` : null}
      <${Body} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />
      ${result ? html`<${Verdict} item=${item} result=${result} />` : null}
    </div>`;
}

function Body({ item, seed, result, ans, submit }) {
  switch (item.t) {
    case 'choice': return html`<${Choice} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />`;
    case 'tf': return html`<${TF} item=${item} result=${result} ans=${ans} submit=${submit} />`;
    case 'multi': return html`<${Multi} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    case 'cloze': return html`<${Cloze} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    case 'bins': return html`<${Bins} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    case 'order': return html`<${Order} item=${item} seed=${seed} result=${result} submit=${submit} />`;
    case 'decision': return html`<${Decision} item=${item} seed=${seed} result=${result} ans=${ans} submit=${submit} />`;
    case 'dial': return html`<${Dial} item=${item} result=${result} submit=${submit} />`;
    default: return html`<p>（暂不支持的题型：${item.t}）</p>`;
  }
}

function Choice({ item, seed, result, ans, submit }) {
  const order = useMemo(() => shuffle(item.o.map((_, i) => i), seed), [item.id]);
  return html`<div class="choices" role="group">
    ${order.map((i, k) => {
      const cls = result ? (i === item.a ? 'right' : i === ans ? 'wrong' : '') : '';
      return html`<button class=${'choice ' + cls} disabled=${!!result} onClick=${() => submit(i)}><span class="k">${KEYS[k]}</span><span>${item.o[i]}</span></button>`;
    })}
  </div>`;
}

function TF({ item, result, ans, submit }) {
  return html`<div class="choices" style="grid-template-columns:1fr 1fr">
    ${[true, false].map(v => {
      const cls = result ? (v === item.a ? 'right' : v === ans ? 'wrong' : '') : '';
      return html`<button class=${'choice ' + cls} disabled=${!!result} onClick=${() => submit(v)}><span class="k">${v ? '✓' : '✗'}</span><span>${v ? '对' : '错'}</span></button>`;
    })}
  </div>`;
}

function Multi({ item, seed, result, submit }) {
  const order = useMemo(() => shuffle(item.o.map((_, i) => i), seed), [item.id]);
  const [sel, setSel] = useState([]);
  const toggle = i => setSel(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i]));
  return html`<div class="choices">
      ${order.map((i, k) => {
        const on = sel.includes(i);
        const cls = result ? (item.a.includes(i) ? 'right' : on ? 'wrong' : '') : '';
        return html`<button class=${'choice ' + cls} aria-pressed=${on} disabled=${!!result} onClick=${() => toggle(i)}><span class="k">${on ? '■' : '□'}</span><span>${item.o[i]}</span></button>`;
      })}
    </div>
    ${!result ? html`<div class="quiz-actions"><button class="btn primary small" disabled=${!sel.length} onClick=${() => submit(sel)}>确认（多选）</button></div>` : null}`;
}

function Cloze({ item, seed, result, submit }) {
  const chips = useMemo(() => shuffle([...item.b, ...(item.d || [])].map((v, id) => ({ v, id })), seed), [item.id]);
  const blanks = item.b.length;
  const [fill, setFill] = useState(Array(blanks).fill(null)); // 每个空位放的 chip id
  const used = new Set(fill.filter(x => x != null));
  const put = id => { const k = fill.indexOf(null); if (k < 0) return; const f = fill.slice(); f[k] = id; setFill(f); };
  const pull = k => { if (result) return; const f = fill.slice(); f[k] = null; setFill(f); };
  const val = id => chips.find(c => c.id === id)?.v;
  return html`
    <div class="cloze-text">
      ${item.p.map(seg => typeof seg === 'number'
        ? html`<span class=${'slot ' + (fill[seg] != null ? 'filled ' : '') + (result ? (val(fill[seg]) === item.b[seg] ? 'right' : 'wrong') : '')}
            role="button" tabindex="0" onClick=${() => pull(seg)} onKeyDown=${e => e.key === 'Enter' && pull(seg)}>${fill[seg] != null ? val(fill[seg]) : '　'}</span>`
        : seg)}
    </div>
    ${!result ? html`
      <div class="chips">${chips.map(c => html`<button class="chip" disabled=${used.has(c.id)} onClick=${() => put(c.id)}>${c.v}</button>`)}</div>
      <div class="quiz-actions">
        <button class="btn primary small" disabled=${fill.includes(null)} onClick=${() => submit(fill.map(val))}>确认</button>
        <button class="btn small" onClick=${() => setFill(Array(blanks).fill(null))}>清空</button>
        <span class="muted" style="font-size:12px">点字块依次填空，点空位可撤回</span>
      </div>` : null}`;
}

function Bins({ item, seed, result, submit }) {
  const order = useMemo(() => shuffle(item.c.map((_, i) => i), seed), [item.id]);
  const [assign, setAssign] = useState({});
  const [held, setHeld] = useState(null);
  const drop = b => { if (held == null || result) return; setAssign(a => ({ ...a, [held]: b })); setHeld(null); };
  const unplaced = order.filter(i => assign[i] == null);
  return html`
    ${!result ? html`<div class="chips">
      ${unplaced.map(i => html`<button class=${'chip' + (held === i ? ' sel' : '')} onClick=${() => setHeld(held === i ? null : i)}>${item.c[i].t}</button>`)}
      ${!unplaced.length ? html`<span class="muted" style="font-size:12px">全部放好了</span>` : null}
    </div>` : null}
    <div class="bins" style=${{ gridTemplateColumns: item.bn.length > 3 ? 'repeat(auto-fit,minmax(140px,1fr))' : `repeat(${item.bn.length},1fr)` }}>
      ${item.bn.map((b, bi) => html`<div class=${'bin' + (held != null ? ' target' : '')} role="button" tabindex="0" onClick=${() => drop(bi)} onKeyDown=${e => e.key === 'Enter' && drop(bi)}>
        <h5>${b}</h5>
        ${order.filter(i => assign[i] === bi).map(i => html`<button class="chip" style=${result ? { borderColor: item.c[i].b === bi ? 'var(--verdigris)' : 'var(--cinnabar)', borderStyle: 'solid' } : null}
          onClick=${e => { e.stopPropagation(); if (!result) setAssign(a => { const n = { ...a }; delete n[i]; return n; }); }}>${item.c[i].t}</button>`)}
      </div>`)}
    </div>
    ${!result ? html`<div class="quiz-actions">
      <button class="btn primary small" disabled=${unplaced.length > 0} onClick=${() => submit(item.c.map((_, i) => assign[i]))}>确认</button>
      <span class="muted" style="font-size:12px">先点字块，再点它该去的栏</span>
    </div>` : null}`;
}

function Order({ item, seed, result, submit }) {
  const pool = useMemo(() => shuffle(item.o.slice(), seed), [item.id]);
  const [seq, setSeq] = useState([]);
  return html`
    <div class="order-list">
      ${seq.map((v, k) => html`<button class=${'choice ' + (result ? (v === item.o[k] ? 'right' : 'wrong') : '')} disabled=${!!result} onClick=${() => setSeq(seq.slice(0, k))}><span class="k">${k + 1}</span><span>${v}</span></button>`)}
    </div>
    ${!result ? html`
      <div class="chips">${pool.filter(v => !seq.includes(v)).map(v => html`<button class="chip" onClick=${() => setSeq([...seq, v])}>${v}</button>`)}</div>
      <div class="quiz-actions">
        <button class="btn primary small" disabled=${seq.length !== item.o.length} onClick=${() => submit(seq)}>确认顺序</button>
        <span class="muted" style="font-size:12px">按先后依次点选；点已排好的一项可从那里重排</span>
      </div>` : null}`;
}

function Decision({ item, seed, result, ans, submit }) {
  const order = useMemo(() => shuffle(item.o.map((_, i) => i), seed), [item.id]);
  return html`<div class="choices">
    ${order.map((i, k) => {
      const o = item.o[i];
      const cls = result ? (o.ok ? 'right' : i === ans ? 'wrong' : '') : '';
      return html`<button class=${'choice ' + cls} disabled=${!!result} onClick=${() => submit(i)}>
        <span class="k">${KEYS[k]}</span><span>${o.t}${result && (i === ans || o.ok) ? html`<span class="muted" style="display:block;font-size:12.5px;margin-top:4px">${o.oc}</span>` : null}</span>
      </button>`;
    })}
  </div>`;
}

function Dial({ item, result, submit }) {
  const [v, setV] = useState(50);
  return html`<div class="dial-q">
    <div class="num" style="font-size:22px;text-align:center">${v}${item.unit ? html`<small> ${item.unit}</small>` : null}</div>
    <input type="range" min="0" max="100" step="0.5" value=${v} disabled=${!!result} onInput=${e => setV(Number(e.target.value))} aria-label="刻度" />
    <div class="ticks">${(item.labels || []).map(l => html`<span>${l}</span>`)}</div>
    ${!result ? html`<div class="quiz-actions"><button class="btn primary small" onClick=${() => submit(v)}>定在这里</button></div>` : null}
  </div>`;
}

function Verdict({ item, result }) {
  return html`<div class=${'verdict ' + (result.correct ? 'ok' : 'no')}>
    <b>${result.correct ? '答对了。' : '不对。'}</b>${!result.correct && result.expected ? html` 正确答案：${result.expected}` : null}
    ${item.w ? html`<div style="margin-top:6px">${item.w}</div>` : null}
    ${item.s ? html`<span class="s">考点 · ${item.s}</span>` : null}
    ${item.link ? html`<span class="s">出处 · <a href=${item.link} target="_blank" rel="noopener">${item.from}</a></span>` : null}
  </div>`;
}

// 闪卡：名词解释 / 简答 / 论述——先回忆，再翻开，自己打分
export function FlashCard({ item, onDone }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const ch = chapterById[item.chapter];
  const kindLabel = { 名: '名词解释', 简: '简答', 论: '论述', 节: '要点', 填: '填空', 人: '学术人物' }[item.kind] || '问答';
  return html`<div class="quiz">
    <div class="src"><span><span class="lvl">${LEVEL_LABEL[item.level]}</span> · ${ch ? ch.label : ''} · ${kindLabel}</span><span>${item.from}</span></div>
    <div class="qq">${item.q}</div>
    ${!open ? html`<div class="quiz-actions"><button class="btn primary small" onClick=${() => setOpen(true)}>先在心里答一遍，再翻开</button></div>`
      : html`<div class="card-answer">${renderMd(item.answer)}</div>
        ${done == null ? html`<div class="quiz-actions">
          <span class="muted" style="font-size:12.5px">你答出了多少？</span>
          <button class="btn small" onClick=${() => { setDone(1); onDone && onDone(true, item); }}>基本答全</button>
          <button class="btn small" onClick=${() => { setDone(0); onDone && onDone(false, item); }}>漏了要点</button>
        </div>` : html`<div class="verdict ${done ? 'ok' : 'no'}"><b>${done ? '已记为掌握。' : '已加入复习。'}</b></div>`}`}
  </div>`;
}

// 极简 markdown：**粗体**、行首 - 列表、换行
function renderMd(md) {
  return md.split('\n').map(line => {
    const li = /^\s*[-*]\s+/.test(line);
    const parts = line.replace(/^\s*[-*]\s+/, '').split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? html`<b>${p}</b>` : p));
    return html`<div style=${li ? { paddingLeft: '1em', textIndent: '-1em' } : null}>${li ? '· ' : ''}${parts}</div>`;
  });
}
