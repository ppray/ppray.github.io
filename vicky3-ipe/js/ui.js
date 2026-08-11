/**
 * 《帝国的账本：核心与边缘》 v3.5
 * 深色游戏化 HUD 版 UI（按 UI/UX 优化讨论稿落地）
 * 架构：Single State + Full Redraw；引擎保持纯函数 tick 不变。
 */

import { createInitialState, tick } from './engine/core.js';
import { calculateMarketAndPrices } from './engine/market.js';
import { calculateFactorReturnsAndPops } from './engine/pops.js';
import { GOODS } from './data/goods.js';
import { BUILDINGS } from './data/buildings.js';
import { IPE_THEORY_DATA } from './ipe-theory.js';
import { renderMap } from './map.js';

const SAVE_KEY = 'empire_ledger_state_v33';

const TABS = [
    { id: 'tariffs', mk: 'S-S', lb: '关税', title: '关税与政治', sub: '斯托尔珀-萨缪尔森定理' },
    { id: 'industry', mk: 'IND', lb: '产业', title: '产业建设', sub: '产能与生产配方' },
    { id: 'market', mk: 'MKT', lb: '市场', title: '全球市场', sub: '撮合价格与供需' },
    { id: 'codex', mk: 'IPE', lb: '图鉴', title: 'IPE 理论图鉴', sub: '贯穿本局的核心理论' }
];

const NATION_META = {
    GBR: { hex: '#c2513a', role: '核心' },
    PRS: { hex: '#c99a3f', role: '半核心' },
    QING: { hex: '#4fa06a', role: '边缘' },
    USA: { hex: '#5b8fd6', role: '半边缘' }
};

/* 周期历史事件（每 3 回合触发一次，循环） */
const EVENTS = [
    {
        tag: '议会动议', title: '《谷物法》存废之争',
        body: '曼彻斯特的工厂主联名请愿废除谷物关税，地主阶层则警告地租崩塌将动摇乡村秩序。内阁需在本回合表态。',
        opts: [
            { t: '废除谷物法，粮食关税归零', d: '资本家收益上升，地主阶层强烈不满', log: '议会通过废除《谷物法》：粮食关税降至 0%，资本家 Clout 上升。', fx: n => { n.tariffs.grain = 0; } },
            { t: '维持保护，安抚地主', d: '地租维持高位，工业扩张放缓', log: '内阁维持《谷物法》：地租维持高位，纺织资本扩张放缓。' }
        ]
    },
    {
        tag: '海关照会', title: '白银外流与关税自主',
        body: '广州海关报告白银持续外流，朝廷内部就是否提高进口关税、重整通商口岸展开争论。',
        opts: [
            { t: '提高制成品关税至 40%', d: '短期财政改善，贸易条件或进一步承压', log: '提高制成品关税至 40%：财政改善，ToT 承压。', fx: n => { ['steel', 'tools', 'textiles', 'arms'].forEach(g => { n.tariffs[g] = 0.40; }); } },
            { t: '维持现状，换取通商稳定', d: '避免摩擦，白银外流持续', log: '维持现行税率：通商稳定，白银外流未止。' }
        ]
    },
    {
        tag: '技术扩散', title: '铁路时代的资本需求',
        body: '铁路投资吸走大量社会资本，银行要求政府担保发债，工人则涌向新的铁路工地。',
        opts: [
            { t: '政府担保铁路债券', d: '投资池注入 ¥150，国库承压 ¥200', log: '政府为铁路债券提供担保：投资池扩张，国库负担加重。', fx: n => { n.treasury -= 200; n.investmentPool = (n.investmentPool || 0) + 150; } },
            { t: '交由私人资本自行融资', d: '国库无损，扩张速度受限', log: '铁路交由私人资本融资：国库无损，扩张速度受限。' }
        ]
    }
];

let gameState = null;
let viewNation = 'GBR';      // 面板查看的国家（操作仅对本国生效）
let activeTab = 'tariffs';
let lastDelta = null;        // 上一回合结算差值
let eventQueue = [];
let endgameShown = false;

/* ---------------- 初始化与存档 ---------------- */

export function initUI() {
    const saved = localStorage.getItem(SAVE_KEY);
    const hadSave = !!saved;
    if (saved) {
        try { gameState = JSON.parse(saved); } catch (e) { gameState = createInitialState('GBR'); }
    } else {
        gameState = createInitialState('GBR');
    }
    viewNation = gameState.playerNationKey;

    document.getElementById('btn-turn').addEventListener('click', onNextTurn);
    document.getElementById('btn-new').addEventListener('click', onNewGame);
    document.getElementById('btn-help').addEventListener('click', showHelp);
    document.getElementById('panel-close').addEventListener('click', () => openTab(null));

    render();
    if (!hadSave) showHelp();
}

function saveState() {
    if (gameState) localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
}

/* ---------------- 回合与事件 ---------------- */

function onNextTurn() {
    if (gameState.gameStatus !== 'PLAYING') {
        if (!endgameShown) showEndgame();
        return;
    }
    const prev = gameState;
    const prevNation = prev.nations[prev.playerNationKey];
    const prevStats = prev.derivedStats?.[prev.playerNationKey] || {};

    gameState = tick(gameState);

    const now = gameState.nations[gameState.playerNationKey];
    const nowStats = gameState.derivedStats?.[gameState.playerNationKey] || {};
    lastDelta = {
        treasury: Math.round(now.treasury - prevNation.treasury),
        gdp: Math.round((nowStats.gdp ?? 0) - (prevStats.gdp ?? 0)),
        heg: Math.round(gameState.hegemonyScore - (prev.hegemonyScore ?? gameState.hegemonyScore)),
        tot: Math.round((nowStats.termsOfTrade ?? 0) - (prevStats.termsOfTrade ?? 0))
    };

    if (gameState.turn % 3 === 0) {
        eventQueue.push(EVENTS[(gameState.turn / 3 - 1) % EVENTS.length]);
    }

    saveState();
    render();
    if (gameState.gameStatus !== 'PLAYING') showEndgame();
    else showNextEvent();
}

function onNewGame() {
    showModal({
        tag: '新局', title: '重新开始一局？',
        body: '当前进度将被清空，回到 1836 年开局。',
        opts: [
            { t: '确认重开', d: `以 ${gameState.nations[gameState.playerNationKey].name} 重新开局`, fx: () => { gameState = createInitialState(gameState.playerNationKey); viewNation = gameState.playerNationKey; lastDelta = null; endgameShown = false; eventQueue = []; saveState(); } },
            { t: '取消', d: '继续当前对局' }
        ]
    });
}

function showNextEvent() {
    if (!eventQueue.length) return;
    const ev = eventQueue.shift();
    showModal({
        tag: ev.tag, title: ev.title, body: ev.body,
        opts: ev.opts.map(o => ({
            t: o.t, d: o.d,
            fx: () => {
                if (o.fx) o.fx(gameState.nations[gameState.playerNationKey]);
                gameState.logs.unshift(`${gameState.year} · ${o.log}`);
                saveState();
            }
        }))
    });
}

/* 规则帮助弹窗：流程 / 操作 / 本国胜负条件 */
function showHelp() {
    const n = gameState.nations[gameState.playerNationKey];
    showModal({
        tag: '玩法说明', title: '帝国的账本 · 规则速览',
        body: `
            <p><b style="color:var(--brass)">回合流程</b><br>
            1836 年开局并完成首年市场出清（开局即 1837 / 第 2 回合），此后每点一次「下一回合」再推进一年：全球市场撮合定价 → 三阶级（地主/资本家/工人）分配地租、利润、工资并演化政治影响力（Clout）→ 财政结算（关税+税收−补贴−霸权成本）→ 投资池驱动产业扩产 → 人口与贸易条件更新。除本国外的三国由 AI 脚本治理。</p>
            <p style="margin-top:10px"><b style="color:var(--brass)">可用操作</b><br>
            · 左侧竖排：关税（8 种商品进口税、所得税、补贴）、产业（建造 8 类建筑）、市场（全球价格与净出口）、图鉴（IPE 理论）<br>
            · 底部国家坞 / 点击地图标记：切换查看别国账本（AI 国只读，本国可操作）<br>
            · 关税滑杆拖动即时预览<b>净进口商品</b>对到岸价与阶层收益的影响（行尾标注生效状态），松手生效；每 3 回合触发一次历史事件抉择</p>
            <p style="margin-top:10px"><b style="color:var(--brass)">核心学理</b><br>
            斯托尔珀-萨缪尔森定理：关税对<b>净进口商品</b>（如本国需进口的原料）当回合即改变国内到岸价、重塑阶层收益；对<b>净出口商品</b>则通过长期贸易条件与产能再配置缓慢传导——其福利分配效应（S-S 动态涌现）通常需 10 个回合以上才显著。边缘国另受 Prebisch-Singer 贸易条件长期恶化约束。</p>
            <p style="margin-top:14px;border-top:1px solid oklch(72% 0.11 75 / .25);padding-top:12px">
            <b style="color:var(--verdant)">🎯 ${n.flag} ${n.name} · 胜利条件</b><br>${n.winCondition.desc}<br>
            <b style="color:oklch(72% 0.14 30);margin-top:6px;display:inline-block">💀 失败条件</b><br>${n.loseCondition.desc}</p>`,
        opts: [
            { t: '开始执政', d: '关闭说明，回到 1836 年的账本前' }
        ]
    });
}

function showEndgame() {
    endgameShown = true;
    const n = gameState.nations[gameState.playerNationKey];
    const won = gameState.gameStatus === 'WON';
    showModal({
        tag: won ? '战略胜利' : '国家危机', tagClass: won ? 'win' : 'lose',
        title: won ? '🏆 达成历史战略目标' : '⚠️ 触及失败防线',
        body: won ? `胜利条件：${n.winCondition.desc}` : `失败条件：${n.loseCondition.desc}`,
        opts: [
            { t: '重新开局', d: '回到 1836 年，延续同一国家', fx: () => { gameState = createInitialState(gameState.playerNationKey); viewNation = gameState.playerNationKey; lastDelta = null; endgameShown = false; eventQueue = []; saveState(); } },
            { t: '留在终局画面', d: '查看最终账本' }
        ]
    });
}

function showModal({ tag, tagClass = '', title, body, opts }) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="event frame">
        <div class="head"><div class="tag ${tagClass}">${tag}</div><h2>${title}</h2></div>
        <div class="body"><p>${body}</p>
            <div class="opts">${opts.map((o, i) => `<button data-i="${i}"><div class="t">${o.t}</div><div class="d">${o.d}</div></button>`).join('')}</div>
        </div></div>`;
    document.getElementById('stage').appendChild(wrap);
    wrap.querySelectorAll('.opts button').forEach(b => {
        b.onclick = () => {
            const o = opts[+b.dataset.i];
            if (o.fx) o.fx();
            wrap.remove();
            render();
            if (!eventQueue.length && gameState.gameStatus === 'PLAYING') return;
            showNextEvent();
        };
    });
}

/* ---------------- 渲染 ---------------- */

function render() {
    if (!gameState) return;
    renderHUD();
    renderNations();
    renderRail();
    renderPanel();
    renderLog();
    renderMapPane();
}

function renderHUD() {
    const code = gameState.playerNationKey;
    const n = gameState.nations[code];
    const st = gameState.derivedStats?.[code] || {};
    const d = lastDelta || {};

    document.getElementById('crest-flag').textContent = n.flag;
    document.getElementById('crest-name').textContent = n.name;
    document.getElementById('crest-rank').textContent = n.rankTitle || '';
    document.getElementById('hud-year').textContent = gameState.year;
    document.getElementById('hud-turn').textContent = 'TURN ' + String(gameState.turn).padStart(2, '0');

    const res = [
        { g: '¥', k: '国库储蓄', v: Math.round(n.treasury), d: d.treasury, c: 'var(--ink)' },
        { g: '∑', k: '国家 GDP', v: st.gdp ?? 0, d: d.gdp, c: 'var(--ink)' },
        { g: '♛', k: '霸权稳定度', v: (gameState.hegemonyScore ?? 0) + '%', d: d.heg, c: gameState.hegemonyScore >= 70 ? 'var(--verdant)' : gameState.hegemonyScore >= 40 ? 'var(--ink)' : 'oklch(72% 0.14 30)' },
        { g: '⇄', k: '贸易条件', v: st.termsOfTrade ?? 100, d: d.tot, c: (st.termsOfTrade ?? 100) >= 100 ? 'var(--verdant)' : 'oklch(72% 0.14 30)' }
    ];
    document.getElementById('resources').innerHTML = res.map(r => `
        <div class="res">
            <div class="glyph">${r.g}</div>
            <div>
                <div class="k">${r.k}</div>
                <div class="v" style="color:${r.c}">${r.v}${r.d ? `<span class="delta" style="color:${r.d > 0 ? 'var(--verdant)' : 'oklch(72% 0.14 30)'}">${r.d > 0 ? '+' : ''}${r.d}</span>` : ''}</div>
            </div>
        </div>`).join('');
}

function renderNations() {
    document.getElementById('nations').innerHTML = Object.entries(NATION_META).map(([c, m]) => {
        const n = gameState.nations[c];
        return `<button data-nation="${c}" class="${c === viewNation ? 'on' : ''}">
            <span class="dot" style="background:${m.hex}"></span>
            <span>${n.flag} ${n.name}</span>
            <span class="role">${m.role}</span>
        </button>`;
    }).join('');
    document.querySelectorAll('#nations button').forEach(b => {
        b.onclick = () => { viewNation = b.dataset.nation; render(); };
    });
}

function renderRail() {
    document.getElementById('rail').innerHTML = TABS.map(t => `
        <button data-tab="${t.id}" class="${activeTab === t.id ? 'on' : ''}">
            <span class="mk">${t.mk}</span><span class="lb">${t.lb}</span>
        </button>`).join('');
    document.querySelectorAll('#rail button').forEach(b => {
        b.onclick = () => openTab(b.dataset.tab === activeTab ? null : b.dataset.tab);
    });
}

function openTab(id) {
    activeTab = id;
    renderRail();
    renderPanel();
    renderMapPane();
}

function renderPanel() {
    const panel = document.getElementById('panel');
    if (!activeTab) { panel.hidden = true; return; }
    const t = TABS.find(x => x.id === activeTab);
    document.getElementById('panel-title').textContent = t.title;
    document.getElementById('panel-sub').textContent = t.sub;
    const body = document.getElementById('panel-body');
    body.innerHTML = panelHTML(activeTab, viewNation);
    bindPanel(activeTab, viewNation);
    panel.hidden = false;
}

function renderLog() {
    document.getElementById('log').innerHTML =
        (gameState.logs || []).slice(0, 4).map(l => `<div class="item">${l}</div>`).join('');
}

function renderMapPane() {
    const container = document.getElementById('map-container');
    if (!container) return;
    renderMap(gameState, container, {
        onNationClick: code => { viewNation = code; render(); }
    }, { leftPad: activeTab ? 636 : 70 });
}

/* ---------------- 面板内容 ---------------- */

function shares(n) {
    const land = n.pops?.landowners?.clout ?? 0.3;
    const cap = n.pops?.capitalists?.clout ?? 0.3;
    const work = n.pops?.workers?.clout ?? 0.3;
    return [
        { l: '地主阶层', v: land, c: 'var(--seal)', meta: popMeta(n, 'landowners') },
        { l: '资本家阶层', v: cap, c: 'var(--treaty)', meta: popMeta(n, 'capitalists') },
        { l: '工人阶层', v: work, c: 'var(--verdant)', meta: popMeta(n, 'workers') }
    ];
}

function popMeta(n, key) {
    const p = n.pops?.[key];
    if (!p) return '';
    const inc = n.factorIncome ? { landowners: n.factorIncome.landRent, capitalists: n.factorIncome.capitalProfit, workers: n.factorIncome.laborWages }[key] : null;
    const rad = key === 'workers' && p.radicals != null ? ` · 激进度 ${Math.round(p.radicals)}%` : '';
    return `Clout ${Math.round(p.clout * 100)}% · 收益 ${Math.round(inc ?? 0)}${rad}`;
}

function popsHTML(n) {
    return shares(n).map(p => `
        <div class="pop">
            <div class="top"><span>${p.l}</span><span class="num" style="color:${p.c}">${Math.round(p.v * 100)}%</span></div>
            <div class="bar"><i style="width:${Math.round(p.v * 100)}%;background:${p.c}"></i></div>
            <div class="meta">${p.meta}</div>
        </div>`).join('');
}

function panelHTML(id, code) {
    const n = gameState.nations[code];
    const isPlayer = code === gameState.playerNationKey;

    if (id === 'tariffs') {
        const rows = Object.entries(GOODS).map(([gId, g]) => {
            const val = Math.round((n.tariffs[gId] || 0) * 100);
            const isImporter = n.netExports ? (n.netExports[gId] || 0) < 0 : false;
            const disabled = isPlayer ? '' : 'disabled';
            return `<div class="tariff-row">
                <span class="l">${g.icon} ${g.name.replace(/^[^\s]+\s/, '')}</span>
                <input type="range" min="0" max="60" step="5" value="${val}" data-good="${gId}" ${disabled}>
                <span class="v" data-v="${gId}">${val}%</span>
                <span class="mode" style="color:${isImporter ? 'var(--verdant)' : 'var(--ink-mute)'}">${isImporter ? '净进口·生效' : '净出口·楔子无效'}</span>
            </div>`;
        }).join('');
        const fiscal = isPlayer ? `
            <div class="sec-label" style="margin-top:20px">内政财政</div>
            <div class="tariff-row">
                <span class="l">🏛️ 所得税率</span>
                <input type="range" min="0" max="25" step="1" value="${Math.round((n.incomeTaxRate || 0.05) * 100)}" data-tax="1">
                <span class="v" data-v="tax">${Math.round((n.incomeTaxRate || 0.05) * 100)}%</span>
                <span class="mode"></span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:.8rem;">
                <span>🏭 亏损产业补贴：<b>${n.subsidies ? '已开启' : '已关闭'}</b></span>
                <button data-subsidy="1">${n.subsidies ? '关闭补贴' : '开启补贴'}</button>
            </div>` : `<div class="note" style="margin-top:16px"><b>AI 治理</b><p>${n.name} 的经济政策由 AI 脚本治理，切换为本国开局后方可操作。</p></div>`;
        return `<div class="sec-label">关税税率${isPlayer ? '' : '（' + n.name + '）'}</div>
            ${rows}
            ${fiscal}
            <div class="sec-label" style="margin-top:20px">阶层收益分配（实时联动）</div>
            <div id="pops">${popsHTML(n)}</div>
            <div class="note"><b>理论要点</b><p>关税只楔入<b>净进口商品</b>的国内到岸价——拖动净进口行（行尾标"生效"）观察当回合的地租与资本利润再分配；净出口行（标"楔子无效"）的关税只在随后的回合经贸易条件与产能调整缓慢传导。</p></div>`;
    }

    if (id === 'industry') {
        return `<div class="sec-label">产能建设${isPlayer ? '' : '（' + n.name + '）'}</div>
            <div class="cards">${Object.entries(BUILDINGS).map(([bId, b]) => {
                const count = n.buildings[bId] || 0;
                const canAfford = isPlayer && n.treasury >= b.buildCost;
                const io = [
                    Object.keys(b.inputs).length ? '投入 ' + Object.entries(b.inputs).map(([g, q]) => `${GOODS[g].icon}${q}`).join(' ') : '',
                    '产出 ' + Object.entries(b.outputs).map(([g, q]) => `${GOODS[g].icon}${q}`).join(' ')
                ].filter(Boolean).join(' → ');
                return `<div class="card"><h3>${b.name}</h3><p>${io}<br>成本 🪙${b.buildCost} · 雇工 ${b.employmentSize}/座</p>
                    <div class="row"><span class="cnt">×${count}</span>
                    ${isPlayer ? `<button data-build="${bId}" ${canAfford ? '' : 'disabled'}>建造</button>` : ''}</div></div>`;
            }).join('')}</div>
            <div class="note"><b>投资池</b><p>当前投资池 🪙${Math.round(n.investmentPool || 0)}；资本家税后利润的 30% 每回合注入，驱动蛛网式扩产。</p></div>`;
    }

    if (id === 'market') {
        return `<div class="sec-label">全球撮合（${n.name} 视角）</div>
            <table><thead><tr><th>商品</th><th>世界价</th><th>到岸价</th><th>S/D</th><th>净出口</th></tr></thead>
            <tbody>${Object.entries(GOODS).map(([gId, g]) => {
                const p = gameState.prices[gId] || { price: g.base_price, ratio: 1 };
                const dom = n.domesticPrices ? n.domesticPrices[gId] : p.price;
                const net = n.netExports ? (n.netExports[gId] || 0) : 0;
                const nc = net > 0 ? 'var(--verdant)' : net < 0 ? 'oklch(72% 0.14 30)' : 'var(--ink-soft)';
                return `<tr><td class="name">${g.icon} ${g.name.replace(/^[^\s]+\s/, '')}</td>
                    <td style="color:var(--brass);font-weight:700;">${p.price}</td>
                    <td>${Math.round(dom * 10) / 10}</td><td>${p.ratio ?? 1}</td>
                    <td style="color:${nc};font-weight:700;">${net > 0 ? '+' : ''}${net}</td></tr>`;
            }).join('')}</tbody></table>
            <div class="note"><b>撮合规则</b><p>价格由全球供需缺口决定；关税只改变本国到岸价格，不改变世界价格——这是小国假设与霸权国假设的分野。</p></div>`;
    }

    return `<div class="sec-label">范式</div>
        <div class="cards one-col">${Object.values(IPE_THEORY_DATA.paradigms).map(p => `
            <div class="card"><h3>${p.name}</h3><p><b style="color:var(--brass)">奠基人：</b>${p.founder}<br>${p.coreTenets}</p>
            <div class="note" style="margin-top:8px"><b>名言</b><p>${p.quote}</p></div></div>`).join('')}</div>
        <div class="sec-label" style="margin-top:16px">核心概念</div>
        <div class="cards">${Object.values(IPE_THEORY_DATA.concepts).map(c => `
            <div class="card"><h3>${c.title}</h3><p>${c.summary}<br>${c.gameEffectDescription || ''}</p></div>`).join('')}</div>`;
}

/* ---------------- 面板交互 ---------------- */

/* 用引擎纯函数做不推进回合的实时预览。
 * 两个引擎函数都不在原地修改 nation：calculateMarketAndPrices 返回新的 nations，
 * calculateFactorReturnsAndPops 返回结果对象——必须取回并写回 nation，否则
 * popsHTML 读到的仍是旧的 domesticPrices / factorIncome / pops。 */
function previewNation(code, mutator) {
    const s = structuredClone(gameState);
    const n0 = s.nations[code];
    if (mutator) mutator(n0);
    const marketResult = calculateMarketAndPrices(s.nations, s.prices, s.turn);
    const n = marketResult.nations[code];
    const popsResult = calculateFactorReturnsAndPops(n, marketResult.prices);
    // 与 tick 步骤 5-7 同步：把返回的派生字段写回 nation，供 popsHTML 读取
    n.factorIncome = popsResult.factorIncome;
    n.pops = popsResult.pops;
    return n;
}

function bindPanel(id, code) {
    const body = document.getElementById('panel-body');
    if (id === 'tariffs') {
        body.querySelectorAll('input[type=range][data-good]').forEach(r => {
            r.oninput = () => {
                const gId = r.dataset.good;
                body.querySelector(`[data-v="${gId}"]`).textContent = r.value + '%';
                const n = previewNation(code, cn => { cn.tariffs[gId] = +r.value / 100; });
                document.getElementById('pops').innerHTML = popsHTML(n);
            };
            r.onchange = () => {
                gameState.nations[code].tariffs[r.dataset.good] = +r.value / 100;
                gameState.logs.unshift(`${gameState.year} · ${gameState.nations[code].name}调整 ${GOODS[r.dataset.good].name} 进口关税至 ${r.value}%。`);
                saveState();
                render();
            };
        });
        const tax = body.querySelector('input[data-tax]');
        if (tax) {
            tax.oninput = () => { body.querySelector('[data-v="tax"]').textContent = tax.value + '%'; };
            tax.onchange = () => {
                gameState.nations[code].incomeTaxRate = +tax.value / 100;
                saveState();
                render();
            };
        }
        const sub = body.querySelector('[data-subsidy]');
        if (sub) {
            sub.onclick = () => {
                gameState.nations[code].subsidies = !gameState.nations[code].subsidies;
                saveState();
                render();
            };
        }
    }
    if (id === 'industry') {
        body.querySelectorAll('[data-build]').forEach(b => {
            b.onclick = () => {
                const bId = b.dataset.build;
                const n = gameState.nations[code];
                const cfg = BUILDINGS[bId];
                if (n.treasury < cfg.buildCost) return;
                n.treasury -= cfg.buildCost;
                n.buildings[bId] = (n.buildings[bId] || 0) + 1;
                n.newBuilds = (n.newBuilds || 0) + 1;
                gameState.logs.unshift(`${gameState.year} · ${n.name}新建 ${cfg.name}，产能 ×${n.buildings[bId]}。`);
                saveState();
                render();
            };
        });
    }
}
