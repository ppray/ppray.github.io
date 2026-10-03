// 交易台：左看局势、中调仓位、右看仪表与行动。
import { html, useState } from '../../vendor/htm-preact.js';
import { Sparkline, Gauge, fmt, money } from './charts.js';
import { QuizCard, SUPPORTED } from './quiz.js';
import { pickQuestion } from '../quiz/bank.js';
import {
  equity, gross, marginUsed, freeMargin, maxStepsFor, liqOf, maintReq, peek,
} from '../sim/model.js';
import { START_EQUITY, UNIT, MARGIN_RATE, MAX_STEP, HEAT_TRIGGER, INTEL_COST, LOBBY_COST, TOOL_KINDS } from '../sim/defs.js';

export function Desk({ level, state, items, mut, rec, onAdvance, onCloseRec, onQuit }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizItem, setQuizItem] = useState(null);
  const [asked, setAsked] = useState(() => new Set());
  const [flash, setFlash] = useState(null);
  const ri = Math.min(state.round, level.rounds.length - 1);
  const rd = level.rounds[ri];
  const eq = equity(state);
  const gr = gross(state, level);
  const used = marginUsed(state, level);
  const free = freeMargin(state, level);
  const liq = ri < level.rounds.length ? liqOf(level, ri) : 1;
  const last = state.log[state.log.length - 1];
  const curve = [START_EQUITY, ...state.log.map(l => l.after)];

  const openQuiz = () => {
    if (!items) return;
    const pool = items.filter(it => SUPPORTED.has(it.t));
    if (!pool.length) return;
    const it = pickQuestion(pool, level.concepts || [], asked);
    setQuizItem(it);
    setAsked(new Set([...asked, it.id]));
    setShowQuiz(true);
  };

  const onQuizDone = (correct) => {
    if (correct) {
      // 答对：给一份不带噪声的推演（比买来的情报更准）
      mut(s => { s.intel = peek(level, s.round, () => 0.5); s.intel.clean = true; });
      setFlash('推演到手：下面一回合的方向已写明。');
    } else {
      setFlash('答错了。这一回合只能靠你自己判断。');
    }
    setTimeout(() => { setShowQuiz(false); setFlash(null); }, correct ? 1200 : 2600);
  };

  return html`
    <div class="desk">
      <div class="bar">
        <span class="b-title serif">${level.title}</span>
        <span class="b-round">第 ${Math.min(state.round + 1, level.rounds.length)} / ${level.rounds.length} 回合 · ${rd.date}</span>
        <div class="b-stats">
          <div class="stat"><span class="k">权益</span><span class="v num ${eq >= START_EQUITY ? 'up' : 'down'}">${fmt(eq)}<small>M</small></span></div>
          <div class="stat"><span class="k">可用保证金</span><span class="v num">${fmt(free)}<small>M</small></span></div>
          <div class="stat"><span class="k">总敞口</span><span class="v num">${fmt(gr)}<small>M</small></span></div>
          <div class="stat"><span class="k">杠杆</span><span class="v num">${fmt(gr / Math.max(1, eq), 2)}<small>×</small></span></div>
        </div>
      </div>

      <div class="grid3">
        <!-- 左：局势 -->
        <div class="panel">
          <h3>市场电报 <span class="sub">${state.crackdownPending ? '监管风声已起' : '机要'}</span></h3>
          ${last ? html`<div class="spread" style="margin-bottom:10px">
            <span class="muted" style="font-size:12px">上回合 ${last.date}</span>
            <span class="num ${last.delta >= 0 ? 'up' : 'down'}">${money(last.delta)}</span>
          </div>` : null}
          <div class="wire">
            <span class="w-date">${rd.date}</span>
            ${level.scenes?.[ri] || rd.wire}
          </div>
          ${state.intel ? html`<${IntelBox} intel=${state.intel} level=${level} />` : null}
          ${flash ? html`<div class="intel-box" style="border-color:rgba(201,162,74,.7)">${flash}</div>` : null}
          <${Log} log=${state.log} />
        </div>

        <!-- 中：仓位 -->
        <div class="panel">
          <h3>持仓台 <span class="sub">一档 = ${UNIT}M 名义 · 保证金 ${UNIT * MARGIN_RATE}M</span></h3>
          ${level.tools.map(t => html`<${PosRow} key=${t.id} level=${level} state=${state} tool=${t} mut=${mut} />`)}
          <div class="hintline">调仓按变动名义本金收 ${(0.4).toFixed(1)}‰ 滑点。空头方向的仓位：标的跌则赚。</div>
        </div>

        <!-- 右：仪表与行动 -->
        <div>
          <div class="panel">
            <h3>仪表 <span class="sub">净值 · 热度 · 流动性</span></h3>
            <div class="spread" style="margin-bottom:8px">
              <span class="muted" style="font-size:12px">权益曲线</span>
              <${Sparkline} values=${curve} w=${170} h=${38} />
            </div>
            <${Gauge} label="监管热度" value=${state.heat} max=${140} danger=${state.heat >= HEAT_TRIGGER * 0.75}
              note=${state.heat >= HEAT_TRIGGER ? '监管已经在起草文件——下回合可能落地。' : '做空主权货币、买主权 CDS 最招骂。'} />
            <${Gauge} label="市场流动性" value=${liq * 100} max=${100} color="var(--dollar)" danger=${liq < 0.6}
              note=${liq < 0.6 ? '流动性枯竭：维持保证金要求被抬高，同样的仓位现在更贵。' : '流动性正常。'} />
            <${Gauge} label="保证金占用" value=${(used / Math.max(1, eq)) * 100} max=${100} color="var(--brass)"
              note=${`维持线 ${fmt(maintReq(state, level, ri))}M（= 总敞口 × ${(0.1 / liq * 100).toFixed(1)}%）；跌破即强平。`} />
          </div>

          <div class="panel" style="margin-top:14px">
            <h3>行动</h3>
            <div class="acts">
              <button class="btn primary" onClick=${onAdvance}>推进下一回合 →</button>
              <button class="btn brass" disabled=${!!state.intel || state.round >= level.rounds.length - 1 || eq < INTEL_COST}
                onClick=${() => mut(s => { s.intel = peek(level, s.round, s.rng); })}>
                买情报 · ${INTEL_COST}M
              </button>
              <button class="btn" disabled=${eq < LOBBY_COST} onClick=${() => mut(s => { s.fees += LOBBY_COST; s.heat = Math.max(0, s.heat - 22); })}>
                公关降温 · ${LOBBY_COST}M
              </button>
              <button class="btn ghost" disabled=${!items} onClick=${openQuiz}>召对 · 答对真题换推演</button>
              <button class="btn ghost" onClick=${onQuit}>收摊回馆</button>
            </div>
            <div class="hintline">
              情报只说方向与量级，且有 ${12}% 概率失真；召对答对则拿到不带噪声的推演。
              热度到 ${HEAT_TRIGGER} 会触发政策干预：${level.crackdown.title}。
            </div>
          </div>

          ${showQuiz && quizItem ? html`<${QuizCard} item=${quizItem} onDone=${onQuizDone} onSkip=${() => setShowQuiz(false)} />` : null}
        </div>
      </div>
    </div>

    ${rec ? html`<${RoundPop} rec=${rec} level=${level} onClose=${onCloseRec} />` : null}
  `;
}

function PosRow({ level, state, tool, mut }) {
  const step = state.pos[tool.id] || 0;
  const pnl = state.pnl[tool.id] || 0;
  const locked = state.round < (tool.open || 0);
  const kind = TOOL_KINDS[tool.kind];
  const can = maxStepsFor(state, level, tool.id);
  const set = k => mut(s => {
    const cur = s.pos[tool.id] || 0;
    const want = cur === k ? 0 : k;
    const need = (want - cur) * UNIT * MARGIN_RATE;
    if (want > cur && need > freeMargin(s, level) + 1e-9) { s._warn = '保证金不够'; return; }
    if (want > cur) s.penalty += (want - cur) * UNIT * 0.004;
    s.pos[tool.id] = want;
  });
  return html`
    <div class="pos">
      <div class="p-top">
        <span class="p-name">${tool.label}</span>
        <span class="p-dir ${tool.dir < 0 ? 'short' : 'long'}">${tool.dir < 0 ? '空' : '多'} · ${kind.name}</span>
        <span class="p-pnl num ${pnl >= 0 ? 'up' : 'down'}">${money(pnl)}</span>
      </div>
      <div class="p-hint">${tool.hint}</div>
      ${locked
        ? html`<div class="p-locked">第 ${(tool.open || 0) + 1} 回合起才可建仓</div>`
        : html`<div class="p-row">
            <div class="steps">
              ${Array.from({ length: MAX_STEP }, (_, i) => i + 1).map(k => html`
                <button key=${k} class=${`step ${k <= step ? 'on' : ''}`}
                  disabled=${k > step && k > can + step} title=${`${k} 档 = ${k * UNIT}M 名义`}
                  onClick=${() => set(k)} aria-label=${`${tool.label} ${k} 档`}></button>`)}
            </div>
            <span class="p-exp">${step ? `${step * UNIT}M · 保证金 ${step * UNIT * MARGIN_RATE}M` : '空仓'}</span>
          </div>`}
    </div>`;
}

function IntelBox({ intel, level }) {
  return html`
    <div class="intel-box">
      <div class="i-h">${intel.clean ? '内部推演 · 无噪声' : '线人情报 · 可能失真'} · 第 ${intel.round + 1} 回合</div>
      ${intel.lines.map(l => html`
        <div key=${l.id} style="display:flex;gap:8px;justify-content:space-between">
          <span>${l.label}</span>
          <span class=${l.sayGood ? 'up' : 'down'}>${l.sayGood ? '有利' : '不利'} · ${l.word}</span>
        </div>`)}
      ${intel.liq != null && intel.liq < 0.7 ? html`<div class="faint" style="margin-top:6px">流动性将降至 ${(intel.liq * 100).toFixed(0)}%</div>` : null}
    </div>`;
}

function Log({ log }) {
  if (!log.length) return null;
  return html`
    <div class="log">
      <details>
        <summary><span class="d">回合纪要</span><span class="p">${log.length} 条</span></summary>
        ${log.slice().reverse().map(l => html`
          <details key=${l.round} style="padding-left:0">
            <summary><span class="d">${l.date}</span><span>${l.title}</span>
              <span class="p num ${l.delta >= 0 ? 'up' : 'down'}">${money(l.delta)}</span></summary>
            <div class="body">${l.wire}</div>
          </details>`)}
      </details>
    </div>`;
}

function RoundPop({ rec, level, onClose }) {
  return html`
    <div class="pop" role="dialog" aria-modal="true">
      <div class="pop-card">
        <div class="p-date">${rec.date} · 第 ${rec.round + 1} 回合结算</div>
        <h3>${rec.title}</h3>
        <div class="wire" style="margin-top:8px;font-size:14px">${rec.wire}</div>
        ${rec.crackdown ? html`<div class="pop-alert"><b>${rec.crackdown.title}</b><br />${rec.crackdown.text}</div>` : null}
        ${rec.marginCall ? html`<div class="pop-alert"><b>追加保证金</b><br />维持线没守住，被强制平掉 ${fmt(rec.marginCall.closed)}M 名义，罚金 ${money(rec.marginCall.fee)}。</div>` : null}
        <div class="pop-lines">
          ${rec.lines.length ? rec.lines.map(l => html`
            <div class="pop-line" key=${l.id + (l.intervention ? 'i' : '')}>
              <span>${l.label}</span>
              ${l.intervention
                ? html`<span class="l-mv">干预折价 −${money(l.lost)}</span>`
                : html`<span class="l-mv">标的 ${(l.mv * 100).toFixed(1)}% × ${l.step} 档</span>`}
              <span class="l-pnl ${l.pnl >= 0 ? 'up' : 'down'}">${money(l.pnl)}</span>
            </div>`)
            : html`<div class="pop-line faint">本回合空仓，市场与你无关。</div>`}
        </div>
        <div class="pop-total"><span class="k">本回合净值变化</span>
          <span class=${rec.after - rec.before >= 0 ? 'up' : 'down'}>${money(rec.after - rec.before)}</span></div>
        <div class="pop-total" style="font-size:15px;margin-top:4px"><span class="k">账户权益</span>
          <span class="num">${fmt(rec.after)}M</span></div>
        ${rec.note ? html`<div class="note" style="margin-top:12px">${rec.note}</div>` : null}
        <div class="row" style="margin-top:18px"><button class="btn primary" onClick=${onClose}>继续</button></div>
      </div>
    </div>`;
}
