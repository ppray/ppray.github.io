// 档案馆：全站题库按章节上架。每章可以抽 10 题练习（自动判分题 + 闪卡），进度跨局保存。
import { html, useState, useEffect, useMemo } from '../../vendor/htm-preact.js';
import { CHAPTERS, LEVEL_LABEL } from '../../data/concepts.js';
import { loadBank, loadCards, loadIndex, shuffle, record } from '../quiz/bank.js';
import { store } from '../store.js';
import { QuizCard, FlashCard } from './quiz.js';

export function Archive({ onBack }) {
  const [idx, setIdx] = useState(null);
  const [bank, setBank] = useState(null);
  const [cards, setCards] = useState(null);
  const [session, setSession] = useState(null);
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    loadIndex().then(setIdx).catch(e => setErr(e.message));
    loadBank().then(setBank).catch(e => setErr(e.message));
    loadCards().then(setCards).catch(() => setCards([]));
  }, []);
  const prog = useMemo(() => store.progress(), [tick, session]);
  const mastery = ch => {
    if (!bank) return 0;
    const items = bank.filter(it => it.chapter === ch);
    const ok = items.filter(it => prog[it.id] && prog[it.id].last === 1).length;
    return items.length ? ok / items.length : 0;
  };
  const start = ch => {
    const auto = shuffle(bank.filter(it => it.chapter === ch.id)).slice(0, 8);
    const fc = shuffle((cards || []).filter(it => it.chapter === ch.id)).slice(0, auto.length < 8 ? 10 - auto.length : 2);
    setSession({ ch, items: shuffle([...auto, ...fc]), i: 0, ok: 0, answered: false });
  };
  if (session) {
    const it = session.items[session.i];
    const next = () => (session.i + 1 < session.items.length ? setSession({ ...session, i: session.i + 1, answered: false }) : setSession({ ...session, done: true }));
    const onDone = (correct, item) => { record(item, correct); setSession(s => ({ ...s, ok: s.ok + (correct ? 1 : 0), answered: true })); setTick(t => t + 1); };
    return html`<div class="overlay" style="position:relative;background:none;backdrop-filter:none;min-height:100vh">
      <article class="paper practice">
        <div class="doc-head"><span>档案馆 · ${session.ch.label}</span><span>${session.done ? '完' : `${session.i + 1} / ${session.items.length}`}</span></div>
        ${session.done ? html`
          <h2 class="doc-title">本轮 ${session.ok} / ${session.items.length}</h2>
          <p class="muted">答错与「漏了要点」的题会在召对和下次练习中更常出现。</p>
          <div class="quiz-actions"><button class="btn" onClick=${() => setSession(null)}>回书架</button><button class="btn primary" onClick=${() => start(session.ch)}>再来一轮</button></div>`
        : html`
          ${it.t === 'card' ? html`<${FlashCard} key=${it.id} item=${it} onDone=${onDone} />` : html`<${QuizCard} key=${it.id} item=${it} onDone=${onDone} />`}
          <div class="quiz-actions" style="justify-content:space-between">
            <button class="btn small" onClick=${() => setSession(null)}>回书架</button>
            <button class="btn primary small" disabled=${!session.answered} onClick=${next}>${session.i + 1 < session.items.length ? '下一题 →' : '交卷'}</button>
          </div>`}
      </article>
    </div>`;
  }
  return html`<div class="archive">
    <div class="eyebrow">Archive · 题库</div>
    <h1>档案馆</h1>
    <p class="muted" style="max-width:720px">《庙算》召对用的全部题目都在这里：11 部纪年页游的原题、翟东升课程 14 章的名词·简答·论述、政治学与 IPE 模拟卷，以及为 FDI、区域合作两章补写的新题。
      ${idx ? html`共 <b class="num">${idx.total.auto}</b> 道自动判分题、<b class="num">${idx.total.cards}</b> 张问答闪卡。` : ''}</p>
    ${err ? html`<p class="down">加载失败：${err}</p>` : null}
    <div class="shelf">${CHAPTERS.map(ch => {
      const c = idx && idx.byChapter[ch.id];
      const m = mastery(ch.id);
      return html`<button class="volume" disabled=${!bank} onClick=${() => start(ch)}>
        <div class=${'lvl ' + ch.level}>${LEVEL_LABEL[ch.level]}${ch.freq ? ' · 考过 ' + ch.freq : ''}</div>
        <h3>${ch.label}</h3>
        <div class="cnt">${c ? `${c.auto} 道题 · ${c.cards} 张闪卡` : '…'}${ch.gameTitle ? ` · 源自《${ch.gameTitle}》` : ''}</div>
        <div class="prog"><b style=${{ width: `${m * 100}%` }}></b></div>
        <div class="cnt" style="margin-top:4px">已掌握 ${Math.round(m * 100)}%</div>
      </button>`;
    })}</div>
    <div class="quiz-actions" style="margin-top:24px"><button class="btn" onClick=${onBack}>← 返回</button></div>
  </div>`;
}
