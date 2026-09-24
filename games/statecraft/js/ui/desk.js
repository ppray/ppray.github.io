// 执政台：顶栏 · 国情仪表 · 潮汐图 · 利益集团 · 内阁 · 政令台
import { html, useState } from '../../vendor/htm-preact.js';
import { GROUPS, POLICIES, DIALS, PHASES } from '../sim/defs.js';
import { reported, INFO_QUALITY } from '../sim/model.js';
import { policyCost, outlook } from '../sim/game.js';
import { CAST, CABINET, artSrc } from '../../data/cast.js';
import { Spark } from './charts.js';
import { TideMap } from './tide.js';

const PHASE_COLOR = { fangshui: '#7fa37a', chuipao: '#c49a52', shoushui: '#d99a2b', shouge: '#e0563d' };
const fmtYi = v => `${Math.round(v * 10).toLocaleString('zh-CN')}`;

export function TopBar({ S, onMenu }) {
  const legit = S.legit;
  const col = legit < 45 ? 'var(--cinnabar-2)' : legit < 59 ? 'var(--amber)' : 'var(--verdigris-2)';
  const I = S.intel || { asked: 0, correct: 0, tokens: 0 };
  return html`<header class="topbar">
    <div class="brand"><span class="seal">庙</span>庙算</div>
    <div class="stat"><span class="k">季度</span><span class="v">${Math.min(S.q, S.maxQ)}<small> / ${S.maxQ}</small></span></div>
    <span class="tide-chip" title=${PHASES[S.world.phase].blurb}><span class="dot" style=${{ background: PHASE_COLOR[S.world.phase] }}></span>美元潮汐 · ${PHASES[S.world.phase].label}</span>
    <div class="stat" title="低于 36 即下台；任期结束时 ≥ 59 为「潮退而立」">
      <span class="k">合法性</span><span class="v" style=${{ color: col }}>${legit.toFixed(0)}</span>
      <span class="legit-bar"><b style=${{ width: `${legit}%`, background: col }}></b></span>
    </div>
    <div class="stat" title="调整结构性政令要花政治资本；合法性越高，每季恢复越多">
      <span class="k">政治资本</span>
      <span class="pips" aria-label=${`政治资本 ${S.pc} / 6`}>${[0, 1, 2, 3, 4, 5].map(i => html`<i class=${i < S.pc ? 'on' : ''}></i>`)}</span>
    </div>
    <div class="stat hide-sm" title="召对答对的次数 / 召对总次数。算筹：每答对一题得一根，可用来推演政令。">
      <span class="k">得算 · 算筹</span><span class="v" style="color:var(--brass)">${I.correct}<small>/${I.asked}</small> · ${I.tokens}</span>
    </div>
    <span class="spacer"></span>
    <button class="btn small ghost" onClick=${() => onMenu('help')}>规则</button>
    <button class="btn small ghost" onClick=${() => onMenu('archive')}>档案馆</button>
    <button class="btn small" onClick=${() => onMenu('title')}>存档并离席</button>
  </header>`;
}

const INDICATORS = [
  { key: 'g', label: '经济增长', unit: '%', rep: true, hist: r => r.rep?.g ?? r.g, fmt: v => v.toFixed(1), good: 1, ledger: 'growth' },
  { key: 'pi', label: '通胀', unit: '%', rep: true, hist: r => r.rep?.pi ?? r.pi, fmt: v => v.toFixed(1), good: -1, ledger: 'inflation' },
  { key: 'u', label: '失业率', unit: '%', rep: true, hist: r => r.rep?.u ?? r.u, fmt: v => v.toFixed(1), good: -1 },
  { key: 'e', label: '汇率', sub: '华元 / 美元', unit: '', hist: r => r.e, fmt: v => v.toFixed(2), good: 0 },
  { key: 'reserves', label: '外汇储备', sub: '亿美元', unit: '', hist: r => r.reserves, fmt: fmtYi, good: 1, ledger: 'reserves' },
  { key: 'fxDebt', label: '短期外债', sub: '亿美元', unit: '', hist: r => r.fxDebt, fmt: fmtYi, good: -1 },
  { key: 'adequacy', label: '外储充足度', sub: '外储 ÷（短债 + 3 月进口）', unit: '×', fmt: v => v.toFixed(2), good: 1 },
  { key: 'bubble', label: '资产价格', sub: '就任 = 104', unit: '', hist: r => r.bubble, fmt: v => v.toFixed(0), good: 0, ledger: 'bubble' },
  { key: 'conf', label: '市场信心', unit: '', rep: true, hist: r => r.conf, fmt: v => v.toFixed(0), good: 1, ledger: 'confidence' },
  { key: 'debt', label: '政府债务', sub: '占 GDP', unit: '%', hist: r => r.debt, fmt: v => v.toFixed(0), good: -1 },
  { key: 'npl', label: '银行不良率', unit: '%', hist: r => r.npl, fmt: v => v.toFixed(1), good: -1 },
];

export function Indicators({ S, onLedger }) {
  const r = reported(S);
  const rows = S.hist.rows;
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const val = k => (k === 'adequacy' ? S.eco.adequacy : k === 'conf' ? r.conf : ['g', 'pi', 'u'].includes(k) ? r[k] : S.eco[k]);
  return html`<section class="panel" aria-label="国情仪表">
    <div class="panel-h"><h3>国情仪表</h3>${r.distorted ? html`<span class="distort" title="舆论管理越严，统计口径越「好看」——连你看到的也是">⚠ 统计失真 ${Math.round((1 - INFO_QUALITY[S.pol.press]) * 100)}%</span>` : html`<span class="tag">数据真实</span>`}</div>
    ${INDICATORS.map(ind => {
      const v = val(ind.key);
      const last = rows[rows.length - 1];
      const pv = prev && ind.hist ? ind.hist(prev) : null;
      const cur = ind.hist ? ind.hist(last) : v;
      const d = pv != null ? cur - pv : 0;
      const dcls = !ind.good || Math.abs(d) < 1e-6 ? 'faint' : (d > 0) === (ind.good > 0) ? 'up' : 'down';
      const Tag = ind.ledger ? 'button' : 'div';
      return html`<div class="ind">
        <${Tag} class="k" onClick=${ind.ledger ? () => onLedger(ind.ledger) : null} title=${ind.ledger ? '查看上季因果账本' : null}>${ind.label}${ind.ledger ? ' ›' : ''}${ind.sub ? html`<small>${ind.sub}</small>` : null}</${Tag}>
        <span class="v">${ind.fmt(v)}${ind.unit}${pv != null ? html`<span class=${'d ' + dcls}>${d >= 0 ? '▲' : '▼'} ${ind.fmt(Math.abs(d))}</span>` : null}</span>
        ${ind.hist ? html`<${Spark} values=${rows.map(ind.hist)} />` : html`<span></span>`}
      </div>`;
    })}
    <div class="warn-row" title="钉住汇率 × 资本开放 × 利率偏离美联储：三者同时追求时张力最大">
      <b>三元悖论张力</b> ${Math.round(S.eco.tri * 100)}%
      <div class="tri-meter"><b style=${{ width: `${S.eco.tri * 100}%` }}></b></div>
    </div>
    <div class="warn-row" style="border-color:var(--brass)">
      <b style="color:var(--brass)">累计账单</b> 冲销成本 ${fmtYi(S.eco.sterCost)} 亿$ · 外资与外储的负利差（向美元体系交的贡）${fmtYi(S.eco.tribute)} 亿$
    </div>
  </section>`;
}

export function Groups({ S, onLedger }) {
  const L = S.ledger && S.ledger.groups;
  const rows = S.hist.rows;
  const prev = rows.length > 1 ? rows[rows.length - 2].groups : null;
  return html`<section class="panel" aria-label="利益集团">
    <div class="panel-h"><h3>利益集团</h3><span class="tag">剥夺了谁 · 补贴了谁</span></div>
    ${GROUPS.map(g => {
      const v = S.soc.groups[g.id];
      const d = prev ? v - prev[g.id] : 0;
      const col = v < 40 ? 'var(--cinnabar-2)' : v < 52 ? 'var(--amber)' : 'var(--verdigris-2)';
      return html`<div class="grp">
        <button onClick=${() => onLedger('groups', g.id)} title=${g.blurb}>
          <div class="grp-top"><span>${g.name} <span class="faint" style="font-size:11px">×${g.weight}</span></span><span class="num" style=${{ color: col }}>${v.toFixed(0)} <span class=${d >= 0 ? 'up' : 'down'} style="font-size:11px">${Math.abs(d) >= 0.5 ? (d > 0 ? '▲' : '▼') + Math.abs(d).toFixed(0) : ''}</span></span></div>
          <div class="grp-bar"><b style=${{ width: `${v}%`, background: col }}></b>${L ? html`<span class="tgt" style=${{ left: `${Math.max(0, Math.min(100, L[g.id].target))}%` }} title="经济形势决定的「应有」支持度"></span>` : null}</div>
        </button>
      </div>`;
    })}
    <div class="warn-row" style="margin-top:12px"><b>民心</b> 信任 ${reported(S).trust.toFixed(0)} · 积怨 ${reported(S).grievance.toFixed(0)} · 民族情绪 ${S.soc.national.toFixed(0)} · 对美关系 ${S.dip.us.toFixed(0)}</div>
  </section>`;
}

export function Cabinet({ S, onAsk }) {
  return html`<section class="panel" aria-label="内阁">
    <div class="panel-h"><h3>内阁</h3><span class="tag">每季可各请教一题 · 答对得算筹</span></div>
    <div class="cabinet">
      ${CABINET.map(id => {
        const c = CAST[id];
        const used = (S.deskAsk || {})[id] === S.q;
        return html`<button class="minister" onClick=${() => !used && onAsk(id)} disabled=${used} title=${c.line} style=${used ? { opacity: 0.5 } : null}>
          <div class="portrait"><img src=${artSrc(id)} alt=${c.name} loading="lazy" /></div>
          <b>${c.name}</b>${c.desk}${used ? ' · 已问' : ''}
        </button>`;
      })}
    </div>
  </section>`;
}

export function Decree({ S, sc, onPolicy, onDial, onRevalue, onUndo, canUndo, onOutlook, onEnd, busy }) {
  const [hint, setHint] = useState('');
  const levers = ['fxRegime', 'capOpen', 'sterilize', 'fiscal', 'press', 'macropru'];
  const base = S.dialBase || {};
  return html`<footer class="decree" aria-label="政令台">
    <div class="decree-grid">
      ${levers.map(key => {
        const def = POLICIES[key];
        return html`<div class="lever">
          <div class="lk"><span>${def.label}</span>${def.cost ? html`<span class="cost">改动 −${def.cost}</span>` : html`<span class="faint">不耗资本</span>`}</div>
          <div class="opts" role="group" aria-label=${def.label}>
            ${def.options.map(o => {
              const on = S.pol[key] === o.v;
              const cost = policyCost(S, key, o.v);
              return html`<button aria-pressed=${on} disabled=${!on && cost > S.pc} onMouseEnter=${() => setHint(`${def.label} · ${o.label}：${o.hint}`)} onFocus=${() => setHint(`${def.label} · ${o.label}：${o.hint}`)} onClick=${() => onPolicy(key, o.v)}>${o.label}</button>`;
            })}
          </div>
        </div>`;
      })}
      ${Object.entries(DIALS).map(([key, d]) => {
        const field = key === 'rate' ? 'i' : 'rrr';
        const v = S.eco[field];
        const b = base[field] ?? v;
        return html`<div class="lever">
          <div class="lk"><span>${d.label}</span><span class="faint">本季 ±${d.maxMove}</span></div>
          <div class="dial">
            <button aria-label=${`下调${d.label}`} disabled=${v - d.step < Math.max(d.min, b - d.maxMove) - 1e-9} onClick=${() => onDial(key, v - d.step)}>−</button>
            <span class="num">${v.toFixed(2)}<small>%</small></span>
            <button aria-label=${`上调${d.label}`} disabled=${v + d.step > Math.min(d.max, b + d.maxMove) + 1e-9} onClick=${() => onDial(key, v + d.step)}>+</button>
          </div>
        </div>`;
      })}
    </div>
    <div class="decree-foot">
      <div class="hint">${hint || html`中间价：<button class="btn small" disabled=${S.pol.fxRegime === 'float' || S.pc < 1} onClick=${() => onRevalue(1)}>升值 3%</button> <button class="btn small" disabled=${S.pol.fxRegime === 'float' || S.pc < 1} onClick=${() => onRevalue(-1)}>贬值 3%</button> <span class="faint">（各耗 1 资本）</span>`}</div>
      <button class="btn small" disabled=${!canUndo} onClick=${onUndo}>撤销本季调整</button>
      <button class="btn brass small" disabled=${!S.intel || S.intel.tokens < 1} onClick=${onOutlook} title="消耗 1 根算筹：按当前政令推演两个季度">推演政令 · 1 算筹</button>
      <button class="btn primary" disabled=${busy} onClick=${onEnd}>签发政令 · 结束本季度 →</button>
    </div>
  </footer>`;
}

export function OutlookCard({ S, sc, data, onClose }) {
  const now = { reserves: S.eco.reserves, g: S.eco.g, pi: S.eco.pi, legit: S.legit, conf: S.eco.conf, e: S.eco.e, bubble: S.eco.bubble };
  const rows = [
    ['外汇储备', 'reserves', v => fmtYi(v) + ' 亿$', 1], ['汇率', 'e', v => v.toFixed(2), 0], ['经济增长', 'g', v => v.toFixed(1) + '%', 1],
    ['通胀', 'pi', v => v.toFixed(1) + '%', -1], ['资产价格', 'bubble', v => v.toFixed(0), 0], ['市场信心', 'conf', v => v.toFixed(0), 1], ['合法性', 'legit', v => v.toFixed(0), 1],
  ];
  const warn = [];
  if (data.reserves < 0.3 * sc.trade.m0 * 1.3) warn.push('外储逼近警戒线：一旦跌破，将被迫放弃汇率目标。');
  if (data.bubble > 118) warn.push('资产价格过高：潮水一旦收紧，破裂风险很大。');
  if (S.eco.tri > 0.4) warn.push('三元悖论张力过高：钉住汇率 + 开放资本 + 独立利率，三者不可兼得。');
  if (data.legit < 42) warn.push('合法性逼近下台线（36）。');
  return html`<div class="overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
    <article class="paper dossier-doc" style="max-width:560px">
      <div class="doc-head"><span>庙算 · 政令推演</span><span>两季之后</span></div>
      <h2 class="doc-title">若按现行政令</h2>
      <p class="muted" style="font-size:13px">确定性推演：不含随机冲击与新事件。${S.pol.press !== 'open' ? '推演用的是真实数据，不受统计失真影响。' : ''}</p>
      <table class="ledger">${rows.map(([label, k, f, good]) => {
        const d = data[k] - now[k];
        const cls = !good || Math.abs(d) < 1e-6 ? '' : (d > 0) === (good > 0) ? 'color:#1f6b56' : 'color:#a32d19';
        return html`<tr><td>${label}</td><td class="v">${f(now[k])}</td><td class="v">→</td><td class="v"><b>${f(data[k])}</b></td><td class="v" style=${cls}>${d >= 0 ? '+' : ''}${k === 'reserves' ? fmtYi(d) : d.toFixed(k === 'e' ? 2 : 1)}</td></tr>`;
      })}</table>
      ${warn.length ? html`<div class="verdict no" style="margin-top:14px">${warn.map(w => html`<div>⚠ ${w}</div>`)}</div>` : html`<div class="verdict ok" style="margin-top:14px">两季之内没有看到明显的警报。</div>`}
      <div class="quiz-actions" style="justify-content:flex-end"><button class="btn primary" onClick=${onClose}>收起</button></div>
    </article>
  </div>`;
}

export { outlook, TideMap };
