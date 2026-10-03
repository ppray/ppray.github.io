// 《猎潮》状态机：扉页 → 关卡表 → 简报 → 交易台 → 结算通报。
import { html, useState, useEffect, useCallback } from '../vendor/htm-preact.js';
import { LEVELS, levelById } from '../data/levels/index.js';
import { newGame, advance, summary, equity } from './sim/model.js';
import { store } from './store.js';
import { loadBank } from './quiz/bank.js';
import { TitleScreen, LevelsScreen, BriefScreen } from './ui/screens.js';
import { Desk } from './ui/desk.js';
import { Report } from './ui/report.js';

// 存档只存纯数据：rng 是闭包函数，重建时按 seed 复原。
const FIELDS = ['levelId', 'seed', 'round', 'pos', 'pnl', 'fees', 'penalty', 'heat', 'intel',
  'crackdownFired', 'crackdownPending', 'marginCalls', 'busted', 'log'];

function serialize(s) {
  const o = {};
  for (const k of FIELDS) o[k] = s[k];
  return o;
}
function restore(save) {
  const level = levelById[save.levelId];
  if (!level) return null;
  const fresh = newGame(level, save.seed);
  for (const k of FIELDS) if (k in save) fresh[k] = save[k];
  // rng 已经消耗过若干次，重放对齐（保证续档后的随机序列与存档一致）
  for (let i = 0; i < save.round; i++) fresh.rng();
  return fresh;
}

export function App() {
  const [screen, setScreen] = useState('title');
  const [level, setLevel] = useState(null);
  const [state, setState] = useState(null);
  const [rec, setRec] = useState(null);
  const [finished, setFinished] = useState(false);
  const [items, setItems] = useState(null);
  const [best, setBest] = useState(() => store.best());
  const [resume, setResume] = useState(() => store.loadGame());

  // 题库：懒加载，失败也只是少了「召对」，不影响游戏
  useEffect(() => {
    loadBank().then(setItems).catch(() => setItems(null));
  }, []);

  const save = useCallback(s => { if (s) store.saveGame(serialize(s)); }, []);

  const mut = useCallback(fn => {
    setState(s => {
      if (!s) return s;
      const n = { ...s, pos: { ...s.pos }, pnl: { ...s.pnl } };
      fn(n);
      save(n);
      return n;
    });
  }, [save]);

  const start = (L) => {
    const st = newGame(L, `${Date.now()}`);
    setState(st); setRec(null); setFinished(false); setLevel(L);
    setScreen('play'); save(st);
  };

  const onAdvance = () => {
    setState(s => {
      if (!s) return s;
      const n = { ...s, pos: { ...s.pos }, pnl: { ...s.pnl } };
      const r = advance(n, level);
      setRec(r.rec);
      if (r.done) setFinished(true);
      else save(n);
      return n;
    });
  };

  const onCloseRec = () => {
    setRec(null);
    if (finished) {
      const s = summary(state, level);
      store.recordBest(level.id, s.equity, s.grade.name);
      setBest({ ...store.best() });
      store.clearGame();
      setScreen('report');
    }
  };

  const back = () => { setScreen('levels'); setState(null); };

  return html`
    ${screen === 'title' ? html`<${TitleScreen} onStart=${() => setScreen('levels')} />` : null}
    ${screen === 'levels' ? html`
      <${LevelsScreen} levels=${LEVELS} best=${best} onPick=${L => { setLevel(L); setScreen('brief'); }} />
      ${resume ? html`<div class="levels" style="padding-top:0">
        <div class="row">
          <button class="btn brass small" onClick=${() => {
            const st = restore(resume);
            if (!st) { setResume(null); return; }
            setLevel(levelById[resume.levelId]); setState(st); setRec(null); setFinished(false); setScreen('play');
          }}>接着上一局：${levelById[resume.levelId]?.title || ''}（第 ${resume.round + 1} 回合）</button>
          <button class="btn ghost small" onClick=${() => { store.clearGame(); setResume(null); }}>丢弃存档</button>
        </div>
      </div>` : null}
    ` : null}
    ${screen === 'brief' && level ? html`<${BriefScreen} level=${level} onStart=${() => start(level)} onBack=${() => setScreen('levels')} />` : null}
    ${screen === 'play' && level && state ? html`
      <${Desk} level=${level} state=${state} items=${items} mut=${mut} rec=${rec}
        onAdvance=${onAdvance} onCloseRec=${onCloseRec} onQuit=${back} />
    ` : null}
    ${screen === 'report' && level && state ? html`
      <${Report} level=${level} state=${state} summary=${summary(state, level)}
        onRetry=${() => start(level)}
        onNext=${() => {
          const i = LEVELS.findIndex(l => l.id === level.id);
          const nx = LEVELS[i + 1];
          if (nx) { setLevel(nx); setScreen('brief'); } else setScreen('levels');
        }}
        onHome=${() => setScreen('levels')}
        nextLevel=${LEVELS[LEVELS.findIndex(l => l.id === level.id) + 1] || null} />
    ` : null}
  `;
}
