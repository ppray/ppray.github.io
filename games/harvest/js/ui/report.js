// 关卡通报：一张纸质结算单。评级印章 + 曲线 + 史实复盘 + ⚠️ 出处告警。
import { html } from '../../vendor/htm-preact.js';
import { EquityCurve, fmt, money } from './charts.js';
import { START_EQUITY } from '../sim/defs.js';

export function Report({ level, state, summary, onRetry, onNext, onHome, nextLevel }) {
  const g = summary.grade;
  return html`
    <div class="report">
      <div class="paper">
        <div class="r-meta">${level.num} · ${level.title} · ${level.year}</div>
        <h2>结算通报</h2>
        <div class="r-meta">交易台 · ${level.place} · 共 ${level.rounds.length} 回合</div>

        <div class="verdict">
          <div class="seal stamp">${g.name[0]}</div>
          <div>
            <div class="v-word">${g.name} <span class="r-meta" style="letter-spacing:.14em">${g.word}</span></div>
            <div class="v-snark">${g.snark}</div>
          </div>
        </div>

        <div class="r-stats">
          <div class="r-stat"><div class="k">期末权益</div><div class="v">${fmt(summary.equity)}M</div></div>
          <div class="r-stat"><div class="k">收益率</div><div class="v">${summary.ret >= 0 ? '+' : ''}${fmt(summary.ret)}%</div></div>
          <div class="r-stat"><div class="k">最高权益</div><div class="v">${fmt(summary.peak)}M</div></div>
          <div class="r-stat"><div class="k">单回合最好</div><div class="v">${money(summary.best)}</div></div>
          <div class="r-stat"><div class="k">单回合最差</div><div class="v">${money(summary.worst)}</div></div>
          <div class="r-stat"><div class="k">强平次数</div><div class="v">${summary.marginCalls}</div></div>
        </div>

        <div style="margin:6px 0 2px"><${EquityCurve} curve=${summary.curve} dates=${summary.dates} /></div>

        ${summary.crackdown ? html`
          <h4>你触发了政策干预</h4>
          <div class="warn">${level.crackdown.title}：${level.crackdown.text}</div>` : null}

        <h4>史实复盘</h4>
        <ul>${level.review.map((r, i) => html`<li key=${i}>${r}</li>`)}</ul>

        <h4>⚠️ 出处与口径告警</h4>
        ${level.warnings.map((w, i) => html`<div class="warn" key=${i}>${w}</div>`)}

        <div class="r-actions">
          <button class="btn primary" onClick=${onRetry}>再来一局</button>
          ${nextLevel ? html`<button class="btn" onClick=${onNext}>下一场：${nextLevel.title} →</button>` : null}
          <button class="btn ghost" onClick=${onHome}>回关卡表</button>
        </div>
      </div>
    </div>`;
}
