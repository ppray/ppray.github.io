// 图表：全部手写 SVG，不引第三方库（这台「终端」要保持离线可用）。
import { html } from '../../vendor/htm-preact.js';

// 迷你走势：交易台右上角的权益曲线
export function Sparkline({ values, w = 200, h = 40, up = true }) {
  if (!values || values.length < 2) return html`<svg width=${w} height=${h}></svg>`;
  const mn = Math.min(...values), mx = Math.max(...values);
  const span = (mx - mn) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 2 - ((v - mn) / span) * (h - 6);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const good = up ? values[values.length - 1] >= values[0] : values[values.length - 1] <= values[0];
  const stroke = good ? 'var(--up)' : 'var(--down)';
  return html`
    <svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} role="img" aria-label="权益走势">
      <path d=${d} fill="none" stroke=${stroke} stroke-width="1.6" stroke-linejoin="round" />
      <circle cx=${last[0]} cy=${last[1]} r="2.4" fill=${stroke} />
    </svg>`;
}

// 通报用的完整曲线：带基准线（起始 100）与刻度
export function EquityCurve({ curve, dates, w = 620, h = 150 }) {
  const mn = Math.min(...curve, 100), mx = Math.max(...curve, 100);
  const pad = 26;
  const span = (mx - mn) || 1;
  const pts = curve.map((v, i) => [
    pad + (i / Math.max(1, curve.length - 1)) * (w - pad - 8),
    h - pad - ((v - mn) / span) * (h - pad - 18),
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${(h - pad).toFixed(1)} L${pts[0][0].toFixed(1)} ${(h - pad).toFixed(1)} Z`;
  const yBase = h - pad - ((100 - mn) / span) * (h - pad - 18);
  return html`
    <svg viewBox=${`0 0 ${w} ${h}`} width="100%" height=${h} role="img" aria-label="权益曲线">
      <path d=${area} fill="rgba(201,162,74,.12)" />
      <line x1=${pad} y1=${yBase.toFixed(1)} x2=${w - 8} y2=${yBase.toFixed(1)} stroke="rgba(29,27,23,.35)" stroke-dasharray="4 3" />
      <text x="2" y=${(yBase + 4).toFixed(1)} font-size="10" fill="var(--paper-muted)" font-family="var(--mono)">100</text>
      <path d=${d} fill="none" stroke="var(--alert)" stroke-width="2" stroke-linejoin="round" />
      ${pts.map((p, i) => html`<circle key=${i} cx=${p[0].toFixed(1)} cy=${p[1].toFixed(1)} r="2.6" fill="var(--alert)" />`)}
      ${dates.map((dt, i) => html`
        <text key=${'t' + i} x=${pts[i][0].toFixed(1)} y=${h - 8} font-size="9.5" fill="var(--paper-muted)"
              text-anchor="middle" font-family="var(--mono)">${shortDate(dt)}</text>`)}
    </svg>`;
}

function shortDate(s) {
  if (s === '开局') return '开局';
  return String(s).replace(/(\d{4})年/, '$1·').replace(/月.*$/, '').slice(0, 8);
}

// 横条仪表：热度、流动性、保证金占用
export function Gauge({ label, value, max = 100, color = 'var(--brass)', note, danger }) {
  const pct = Math.max(0, Math.min(1, (value || 0) / max));
  return html`
    <div class="gauge">
      <div class="g-top">
        <span class="muted">${label}</span>
        <span class="v num" style=${danger ? 'color:var(--up-2)' : ''}>${fmt(value)}${max === 100 ? '%' : ''}</span>
      </div>
      <div class="g-track"><div class="g-fill" style=${`width:${(pct * 100).toFixed(1)}%;background:${danger ? 'var(--up)' : color}`}></div></div>
      ${note ? html`<div class="g-note">${note}</div>` : null}
    </div>`;
}

export function fmt(v, d = 1) {
  if (!Number.isFinite(v)) return '—';
  return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
}
export function pct(v, d = 1) {
  return (v >= 0 ? '+' : '') + fmt(v * 100, d) + '%';
}
export function money(v) {
  return (v >= 0 ? '' : '-') + '$' + fmt(Math.abs(v), 1) + 'M';
}
