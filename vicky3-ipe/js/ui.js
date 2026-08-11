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

/* 周期历史事件池（每 3 回合随机抽一个触发，避免短期内重复）。
 * 标 `id` 用于去重；部分选项带 `modifier` 字段 → 触发跨回合遗留效应（见 MODIFIER_TYPES）。 */
const EVENTS = [
    {
        id: 'corn_laws', tag: '议会动议', title: '《谷物法》存废之争',
        body: '曼彻斯特的工厂主联名请愿废除谷物关税，地主阶层则警告地租崩塌将动摇乡村秩序。内阁需在本回合表态。',
        opts: [
            { t: '废除谷物法，粮食关税归零', d: '资本家收益上升，地主阶层强烈不满', log: '议会通过废除《谷物法》：粮食关税降至 0%，资本家 Clout 上升。', fx: n => { n.tariffs.grain = 0; } },
            { t: '维持保护，安抚地主', d: '地租维持高位，工业扩张放缓；5 回合内地主 Clout 持续 +5%', log: '内阁维持《谷物法》并安抚地主：地租维持高位，纺织资本扩张放缓。', modifier: 'landlord_subsidy' }
        ]
    },
    {
        id: 'silver_outflow', tag: '海关照会', title: '白银外流与关税自主',
        body: '广州海关报告白银持续外流，朝廷内部就是否提高进口关税、重整通商口岸展开争论。',
        opts: [
            { t: '提高制成品关税至 40%', d: '短期财政改善，贸易条件或进一步承压', log: '提高制成品关税至 40%：财政改善，ToT 承压。', fx: n => { ['steel', 'tools', 'textiles', 'arms'].forEach(g => { n.tariffs[g] = 0.40; }); } },
            { t: '维持现状，换取通商稳定', d: '避免摩擦，白银外流持续', log: '维持现行税率：通商稳定，白银外流未止。' }
        ]
    },
    {
        id: 'railway_age', tag: '技术扩散', title: '铁路时代的资本需求',
        body: '铁路投资吸走大量社会资本，银行要求政府担保发债，工人则涌向新的铁路工地。',
        opts: [
            { t: '政府担保铁路债券', d: '投资池注入 ¥150，国库承压 ¥200', log: '政府为铁路债券提供担保：投资池扩张，国库负担加重。', fx: n => { n.treasury -= 200; n.investmentPool = (n.investmentPool || 0) + 150; } },
            { t: '举国推进铁路网建设', d: '6 回合内投资池每回合 +120', log: '启动铁路繁荣期：投资池持续扩张 6 回合。', modifier: 'railway_boom' }
        ]
    },
    {
        id: 'chartism', tag: '社会运动', title: '工人宪章运动',
        body: '工人阶级组织起来提出普选与福利诉求，资本家警告加薪将削弱工业竞争力，温和派建议立法调和。',
        opts: [
            { t: '镇压运动，维持工资', d: '工人激进度 +20%，资本利润维持', log: '镇压宪章运动：工人激进度飙升，短期资本利润保住。', fx: n => { if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 20); } },
            { t: '立法提高工资保障', d: '工人 Clout +8%，资本利润承压', log: '通过工资保障法：工人 Clout 上升，资本利润承压。', fx: n => { if (n.pops?.workers) n.pops.workers.clout = Math.min(0.95, (n.pops.workers.clout || 0) + 0.08); } }
        ]
    },
    {
        id: 'colonial_rush', tag: '殖民扩张', title: '非洲瓜分狂潮',
        body: '列强竞相在海外建立殖民地。军部要求扩军巩固航路，自由派担心过度扩张拖垮财政。',
        opts: [
            { t: '加入瓜分，扩军备战', d: '4 回合内兵工厂产出 ×1.3，国库每回合 −300', log: '启动战争动员：军工扩张，财政持续承压。', modifier: 'war_mobilization' },
            { t: '专注本土，避免殖民竞赛', d: '国库无损，错失扩张红利', log: '保持战略克制：未卷入殖民竞赛，财政稳健。' }
        ]
    },
    {
        id: 'free_treaty', tag: '外交谈判', title: '自由贸易协定谈判',
        body: '邻国提议签署互惠贸易协定，全面降低关税壁垒。出口商欢呼，幼稚工业则请求保护期。',
        opts: [
            { t: '签署协定，全面降税', d: '8 回合内全商品关税每回合 −10%', log: '签署自由贸易协定：关税壁垒系统性降低。', modifier: 'trade_treaty' },
            { t: '拒绝，保护本土产业', d: '关税不变，贸易条件略升', log: '拒绝自由贸易协定：保护本土产业，贸易条件小幅改善。' }
        ]
    },
    {
        id: 'tech_import', tag: '产业升级', title: '欧洲技术引进',
        body: '海外工程师带来炼钢与机械的最新工艺，政府可选择重金引进或观望其自然扩散。',
        opts: [
            { t: '重金引进先进工艺', d: '6 回合内制造品产出 ×1.15', log: '引进欧洲先进工艺：制造品产能系统性提升。', modifier: 'tech_transfer' },
            { t: '等待技术自然扩散', d: '无即时收益，避免财政支出', log: '放任技术自然扩散：稳健但缓慢。' }
        ]
    },
    {
        id: 'bank_crisis', tag: '金融危机', title: '伦敦证券交易所恐慌',
        body: '投机泡沫破裂引发挤兑，多家银行濒临倒闭。财政部面临救市与坚守金本位的两难。',
        opts: [
            { t: '央行注资救市', d: '国库 −1500，投资池 +500', log: '央行紧急注资：稳定金融体系，国库大幅承压。', fx: n => { n.treasury = (n.treasury || 0) - 1500; n.investmentPool = (n.investmentPool || 0) + 500; } },
            { t: '坚守金本位，任其出清', d: '国库无损，投资池 −300', log: '坚守金本位：市场出清，投资池萎缩。', fx: n => { n.investmentPool = Math.max(0, (n.investmentPool || 0) - 300); } }
        ]
    },
    {
        id: 'education_reform', tag: '内政改革', title: '国民教育法案',
        body: '改革派推动建立国民教育体系，提升长期人力资本；保守派忧虑税负与教会影响。',
        opts: [
            { t: '推行国民教育', d: '国库 −800，工人 Clout +5%', log: '推行国民教育法：人力资本长期投资，工人阶层壮大。', fx: n => { n.treasury = (n.treasury || 0) - 800; if (n.pops?.workers) n.pops.workers.clout = Math.min(0.95, (n.pops.workers.clout || 0) + 0.05); } },
            { t: '维持现状，节省开支', d: '国库无损，阶层格局不变', log: '搁置教育改革：财政稳健，阶层格局维持现状。' }
        ]
    }
];

/* 随机抽取事件，避开最近 3 次（recentEventIds）以保证新鲜感 */
function pickRandomEvent() {
    const recent = gameState.recentEventIds || [];
    let pool = EVENTS.filter(e => !recent.includes(e.id));
    if (!pool.length) pool = EVENTS;                  // 全都近期出现过则放弃去重
    const ev = pool[Math.floor(Math.random() * pool.length)];
    gameState.recentEventIds = [ev.id, ...recent].slice(0, 3);
    return ev;
}

/* ---------------- 跨回合遗留效应（UI 层 modifier 系统）----------------
 * 不动引擎纯函数 tick：modifier 列表存于 state.activeModifiers（可序列化数据），
 * onNextTurn 在 tick 之前对本国应用、tick 之后衰减。测试不走 UI，故不受影响。
 * 每回合应用是"增量式"（如 +投资池/−国库），衰减只减 turnsLeft、到 0 移除并记日志。
 */
const MODIFIER_TYPES = {
    landlord_subsidy: {
        label: '🏛️ 地主安抚金',
        desc: '地主 Clout +5%/回合',
        duration: 5,
        apply: (n) => { if (n.pops?.landowners) n.pops.landowners.clout = Math.min(0.95, (n.pops.landowners.clout || 0) + 0.05); }
    },
    railway_boom: {
        label: '🚂 铁路繁荣',
        desc: '投资池 +120/回合',
        duration: 6,
        apply: (n) => { n.investmentPool = (n.investmentPool || 0) + 120; }
    },
    trade_treaty: {
        label: '🤝 自由贸易协定',
        desc: '全商品关税 −10%（一次性，持续期内锁定）',
        duration: 8,
        apply: (n) => { Object.keys(n.tariffs || {}).forEach(g => { n.tariffs[g] = Math.max(0, (n.tariffs[g] || 0) - 0.10); }); }
    },
    war_mobilization: {
        label: '⚔️ 战争动员',
        desc: '兵工厂 ×1.3 产出，国库 −300/回合',
        duration: 4,
        apply: (n) => {
            n.treasury = (n.treasury || 0) - 300;
            if (n.production?.arms) n.production.arms = Math.round(n.production.arms * 1.3);
        }
    },
    tech_transfer: {
        label: '🔬 技术引进',
        desc: '制造品建筑产出 ×1.15',
        duration: 6,
        apply: (n) => {
            ['steel', 'tools', 'textiles', 'arms'].forEach(g => {
                if (n.production?.[g]) n.production[g] = Math.round(n.production[g] * 1.15);
            });
        }
    }
};

function applyActiveModifiers(nation) {
    if (!gameState.activeModifiers?.length) return;
    gameState.activeModifiers.forEach(m => {
        const def = MODIFIER_TYPES[m.type];
        if (def) def.apply(nation, m.magnitude || 1);
    });
}

function tickActiveModifiers() {
    if (!gameState.activeModifiers?.length) return;
    const expired = [];
    gameState.activeModifiers = gameState.activeModifiers.filter(m => {
        m.turnsLeft = (m.turnsLeft || 0) - 1;
        if (m.turnsLeft <= 0) {
            const def = MODIFIER_TYPES[m.type];
            expired.push(def?.label || m.type);
            return false;
        }
        return true;
    });
    expired.forEach(label => {
        gameState.logs.unshift(`${gameState.year} · 「${label}」遗留效应结束。`);
    });
}

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
    normalizeState(gameState);
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

// 补齐 v3.5 新增字段，兼容旧存档与 createInitialState 的纯引擎产物
function normalizeState(s) {
    if (!Array.isArray(s.activeModifiers)) s.activeModifiers = [];
    if (!Array.isArray(s.recentEventIds)) s.recentEventIds = [];
    return s;
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

    // 遗留效应：tick 之前对本国应用本期增量（如投资池注入、关税下调），再让 tick 带着这些变化出清
    applyActiveModifiers(prev.nations[prev.playerNationKey]);

    gameState = tick(prev);

    // 衰减：tick 之后减少剩余回合、到期移除并记日志
    tickActiveModifiers();

    const now = gameState.nations[gameState.playerNationKey];
    const nowStats = gameState.derivedStats?.[gameState.playerNationKey] || {};
    lastDelta = {
        treasury: Math.round(now.treasury - prevNation.treasury),
        gdp: Math.round((nowStats.gdp ?? 0) - (prevStats.gdp ?? 0)),
        heg: Math.round(gameState.hegemonyScore - (prev.hegemonyScore ?? gameState.hegemonyScore)),
        tot: Math.round((nowStats.termsOfTrade ?? 0) - (prevStats.termsOfTrade ?? 0))
    };

    if (gameState.turn % 3 === 0) {
        eventQueue.push(pickRandomEvent());
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
            { t: '确认重开', d: `以 ${gameState.nations[gameState.playerNationKey].name} 重新开局`, fx: () => { gameState = normalizeState(createInitialState(gameState.playerNationKey)); viewNation = gameState.playerNationKey; lastDelta = null; endgameShown = false; eventQueue = []; saveState(); } },
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
                const nation = gameState.nations[gameState.playerNationKey];
                if (o.fx) o.fx(nation);
                if (o.modifier) {
                    const def = MODIFIER_TYPES[o.modifier];
                    if (def) {
                        gameState.activeModifiers.push({ type: o.modifier, magnitude: 1, turnsLeft: def.duration });
                        gameState.logs.unshift(`${gameState.year} · ${o.log}（生效 ${def.duration} 回合：${def.desc}）`);
                    }
                } else {
                    gameState.logs.unshift(`${gameState.year} · ${o.log}`);
                }
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
            { t: '重新开局', d: '回到 1836 年，延续同一国家', fx: () => { gameState = normalizeState(createInitialState(gameState.playerNationKey)); viewNation = gameState.playerNationKey; lastDelta = null; endgameShown = false; eventQueue = []; saveState(); } },
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

    // 进行中的跨回合效应徽章（v3.5）
    const mods = gameState.activeModifiers || [];
    document.getElementById('hud-modifiers').innerHTML = mods.map(m => {
        const def = MODIFIER_TYPES[m.type];
        if (!def) return '';
        return `<span class="mod-badge" title="${def.desc}">${def.label} <i>×${m.turnsLeft}</i></span>`;
    }).join('');
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
