// 扉页、关卡选择、关卡简报。
import { html } from '../../vendor/htm-preact.js';
import { fmt, money } from './charts.js';
import { START_EQUITY } from '../sim/defs.js';

export function TitleScreen({ onStart, onHome }) {
  return html`
    <div class="title-screen">
      <${Guilloche} />
      <div class="title-card">
        <div class="eyebrow">Wall Street · Harvest</div>
        <h1 class="title-word">猎潮</h1>
        <div class="title-quote">
          收割者从不制造危机，只等它发生
          <small>《庙算》的另一面 · 你这次坐在交易台这一侧</small>
        </div>
        <p class="title-sub">
          《庙算》让你治理一个被美元潮汐冲刷的国家；《猎潮》让你成为潮汐本身的一部分——
          六场真实危机，从 1982 年墨西哥说「我还不起了」，到 2012 年德拉吉一句「不惜一切代价」把全欧洲的空头轧平。
          危机的方向事后看是确定的，难的是三件事：<b>什么时候进、用多大杠杆、什么时候跑</b>。
          太早会被持仓成本磨死，太晚会一无所得，跑晚了会被政策亲手反杀。
        </p>
        <div class="title-actions">
          <button class="btn primary" onClick=${onStart}>进入交易台 →</button>
          <a class="btn brass" href="/games/">← 研学游戏馆</a>
        </div>
        <div class="title-links">
          <a href="/games/statecraft/">对照《庙算》：当一回被收割的国家 →</a>
        </div>
      </div>
    </div>`;
}

export function LevelsScreen({ levels, best, onPick, onHome }) {
  return html`
    <div class="levels">
      <div class="levels-head">
        <h2>选择一场危机</h2>
        <span class="muted">起始权益 ${START_EQUITY}M · 每关七回合 · 评级从「清盘」到「秃鹫」</span>
      </div>
      <div class="level-grid">
        ${levels.map(L => {
          const b = best[L.id];
          return html`
            <button class="lv-card" key=${L.id} onClick=${() => onPick(L)}>
              <span class="lv-badge ${b ? 'done' : ''}">${b ? b.grade : '未通关'}</span>
              <div class="lv-num">${L.num}</div>
              <div class="lv-title">${L.title}</div>
              <div class="lv-meta">${L.year} · ${L.place}</div>
              <div class="lv-concept">${L.concept}</div>
              <div class="lv-concept faint" style="margin-top:8px">${L.lesson}</div>
              ${b ? html`<div class="lv-best up">最佳 ${fmt(b.equity)}M</div>` : html`<div class="lv-best faint">尚无战绩</div>`}
            </button>`;
        })}
      </div>
      <div class="row" style="margin-top:24px">
        <a class="btn ghost" href="/games/">← 研学游戏馆</a>
        <span class="faint" style="font-size:12px">六关互不依赖，可以从任意一场开始。</span>
      </div>
    </div>`;
}

export function BriefScreen({ level, onStart, onBack }) {
  return html`
    <div class="brief">
      <div class="b-meta">${level.num} · ${level.year} · ${level.place}</div>
      <h2>${level.title}</h2>
      <div class="b-meta">${level.concept}</div>
      <p class="b-body">${level.brief}</p>
      <div class="b-lesson">${level.lesson}</div>
      <div class="b-rules">
        <h3>这一场的规则</h3>
        <ul>
          <li>起始权益 <b>${START_EQUITY}M</b>；一档仓位 = <b>30M 名义本金</b>，占用保证金 6M。总仓位受可用保证金约束。</li>
          <li>每回合按市值计价：<b>收益 = 方向 × 标的涨跌 × 名义本金 − 持仓成本</b>。做空主权货币、买 CDS 的成本最贵。</li>
          <li><b>监管热度</b>：仓位越重、做得越招摇，热度涨得越快；到顶会招来政策干预（本场是「${level.crackdown.title}」）。可花钱公关降温。</li>
          <li><b>流动性</b>下滑会抬高维持保证金要求：方向对也可能被强平——1998 年长期资本管理公司就是这么死的。</li>
          <li>最后一两个回合通常解锁<b>抄底仓位</b>：收割的钱，一半来自做空，一半来自抄底。</li>
        </ul>
      </div>
      <div class="b-actions">
        <button class="btn primary" onClick=${onStart}>开盘 →</button>
        <button class="btn ghost" onClick=${onBack}>换一场</button>
      </div>
    </div>`;
}

export function Guilloche() {
  // 钞票扭索纹：一圈圈细线，纯装饰
  const rings = Array.from({ length: 7 }, (_, i) => 120 + i * 52);
  return html`
    <svg class="guilloche" viewBox="0 0 1000 1000" aria-hidden="true">
      <g>
        ${rings.map((r, i) => html`
          <circle key=${i} cx="500" cy="500" r=${r} fill="none" stroke="rgba(201,162,74,.16)" stroke-width=${i % 2 ? 1 : 0.6} />`)}
      </g>
      <g class="rev">
        ${rings.map((r, i) => html`
          <ellipse key=${i} cx="500" cy="500" rx=${r} ry=${r * 0.42} fill="none"
            stroke="rgba(233,227,214,.08)" stroke-width="0.6" transform=${`rotate(${i * 13} 500 500)`} />`)}
      </g>
    </svg>`;
}
