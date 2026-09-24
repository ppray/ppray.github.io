// 潮汐图：中心（美元/美联储）与外围之间的资金潮。放水期光点从中心流向外围，收水期倒流回中心。
// 华胥那条线的粗细与光点密度取决于本季实际的资本净流动（eco.kf），方向取决于正负。
import { html } from '../../vendor/htm-preact.js';
import { PHASES } from '../sim/defs.js';

const NODES = [
  { id: 'me', label: null, x: 520, y: 160, r: 30, me: true },
  { id: 'asean', label: '东海岸五国', x: 468, y: 62, r: 16 },
  { id: 'oil', label: '产油国', x: 560, y: 262, r: 15 },
  { id: 'latam', label: '拉美', x: 382, y: 272, r: 15 },
  { id: 'eu', label: '欧洲', x: 356, y: 46, r: 18, semi: true },
];
const CENTER = { x: 150, y: 160 };

export function TideMap({ S, compact }) {
  const phase = S.world.phase;
  const ebb = phase === 'shoushui' || phase === 'shouge';
  const kf = S.eco.kf;
  const fed = S.world.fed;
  const level = Math.min(1, fed / 5);
  const arcs = NODES.map(n => {
    const mx = (CENTER.x + n.x) / 2, my = (CENTER.y + n.y) / 2 - (n.y < 160 ? 40 : n.y > 160 ? -40 : 0) - (n.me ? 30 : 0);
    const d = `M${CENTER.x},${CENTER.y} Q${mx},${my} ${n.x},${n.y}`;
    const out = n.me ? kf < 0 : ebb;                          // true = 流回中心
    const mag = n.me ? Math.min(1, Math.abs(kf) / 40) : (phase === 'fangshui' ? 0.7 : phase === 'shouge' ? 0.8 : 0.45);
    return { n, d, out, mag, id: `arc-${n.id}` };
  });
  return html`<svg class="tide-svg" viewBox="0 0 640 320" role="img" aria-label=${`美元潮汐：${PHASES[phase].label}期，美联储利率 ${fed}%，${S.name}本季资本净流${kf >= 0 ? '入' : '出'} ${Math.abs(Math.round(kf * 10))} 亿美元`}>
    <defs>
      <radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7fa37a" stop-opacity=".35" /><stop offset="1" stop-color="#7fa37a" stop-opacity="0" /></radialGradient>
      <linearGradient id="water" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7fa37a" stop-opacity=".75" /><stop offset="1" stop-color="#3f6b4a" stop-opacity=".9" /></linearGradient>
    </defs>
    <!-- 潮位计：美联储利率 -->
    <g transform="translate(26,40)">
      <rect x="0" y="0" width="18" height="240" rx="2" fill="none" stroke="rgba(236,229,214,.3)" />
      <rect x="1.5" y=${240 - 237 * level} width="15" height=${237 * level} fill="url(#water)">
        <animate attributeName="y" values=${`${240 - 237 * level};${238 - 237 * level};${240 - 237 * level}`} dur="3s" repeatCount="indefinite" />
      </rect>
      ${[0, 1, 2, 3, 4, 5].map(k => html`<g><line x1="18" x2="24" y1=${240 - k * 48} y2=${240 - k * 48} stroke="rgba(236,229,214,.35)" /><text x="28" y=${244 - k * 48} font-size="10" fill="rgba(236,229,214,.5)" font-family="var(--mono)">${k}%</text></g>`)}
      <text x="-2" y="-12" font-size="11" fill="rgba(236,229,214,.7)" letter-spacing="2">潮位</text>
    </g>
    <!-- 中心 -->
    <circle cx=${CENTER.x} cy=${CENTER.y} r="78" fill="url(#cg)" />
    ${[58, 50, 42].map((r, i) => html`<circle cx=${CENTER.x} cy=${CENTER.y} r=${r} fill="none" stroke="rgba(127,163,122,.5)" stroke-width=${i ? 0.6 : 1.2} stroke-dasharray=${i === 1 ? '2 3' : null} />`)}
    <text x=${CENTER.x} y=${CENTER.y - 4} text-anchor="middle" font-family="var(--serif)" font-weight="900" font-size="22" fill="#e9e3d6">美元</text>
    <text x=${CENTER.x} y=${CENTER.y + 16} text-anchor="middle" font-size="11" fill="rgba(236,229,214,.65)" font-family="var(--mono)">FED ${fed.toFixed(2)}%</text>
    <!-- 流 -->
    ${arcs.map(a => html`<path id=${a.id} d=${a.d} fill="none" stroke=${a.out ? 'rgba(224,86,61,.45)' : 'rgba(127,163,122,.5)'} stroke-width=${a.n.me ? 1 + a.mag * 5 : 1 + a.mag * 1.5} stroke-linecap="round" />`)}
    ${arcs.flatMap(a => {
      const count = Math.max(1, Math.round((a.n.me ? 2 + a.mag * 9 : 1 + a.mag * 3)));
      const dur = a.n.me ? 3.2 - a.mag * 1.2 : 4.2;
      return Array.from({ length: compact ? Math.min(count, 4) : count }, (_, k) => html`<circle r=${a.n.me ? 3 : 2} fill=${a.out ? '#e0563d' : '#9cc596'}>
        <animateMotion dur=${`${dur}s`} repeatCount="indefinite" begin=${`${-(k / count) * dur}s`} keyPoints=${a.out ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear"><mpath href=${`#${a.id}`} /></animateMotion>
      </circle>`);
    })}
    <!-- 外围 -->
    ${NODES.map(n => html`<g>
      <circle cx=${n.x} cy=${n.y} r=${n.r} fill=${n.me ? '#efe9dc' : 'rgba(236,229,214,.08)'} stroke=${n.me ? '#c23a24' : n.semi ? 'rgba(196,154,82,.6)' : 'rgba(236,229,214,.35)'} stroke-width=${n.me ? 2 : 1} />
      ${n.me ? html`<text x=${n.x} y=${n.y + 6} text-anchor="middle" font-family="var(--serif)" font-weight="900" font-size="17" fill="#1d1b17">${S.name}</text>`
        : html`<text x=${n.x} y=${n.y + n.r + 14} text-anchor="middle" font-size="11" fill="rgba(236,229,214,.6)">${n.label}${n.semi ? '（半外围）' : ''}</text>`}
    </g>`)}
    <g transform="translate(470,210)">
      <text x="50" y="0" text-anchor="middle" font-size="11" fill="rgba(236,229,214,.6)">本季资本净流${kf >= 0 ? '入' : '出'}</text>
      <text x="50" y="22" text-anchor="middle" font-family="var(--mono)" font-size="18" font-weight="600" fill=${kf >= 0 ? '#9cc596' : '#e0563d'}>${kf >= 0 ? '+' : '−'}${Math.abs(Math.round(kf * 10))} 亿$</text>
    </g>
  </svg>`;
}
