// 小图：迷你走势（仪表盘）与史评里的单序列折线（带悬停读数、潮汐阶段底纹、可叠加「公布值」虚线）。
// 每张图只画一个量（不做双轴）；两条线时一定有图例。
import { html, useState } from '../../vendor/htm-preact.js';

export function Spark({ values, w = 64, h = 26, color }) {
  const v = values.filter(x => Number.isFinite(x));
  if (v.length < 2) return html`<svg class="spark" viewBox=${`0 0 ${w} ${h}`}></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((y, i) => [2 + (i / (v.length - 1)) * (w - 4), h - 3 - ((y - lo) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return html`<svg class="spark" viewBox=${`0 0 ${w} ${h}`} aria-hidden="true">
    <path d=${d} style=${color ? { stroke: color } : null} /><circle cx=${last[0]} cy=${last[1]} r="2.2" />
  </svg>`;
}

const PHASE_ORDER = ['fangshui', 'chuipao', 'shoushui', 'shouge'];

export function LineChart({ title, rows, get, getRep, fmt = v => v.toFixed(1), unit = '', repLabel = '公布值', zero }) {
  const [hover, setHover] = useState(null);
  const W = 260, H = 110, L = 30, R = 6, T = 8, B = 16;
  const xs = rows.map(r => r.q);
  const ys = rows.map(get);
  const rs = getRep ? rows.map(getRep) : null;
  const all = [...ys, ...(rs || []), ...(zero != null ? [zero] : [])].filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const X = q => L + ((q - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0])) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  // 收水/收割阶段底纹
  const bands = [];
  rows.forEach((r, i) => { if (i && (r.phase === 'shoushui' || r.phase === 'shouge')) bands.push(i); });
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const onMove = e => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    xs.forEach((q, i) => { if (Math.abs(X(q) - x) < Math.abs(X(xs[best]) - x)) best = i; });
    setHover(best);
  };
  return html`<div class="chart">
    <h5><span>${title}</span><span class="num">${fmt(ys[ys.length - 1])}${unit}</span></h5>
    <svg viewBox=${`0 0 ${W} ${H}`} onMouseMove=${onMove} onMouseLeave=${() => setHover(null)} role="img" aria-label=${`${title}走势`}>
      ${bands.map(i => html`<rect class="phase-band" x=${X(xs[i - 1])} y=${T} width=${X(xs[i]) - X(xs[i - 1])} height=${H - T - B} />`)}
      ${ticks.map(t => html`<line class="grid" x1=${L} x2=${W - R} y1=${Y(t)} y2=${Y(t)} /><text class="axis" x=${L - 4} y=${Y(t) + 3} text-anchor="end">${fmt(t)}</text>`)}
      ${xs.filter((q, i) => i % 3 === 0 || i === xs.length - 1).map(q => html`<text class="axis" x=${X(q)} y=${H - 3} text-anchor="middle">${q === 0 ? '就任' : 'Q' + q}</text>`)}
      ${rs ? html`<path class="line rep" d=${path(rs)} />` : null}
      <path class="line" d=${path(ys)} />
      ${hover != null ? html`<line class="hover-line" x1=${X(xs[hover])} x2=${X(xs[hover])} y1=${T} y2=${H - B} /><circle class="dot" cx=${X(xs[hover])} cy=${Y(ys[hover])} r="3.5" />` : null}
    </svg>
    ${hover != null ? html`<div class="tip" style=${{ left: `${(X(xs[hover]) / W) * 100}%`, top: `${(Y(ys[hover]) / H) * 110 + 18}px` }}>
      ${xs[hover] === 0 ? '就任' : `第 ${xs[hover]} 季`} · ${fmt(ys[hover])}${unit}${rs ? ` · ${repLabel} ${fmt(rs[hover])}${unit}` : ''}</div>` : null}
    ${rs ? html`<div class="legend"><span><i></i>真实</span><span><i class="rep"></i>${repLabel}</span></div>` : null}
  </div>`;
}

// 扭索纹（钞票防伪花纹）：几组参数化外摆线叠成玫瑰花饰
export function Guilloche({ className = 'guilloche' }) {
  const rings = [];
  const mk = (R, r, d, n, turns = 1) => {
    let s = '';
    const steps = 1400;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * turns;
      const x = 500 + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = 500 + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      s += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return s;
  };
  rings.push({ d: mk(420, 36, 70, 0, 3), c: 'rgba(196,154,82,.55)', w: 0.7 });
  rings.push({ d: mk(330, 22, 60, 0, 11), c: 'rgba(127,163,122,.45)', w: 0.6 });
  rings.push({ d: mk(250, 50, 40, 0, 1), c: 'rgba(239,233,220,.35)', w: 0.6 });
  rings.push({ d: mk(170, 14, 36, 0, 7), c: 'rgba(196,154,82,.4)', w: 0.5 });
  return html`<svg class=${className} viewBox="0 0 1000 1000" aria-hidden="true">
    <g>${rings.filter((_, i) => i % 2 === 0).map(r => html`<path d=${r.d} fill="none" stroke=${r.c} stroke-width=${r.w} />`)}</g>
    <g class="rev">${rings.filter((_, i) => i % 2 === 1).map(r => html`<path d=${r.d} fill="none" stroke=${r.c} stroke-width=${r.w} />`)}</g>
    <circle cx="500" cy="500" r="455" fill="none" stroke="rgba(196,154,82,.25)" stroke-width="1" />
    <circle cx="500" cy="500" r="462" fill="none" stroke="rgba(196,154,82,.18)" stroke-width="0.6" stroke-dasharray="2 5" />
  </svg>`;
}
