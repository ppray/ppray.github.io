/**
 * 《帝国的账本》世界海图渲染模块（深色游戏化 HUD 版）
 * 输出：renderMap(state, container, callbacks, opts)
 * - 优先使用 CDN 的 d3 + world-atlas 真实世界地图；
 * - CDN 不可用时自动降级为简化海图（等距圆柱投影 + 经纬网 + 标记/航线）。
 */

const NATION_MARKS = {
    GBR: { coord: [-0.13, 51.5], hex: '#c2513a', ldx: -9, anchor: 'end' },
    PRS: { coord: [13.4, 52.5], hex: '#c99a3f', ldx: 9, anchor: 'start', below: true },
    QING: { coord: [116.4, 39.9], hex: '#4fa06a', ldx: 0, anchor: 'middle' },
    USA: { coord: [-77, 38.9], hex: '#5b8fd6', ldx: 0, anchor: 'middle' }
};

const ROUTES = [['GBR', 'QING'], ['GBR', 'USA'], ['GBR', 'PRS'], ['QING', 'USA']];

const LIB_D3 = 'https://unpkg.com/d3@7.9.0/dist/d3.min.js';
const LIB_TOPOJSON = 'https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js';
const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

const SVG_NS = 'http://www.w3.org/2000/svg';

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('script load failed: ' + src));
        document.head.appendChild(s);
    });
}

async function ensureLibs() {
    if (!window.d3) await injectScript(LIB_D3);
    if (!window.topojson) await injectScript(LIB_TOPOJSON);
}

async function fetchWorld() {
    const res = await fetch(WORLD_URL);
    if (!res.ok) throw new Error('world atlas fetch failed');
    return res.json();
}

function el(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
}

/**
 * @param {object} state 游戏状态
 * @param {HTMLElement} container 地图容器
 * @param {object} callbacks { onNationClick(code) }
 * @param {object} opts { leftPad } 面板打开时左移地图
 */
export async function renderMap(state, container, callbacks = {}, opts = {}) {
    container.innerHTML = '';
    const w = Math.max(1000, container.clientWidth || 1000);
    const h = Math.max(640, container.clientHeight || 640);
    const leftPad = opts.leftPad ?? 70;

    const svg = el('svg', { viewBox: `0 0 ${w} ${h}` });
    container.appendChild(svg);

    let d3 = window.d3 || null;
    let topojson = window.topojson || null;
    try {
        await ensureLibs();
        d3 = window.d3;
        topojson = window.topojson;
    } catch (e) { /* 降级渲染 */ }

    let projection = null;
    let geoPath = null;

    if (d3) {
        projection = d3.geoNaturalEarth1()
            .fitExtent([[leftPad, 96], [w - 40, h - 120]], { type: 'Sphere' });
        geoPath = d3.geoPath(projection);

        // 海洋径向渐变
        const defs = el('defs');
        const grad = el('radialGradient', { id: 'seaGrad', cx: '50%', cy: '42%' });
        grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'oklch(24% 0.035 250)' }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'oklch(13% 0.025 250)' }));
        defs.appendChild(grad);
        svg.appendChild(defs);

        svg.appendChild(el('path', { d: geoPath({ type: 'Sphere' }), fill: 'url(#seaGrad)' }));
        svg.appendChild(el('path', {
            d: geoPath(d3.geoGraticule10()), fill: 'none',
            stroke: 'oklch(72% 0.11 75)', 'stroke-width': 0.35, opacity: 0.14
        }));

        // 世界陆地
        try {
            if (!topojson) throw new Error('topojson missing');
            const topo = await fetchWorld();
            const world = topojson.feature(topo, topo.objects.countries);
            const activeIso = Object.keys(NATION_MARKS).map(c => ({ GBR: 826, PRS: 276, QING: 156, USA: 840 }[c]));
            const isoHex = { 826: NATION_MARKS.GBR.hex, 276: NATION_MARKS.PRS.hex, 156: NATION_MARKS.QING.hex, 840: NATION_MARKS.USA.hex };
            world.features.forEach(f => {
                const iso = +f.id;
                const active = activeIso.includes(iso);
                svg.appendChild(el('path', {
                    d: geoPath(f),
                    fill: active ? isoHex[iso] : 'oklch(46% 0.02 250)',
                    'fill-opacity': active ? 0.55 : 0.5,
                    stroke: 'oklch(16% 0.02 250)', 'stroke-width': 0.5
                }));
            });
        } catch (e) { /* 无世界地图时仅保留球面与经纬网 */ }
    } else {
        // 降级：等距圆柱投影
        projection = ([lon, lat]) => [
            leftPad + ((lon + 180) / 360) * (w - leftPad - 40),
            96 + ((90 - lat) / 180) * (h - 216)
        ];
        svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: 'oklch(15% 0.028 250)' }));
        for (let lon = -180; lon <= 180; lon += 30) {
            const [x] = projection([lon, 0]);
            svg.appendChild(el('line', { x1: x, y1: 96, x2: x, y2: h - 120, stroke: 'oklch(72% 0.11 75)', 'stroke-width': 0.4, opacity: 0.12 }));
        }
        for (let lat = -60; lat <= 60; lat += 30) {
            const [, y] = projection([0, lat]);
            svg.appendChild(el('line', { x1: leftPad, y1: y, x2: w - 40, y2: y, stroke: 'oklch(72% 0.11 75)', 'stroke-width': 0.4, opacity: 0.12 }));
        }
    }

    // 贸易航线（流动虚线）
    ROUTES.forEach(([a, b]) => {
        const pa = projection(NATION_MARKS[a].coord);
        const pb = projection(NATION_MARKS[b].coord);
        const d = d3
            ? geoPath({ type: 'LineString', coordinates: [NATION_MARKS[a].coord, NATION_MARKS[b].coord] })
            : `M${pa[0]} ${pa[1]} Q${(pa[0] + pb[0]) / 2} ${Math.min(pa[1], pb[1]) - 40} ${pb[0]} ${pb[1]}`;
        svg.appendChild(el('path', {
            d, class: 'arc', stroke: NATION_MARKS[a].hex, 'stroke-width': 1.6, opacity: 0.75
        }));
    });

    // 国家标记
    const player = state.playerNationKey;
    Object.entries(NATION_MARKS).forEach(([code, m]) => {
        const [x, y] = projection(m.coord);
        const gdp = state.derivedStats?.[code]?.gdp ?? state.nations?.[code]?.gdp ?? 500;
        const r = 5 + Math.sqrt(Math.max(50, gdp)) / 9;
        const g = el('g', { class: 'marker', transform: `translate(${x},${y})` });
        g.addEventListener('click', () => callbacks.onNationClick && callbacks.onNationClick(code));

        g.appendChild(el('circle', { class: 'halo', r: r * 2.6, fill: m.hex }));
        g.appendChild(el('circle', {
            r,
            fill: m.hex,
            stroke: code === player ? 'oklch(96% 0.02 85)' : 'oklch(18% 0.02 250)',
            'stroke-width': code === player ? 2.2 : 1.2
        }));
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', m.ldx || 0);
        label.setAttribute('y', m.below ? r + 15 : -r - 9);
        label.setAttribute('text-anchor', m.anchor || 'middle');
        label.setAttribute('font-weight', code === player ? 700 : 400);
        label.textContent = state.nations?.[code]?.name || code;
        g.appendChild(label);
        svg.appendChild(g);
    });
}
