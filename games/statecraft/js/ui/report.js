// 季报：《华胥日报》头版 + 外电 + 因果账本。舆论管控越严，头版越「平稳向好」，外电照实说。
import { html, useState } from '../../vendor/htm-preact.js';
import { newspaper } from '../sim/news.js';
import { GROUPS, groupById } from '../sim/defs.js';

const TABS = [
  ['front', '头版'], ['reserves', '外储账本'], ['growth', '增长'], ['inflation', '通胀'], ['confidence', '市场信心'], ['bubble', '资产价格'], ['groups', '利益集团'],
];
const LEDGER_NOTE = {
  reserves: '本季外储变动 = 央行在外汇市场上吸收的全部净流入。汇率制度决定压力由「外储」还是「汇率」来吸收。',
  growth: '下面是本季「目标增速」的分解；实际增速会向它靠拢一半（经济有惯性）。',
  inflation: '目标通胀的分解；汇率贬值会立刻传导一部分到物价。',
  confidence: '市场信心目标的分解；实际信心向它靠拢。信心决定风险溢价、外债能否续借、会不会出现资本外逃。',
  bubble: '资产价格本季变动的来源。潮水收紧（加息、外流）时，价格过高就可能破裂。',
  groups: '每个集团「应有」的支持度由经济形势与你的政策决定；实际支持度每季向它靠拢三分之一。「旧账与人情」是过去事件与政令留下的记忆。',
};

export function QuarterReport({ S, onClose, initialTab = 'front', focusGroup, standalone }) {
  const rep = S.lastReport;
  const [tab, setTab] = useState(initialTab);
  if (!rep) return null;
  const np = newspaper(S, rep);
  const L = rep.ledger;
  const b = rep.before, a = rep.after;
  const show = (k, snap) => (['g', 'pi', 'u'].includes(k) && S.pol.press !== 'open' ? snap.rep[k] : snap[k]);
  const kpis = [
    ['增长', 'g', v => v.toFixed(1) + '%', 1], ['通胀', 'pi', v => v.toFixed(1) + '%', -1], ['失业', 'u', v => v.toFixed(1) + '%', -1],
    ['汇率', 'e', v => v.toFixed(2), 0], ['外储(亿$)', 'reserves', v => Math.round(v * 10).toLocaleString('zh-CN'), 1], ['合法性', 'legit', v => v.toFixed(0), 1],
  ];
  return html`<div class="overlay" role="dialog" aria-modal="true" aria-label="季度报告">
    <article class="paper newspaper">
      <div class="np-mast">
        <h2>${np.masthead}</h2>
        <div class="meta"><span>第 ${rep.q} 季度 · 季末版</span><span>美联储利率 ${a.fed.toFixed(2)}%</span><span>${np.press === 'open' ? '新闻自由' : np.press === 'guided' ? '统一口径' : '经审核'}</span></div>
      </div>
      <div class="tabs" role="tablist">
        ${TABS.map(([k, label]) => html`<button role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${label}</button>`)}
      </div>
      ${tab === 'front' ? html`
        <div class="np-lead">${np.lead}</div>
        <div class="np-kpis">${kpis.map(([label, k, f, good]) => {
          const bv = show(k, b), av = show(k, a);
          const d = av - bv;
          return html`<div><div class="k">${label}</div><div class="v">${f(av)}</div><div class=${'d ' + (!good || Math.abs(d) < 1e-6 ? '' : (d > 0) === (good > 0) ? 'up' : 'down')}>${d >= 0 ? '+' : '−'}${k === 'reserves' ? Math.round(Math.abs(d) * 10) : Math.abs(d).toFixed(k === 'e' ? 2 : 1)}</div></div>`;
        })}</div>
        <div class="np-cols">
          <div><h4>本报讯</h4><ul class="np-list">${np.rest.map(t => html`<li>${t}</li>`)}
            ${np.censored ? Array.from({ length: Math.min(3, np.censored) }, () => html`<li><span class="censor">████████████████</span> <span class="muted" style="font-size:12px">（本条未能刊发）</span></li>`) : null}
          </ul></div>
          <div><h4>外电摘要</h4><ul class="np-list np-foreign">${np.foreign.length ? np.foreign.map(t => html`<li>${t}</li>`) : html`<li>Quiet quarter for ${S.name === "华胥" ? "Huaxu" : S.name}.</li>`}</ul>
            ${S.pol.press !== 'open' ? html`<p class="muted" style="font-size:12px;margin-top:10px">本国报纸与外电的出入，就是统计失真与舆论管控的代价。头版数字为公布值。</p>` : null}
          </div>
        </div>
        ${L.notes.length ? html`<div class="verdict no" style="margin-top:16px">${L.notes.map(n => html`<div>⚠ ${n.text}</div>`)}</div>` : null}
      ` : tab === 'groups' ? html`<${GroupLedger} L=${L} focus=${focusGroup} S=${S} />`
        : html`<${Ledger} parts=${L[tab]} kind=${tab} L=${L} />`}
      <div class="quiz-actions" style="justify-content:flex-end;margin-top:18px">
        <button class="btn primary" onClick=${onClose}>${standalone ? '收起' : S.over ? '翻到史评 →' : `进入第 ${S.q} 季度 →`}</button>
      </div>
    </article>
  </div>`;
}

function Ledger({ parts, kind, L }) {
  const total = parts.reduce((n, p) => n + p.v, 0);
  const scale = kind === 'reserves' ? 10 : 1;
  const unit = kind === 'reserves' ? ' 亿$' : kind === 'growth' || kind === 'inflation' ? ' 个百分点' : '';
  return html`<div style="margin-top:14px">
    <p class="muted" style="font-size:13px">${LEDGER_NOTE[kind]}</p>
    <table class="ledger">
      ${parts.map(p => html`<tr><td>${p.label}</td><td class="v" style=${{ color: p.v >= 0 ? '#1f6b56' : '#a32d19' }}>${p.v >= 0 ? '+' : '−'}${(Math.abs(p.v) * scale).toFixed(kind === 'reserves' ? 0 : 2)}${unit}</td></tr>`)}
      <tr class="total"><td>${kind === 'reserves' ? '外储变动' : '目标值'}</td><td class="v">${(total * scale).toFixed(kind === 'reserves' ? 0 : 2)}${unit}</td></tr>
    </table>
    ${kind === 'reserves' ? html`<p class="muted" style="font-size:12.5px;margin-top:10px">
      本季利差（央行利率 − 美联储 − 预期贬值 − 风险溢价）：<b class="num">${L.money.carry.toFixed(2)}</b> 个百分点 · 预期贬值 <b class="num">${L.money.expDep.toFixed(2)}%</b> ·
      冲销 <b class="num">${Math.round(L.money.sterilized * 10)}</b> 亿$ / 未冲销（变成基础货币）<b class="num">${Math.round(L.money.unster * 10)}</b> 亿$ · 本季冲销成本 <b class="num">${Math.round(L.money.sterCostQ * 10)}</b> 亿$</p>` : null}
  </div>`;
}

function GroupLedger({ L, focus, S }) {
  const [sel, setSel] = useState(focus || 'workers');
  const g = L.groups[sel];
  return html`<div style="margin-top:14px">
    <p class="muted" style="font-size:13px">${LEDGER_NOTE.groups}</p>
    <div class="seg" style="margin-bottom:10px">${GROUPS.map(x => html`<button aria-pressed=${sel === x.id} onClick=${() => setSel(x.id)}>${x.name}</button>`)}</div>
    <p style="font-size:13px;margin:0 0 8px">${groupById[sel].blurb}</p>
    <table class="ledger">
      ${g.parts.map(p => html`<tr><td>${p.label}</td><td class="v" style=${{ color: p.label === '基准' ? 'inherit' : p.v >= 0 ? '#1f6b56' : '#a32d19' }}>${p.label === '基准' ? '' : p.v >= 0 ? '+' : '−'}${Math.abs(p.v).toFixed(1)}</td></tr>`)}
      <tr class="total"><td>应有支持度</td><td class="v">${g.target.toFixed(1)}</td></tr>
      <tr><td>实际支持度</td><td class="v">${S.soc.groups[sel].toFixed(1)}</td></tr>
    </table>
  </div>`;
}
