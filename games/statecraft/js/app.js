// 应用外壳：屏幕切换、游戏状态（不可变，每次操作返回新状态）、存档、题库懒加载。
import { html, useState, useEffect, useCallback } from '../vendor/htm-preact.js';
import SC from '../data/scenario-tide.js';
import EVENTS from '../data/events.js';
import { CAST } from '../data/cast.js';
import { newGame, chooseOption, setPolicy, setDial, revalue, endQuarter, outlook } from './sim/game.js';
import { store } from './store.js';
import { loadBank, pickQuestion, record } from './quiz/bank.js';
import { ensureIntel, recordIntel, spendToken, MINISTER_CONCEPTS } from './ui/intel.js';
import { Title, Setup, Help } from './ui/screens.js';
import { TopBar, Indicators, Groups, Cabinet, Decree, OutlookCard, TideMap } from './ui/desk.js';
import { EventDossier } from './ui/event.js';
import { QuarterReport } from './ui/report.js';
import { Ending } from './ui/ending.js';
import { Archive } from './ui/archive.js';
import { QuizCard } from './ui/quiz.js';
import { PHASES } from './sim/defs.js';

const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));

export function App() {
  const [screen, setScreen] = useState('title');
  const [S, setS] = useState(() => {
    const saved = store.loadGame();
    return saved && saved.v === 1 && !saved.over ? ensureIntel(saved) : null;
  });
  const [deskStart, setDeskStart] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [bank, setBank] = useState(null);
  const [bankErr, setBankErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [back, setBack] = useState('title');
  const [peek, setPeek] = useState(false);

  useEffect(() => { loadBank().then(setBank).catch(e => setBankErr(e.message)); }, []);
  useEffect(() => { if (S) store.saveGame(S); }, [S]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);
  // 事件处理完、回到桌面时，记下「本季政令起点」供撤销
  useEffect(() => { if (S && !S.over && S.queue && !S.queue.length && (!deskStart || deskStart.q !== S.q)) setDeskStart(S); }, [S]);

  const start = useCallback(({ name, mode, seed }) => {
    const g = ensureIntel(newGame(SC, EVENTS, seed, { name, mode }));
    setS(g); setDeskStart(null); setShowReport(false); setScreen('desk');
    if (!store.seenHelp()) { setOverlay({ kind: 'help' }); store.markHelp(); }
  }, []);

  const onIntel = (item, correct, meta) => { record(item, correct); setS(s => recordIntel(s, item, correct, meta)); };

  if (screen === 'title') {
    return html`<${Title} hasSave=${!!S && !S.over} saveInfo=${S ? `${S.name} · 第 ${S.q} 季度` : ''}
      onNew=${() => setScreen('setup')} onContinue=${() => setScreen('desk')}
      onArchive=${() => { setBack('title'); setScreen('archive'); }} onHelp=${() => setOverlay({ kind: 'help' })} />
      ${overlay && overlay.kind === 'help' ? html`<${Help} onClose=${() => setOverlay(null)} />` : null}`;
  }
  if (screen === 'setup') return html`<${Setup} onStart=${start} onBack=${() => setScreen('title')} />`;
  if (screen === 'archive') return html`<${Archive} onBack=${() => setScreen(back)} />`;
  if (!S) return html`<${Title} hasSave=${false} onNew=${() => setScreen('setup')} onArchive=${() => { setBack('title'); setScreen('archive'); }} onHelp=${() => setOverlay({ kind: 'help' })} />`;

  // ── 执政台
  const ev = S.queue && S.queue.length ? byId[S.queue[0]] : null;
  const act = (res, okMsg) => { if (res.error) setToast(res.error); else { setS(res.S); if (okMsg) setToast(okMsg); } };
  const onMenu = k => {
    if (k === 'title') setScreen('title');
    else if (k === 'archive') { setBack('desk'); setScreen('archive'); }
    else if (k === 'help') setOverlay({ kind: 'help' });
  };
  const onChoose = idx => {
    const { S: S2, changes } = chooseOption(S, EVENTS, ev.id, idx);
    setS(ensureIntel(S2));
    const brief = changes.filter(c => typeof c.to === 'number' && Math.abs(c.to - c.from) >= 0.5).slice(0, 4)
      .map(c => `${c.label}${c.to > c.from ? '↑' : '↓'}`).join(' · ');
    setToast(`已签发：${ev.options[idx].label}${brief ? ' —— ' + brief : ''}`);
  };
  const onEnd = () => {
    const S2 = endQuarter(S, EVENTS, SC);
    setS(ensureIntel(S2)); setShowReport(true); setDeskStart(null);
  };
  const onUndo = () => deskStart && setS({ ...deskStart, intel: S.intel, deskAsk: S.deskAsk, evState: S.evState });
  const canUndo = deskStart && deskStart.q === S.q && JSON.stringify([deskStart.pol, deskStart.eco.i, deskStart.eco.rrr, deskStart.eco.e]) !== JSON.stringify([S.pol, S.eco.i, S.eco.rrr, S.eco.e]);
  const onOutlook = () => { const S2 = spendToken(S); if (!S2) return; setS(S2); setOverlay({ kind: 'outlook', data: outlook(S2, SC) }); };
  const onAsk = id => {
    if (!bank) { setToast('题库还在加载'); return; }
    const item = pickQuestion(bank, MINISTER_CONCEPTS[id], new Set(S.intel.askedIds));
    setOverlay({ kind: 'ask', id, item });
  };

  return html`<div class="desk">
    <${TopBar} S=${S} onMenu=${onMenu} />
    <div class="desk-main">
      <div class="col-left"><${Indicators} S=${S} onLedger=${tab => S.lastReport && setOverlay({ kind: 'ledger', tab })} /></div>
      <div class="col-mid">
        <section class="panel tide-panel" aria-label="美元潮汐">
          <div class="panel-h"><h3>美元潮汐</h3><span class="tag">${PHASES[S.world.phase].blurb}</span></div>
          <${TideMap} S=${S} />
          <div class="phase-strip">${Object.entries(PHASES).map(([k, p]) => html`<div class=${S.world.phase === k ? 'on' : ''}>${p.label}</div>`)}</div>
        </section>
        <div class="ticker" role="button" tabindex="0" onClick=${() => S.lastReport && setOverlay({ kind: 'ledger', tab: 'front' })} title="打开上季报纸">
          <span class="mast">${S.name}日报</span>
          <span class="lines">${S.lastReport ? (S.lastReport.news.map(n => n.text).filter(Boolean)[0] || '点此翻阅上季报纸') : `${S.name}首席执政官今日就职 · 美联储维持零利率 · 外资持续流入`}</span>
        </div>
        ${bankErr ? html`<p class="down" style="font-size:12.5px">题库加载失败（${bankErr}）：召对暂不可用，游戏仍可继续。</p>` : null}
      </div>
      <div class="col-right">
        <${Groups} S=${S} onLedger=${(tab, g) => S.lastReport && setOverlay({ kind: 'ledger', tab, g })} />
        <${Cabinet} S=${S} onAsk=${onAsk} />
      </div>
    </div>
    <${Decree} S=${S} sc=${SC} busy=${!!ev || S.over}
      onPolicy=${(k, v) => act(setPolicy(S, k, v))} onDial=${(k, v) => act(setDial(S, k, v))} onRevalue=${d => act(revalue(S, d))}
      onUndo=${onUndo} canUndo=${canUndo} onOutlook=${onOutlook} onEnd=${onEnd} />

    ${ev && !showReport && !peek ? html`<${EventDossier} key=${ev.id + S.q} S=${S} ev=${ev} sc=${SC} bank=${bank} onChoose=${i => { setPeek(false); onChoose(i); }} onIntel=${onIntel}
        onPeek=${() => setPeek(true)} index=${0} total=${S.queue.length} />` : null}
    ${ev && !showReport && peek ? html`<button class=${'pending-pill' + (ev.kind === 'crisis' ? ' crisis' : '')} onClick=${() => setPeek(false)}>机要待批 · ${ev.title}${S.queue.length > 1 ? `（共 ${S.queue.length} 份）` : ''} →</button>` : null}
    ${showReport ? html`<${QuarterReport} S=${S} onClose=${() => setShowReport(false)} />` : null}
    ${S.over && !showReport ? html`<${Ending} S=${S} bank=${bank} onTitle=${() => { store.clearGame(); setS(null); setScreen('title'); }}
        onArchive=${() => { setBack('title'); store.clearGame(); setS(null); setScreen('archive'); }}
        onRestart=${seed => start({ name: S.name, mode: S.mode, seed: seed ?? Math.floor(Math.random() * 2 ** 31) })} />` : null}
    ${overlay && overlay.kind === 'help' ? html`<${Help} onClose=${() => setOverlay(null)} />` : null}
    ${overlay && overlay.kind === 'ledger' ? html`<${QuarterReport} S=${S} standalone initialTab=${overlay.tab} focusGroup=${overlay.g} onClose=${() => setOverlay(null)} />` : null}
    ${overlay && overlay.kind === 'outlook' ? html`<${OutlookCard} S=${S} sc=${SC} data=${overlay.data} onClose=${() => setOverlay(null)} />` : null}
    ${overlay && overlay.kind === 'ask' ? html`<div class="overlay" onClick=${e => e.target === e.currentTarget && overlay.done && setOverlay(null)}>
        <article class="paper dossier-doc" style="max-width:720px">
          <div class="doc-head"><span>请教 · ${CAST[overlay.id].name}</span><span>${CAST[overlay.id].role}</span></div>
          <p class="ev-text" style="font-size:15px">「${CAST[overlay.id].line}」</p>
          <${QuizCard} item=${overlay.item} onDone=${(c, it) => { onIntel(it, c, { minister: overlay.id }); setOverlay(o => ({ ...o, done: true })); }} />
          <div class="quiz-actions" style="justify-content:flex-end"><button class=${overlay.done ? 'btn primary' : 'btn'} onClick=${() => setOverlay(null)}>${overlay.done ? '告退' : '稍后再问'}</button></div>
        </article></div>` : null}
    ${toast ? html`<div class="toast" role="status">${toast}</div>` : null}
  </div>`;
}
