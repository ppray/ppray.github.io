/**
 * 《帝国的账本：核心与边缘》 v3.7
 * 小游戏：金本位自动调节机制（休谟价格—铸币流动机制，Price-Specie-Flow Mechanism, 1752）
 *
 * 学理来源：翟东升《货币与金融的国际政治经济学》· 金本位制度专题 Q1
 *   五步闭环：贸易逆差 → 黄金外流 → 货币紧缩 → 物价下跌 → 出口变便宜 → 转顺差 → 黄金回流
 *   撕开点：机制"自动"成立，但**运行代价不对称**——顺差国可对冲黄金流入、拒绝通胀；
 *          逆差国没有任何工具对冲外流，只能被动承受紧缩与失业。规则对等、执行能力极不对等。
 *
 * 本模块是纯逻辑状态机（无 DOM），供 ui.js 渲染，也可在 Node 下直接跑平衡性测试。
 * 变量口径统一为"均衡 = 100"的指数，与笔记那张四变量时序图一一对应。
 */

export const PARITY = 100;
export const GOLD_POINT = 3;      // 黄金输送点：汇率被锁在 铸币平价 ± 运金成本 的窄带内
const MONEY_LAG = 0.45;           // 货币供给跟随黄金存量的速度（铸币传导有滞后）
const PRICE_LAG = 0.30;           // 物价跟随货币供给的速度（价格粘性，谷最浅、最滞后）
const TRADE_SENSITIVITY = 0.42;   // 物价每低于均衡 1 点，贸易差额改善多少
const SHOCK_DECAY = 0.88;         // 外生贸易冲击的自然衰减

export const ACTIONS = {
    observe: {
        id: 'observe', roles: ['deficit', 'surplus'],
        label: '静观其变',
        desc: '不干预，让价格—铸币流动机制自行运转',
        detail: '休谟设想的"自动"路径：黄金外流→货币紧缩→物价下跌→出口变便宜。代价是谷底的通缩与失业要自己扛。'
    },
    raise_rate: {
        id: 'raise_rate', roles: ['deficit'],
        label: '提高贴现率',
        desc: '央行加息吸引外部黄金止住外流，但信贷骤紧、民怨立刻上升',
        detail: '经典的保卫平价手段：资本项下引来黄金，为调整争取时间；代价是信贷收缩当场压垮企业与就业，民怨即时 +7。买的是时间，付的是社会承受力。'
    },
    suspend: {
        id: 'suspend', roles: ['deficit'],
        label: '暂停黄金兑换',
        desc: '脱离金本位，止住外流但信用崩塌',
        detail: '放弃平价、退出体系。黄金不再外流、通缩立止，但国际信用与融资渠道随之丧失。'
    },
    sterilize: {
        id: 'sterilize', roles: ['surplus'],
        label: '冲销黄金流入',
        desc: '对冲流入的黄金，拒绝国内通胀',
        detail: '顺差国独有的工具：不让货币供给随黄金上升，人为截断自己这半个环。机制于是只在逆差国那一头运转。'
    },
    lend_abroad: {
        id: 'lend_abroad', roles: ['surplus'],
        label: '对外放贷（资本输出）',
        desc: '把顺差以贷款形式送回外围，主动分担调整',
        detail: '让黄金重新流出、缓解外围紧缩，机制双向闭合。代价是本国资本被输出而非留在国内。'
    }
};

export function availableActions(role) {
    return Object.values(ACTIONS).filter(a => a.roles.includes(role));
}

export function createSpecieFlowGame({ role = 'deficit', maxRounds = 10, nationName = '本国' } = {}) {
    const deficit = role === 'deficit';
    const game = {
        role, maxRounds, nationName,
        round: 0,
        gold: 100, money: 100, prices: 100, fx: PARITY, unrest: deficit ? 12 : 8,
        // 顺差国专用影子指标：被你转嫁出去的调整代价，落在贸易对手（逆差国）头上
        peripheryUnrest: deficit ? null : 20,
        shock: deficit ? -7.5 : 7.5,   // 外生贸易冲击：逆差国为负，顺差国为正
        tradeBalance: deficit ? -7.5 : 7.5,
        sterilizeCount: 0,
        lendCount: 0,
        rateHikes: 0,
        status: 'PLAYING',
        outcome: null,
        history: [],
        log: []
    };
    game.history.push(snapshot(game, null));
    return game;
}

function snapshot(g, action) {
    return {
        round: g.round,
        gold: round1(g.gold), money: round1(g.money), prices: round1(g.prices),
        fx: round1(g.fx), unrest: round1(g.unrest), tradeBalance: round1(g.tradeBalance),
        peripheryUnrest: g.peripheryUnrest == null ? null : round1(g.peripheryUnrest),
        action
    };
}

function round1(v) { return Math.round(v * 10) / 10; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 推进一回合。action 为 ACTIONS 的 id。返回同一个 game 对象（原地推进）。
 */
export function step(game, actionId) {
    if (game.status !== 'PLAYING') return game;
    const action = ACTIONS[actionId];
    if (!action || !action.roles.includes(game.role)) return game;

    game.round += 1;
    let sterilizedThisRound = false;

    // ---- 1. 行动的即时效果 ----
    if (actionId === 'suspend') {
        game.status = 'BROKE_PEG';
        game.outcome = 'broke_peg';
        game.log.push(`第 ${game.round} 回合：宣布暂停黄金兑换，脱离金本位。黄金外流即刻停止，但平价与国际信用一并失去。`);
        game.history.push(snapshot(game, actionId));
        return game;
    }
    if (actionId === 'raise_rate') {
        game.rateHikes += 1;
        game.gold += 4.5;      // 资本项下引来黄金
        game.money -= 3.2;     // 但国内信用进一步收紧
        game.unrest += 7;      // 信贷骤紧当场压垮企业与就业——加息不是免费的
        game.log.push(`第 ${game.round} 回合：提高贴现率，引来黄金 +4.5，但信贷骤紧、民怨 +7。`);
    }
    if (actionId === 'sterilize') {
        game.sterilizeCount += 1;
        sterilizedThisRound = true;
        // 冲销＝拒绝分担调整，压力全部留在逆差国那一头
        game.peripheryUnrest = clamp((game.peripheryUnrest || 0) + 11, 0, 100);
        game.log.push(`第 ${game.round} 回合：冲销流入的黄金，货币供给不随之扩张——拒绝通胀。`);
    }
    if (actionId === 'lend_abroad') {
        game.lendCount += 1;
        game.gold -= 5.0;      // 资本输出，黄金重新流出
        game.peripheryUnrest = clamp((game.peripheryUnrest || 0) - 9, 0, 100);
        game.log.push(`第 ${game.round} 回合：对外放贷，黄金 −5.0 回流外围，主动分担调整。`);
    }
    if (actionId === 'observe') {
        // 顺差国"静观"＝让黄金流入自然推高物价，机制双向运转，外围压力随之缓解
        if (game.role === 'surplus') game.peripheryUnrest = clamp((game.peripheryUnrest || 0) - 4, 0, 100);
        game.log.push(`第 ${game.round} 回合：不干预，任由机制运转。`);
    }

    // ---- 2. 贸易差额 = 外生冲击 + 相对物价竞争力（物价越低越有竞争力）----
    game.shock *= SHOCK_DECAY;
    game.tradeBalance = game.shock + (PARITY - game.prices) * TRADE_SENSITIVITY;

    // ---- 3. 黄金流动 = 贸易差额（第 1 步：逆差→黄金外流）----
    game.gold = clamp(game.gold + game.tradeBalance, 0, 160);

    // ---- 4. 货币供给跟随黄金存量，有滞后（第 2 步：黄金外流→货币紧缩）----
    //        冲销 = 顺差国切断这一环，货币不随黄金上升，而是被拉回常态
    if (sterilizedThisRound) {
        game.money += (PARITY - game.money) * 0.35;
    } else {
        game.money += (game.gold - game.money) * MONEY_LAG;
    }

    // ---- 5. 物价跟随货币供给，滞后更大（第 3 步：货币紧缩→物价下跌，价格粘性）----
    game.prices += (game.money - game.prices) * PRICE_LAG;

    // ---- 6. 汇率：被贸易压力推动，但锁死在黄金输送点窄带内 ----
    const fxRaw = PARITY + game.tradeBalance * 0.5;
    game.fx = clamp(fxRaw, PARITY - GOLD_POINT, PARITY + GOLD_POINT);
    game.fxPinned = fxRaw <= PARITY - GOLD_POINT || fxRaw >= PARITY + GOLD_POINT;

    // ---- 7. 民怨：通缩缺口在价格刚性下直接转化为失业（这正是"自动"机制的真实代价）----
    //        系数刻意调高：走通闭环时民怨会逼近 2/3 刻度，让"药方本身就是病痛"可感
    const deflationGap = Math.max(0, PARITY - game.prices);
    const inflationGap = Math.max(0, game.prices - PARITY);
    game.unrest = clamp(
        game.unrest + deflationGap * 0.95 + inflationGap * 0.15 - 2.5,
        0, 100
    );

    game.history.push(snapshot(game, actionId));

    // ---- 8. 胜负判定 ----
    evaluate(game);
    return game;
}

function evaluate(g) {
    if (g.status !== 'PLAYING') return;

    if (g.unrest >= 100) {
        g.status = 'LOST';
        g.outcome = 'unrest';
        g.log.push('民怨触顶：长期通缩与失业击穿了社会承受力，政权在紧缩中崩塌。');
        return;
    }
    if (g.gold <= 35) {
        g.status = 'LOST';
        g.outcome = 'gold_drained';
        g.log.push('黄金枯竭：储备见底，再也无法按平价兑付，被迫脱离金本位。');
        return;
    }

    if (g.role === 'deficit') {
        // 闭环完成：竞争力回升使贸易转顺差，且黄金开始回流（第 4、5 步）
        if (g.tradeBalance > 0.5 && g.gold >= 88) {
            g.status = 'WON';
            g.outcome = 'loop_closed';
            g.log.push('闭环完成：物价下跌使出口重获竞争力，贸易转为顺差，黄金开始回流，均衡自动恢复。');
            return;
        }
    } else {
        // 顺差国：过热失控才算输，否则撑满回合即"安然无恙"
        if (g.round >= g.maxRounds) {
            g.status = 'WON';
            g.outcome = g.sterilizeCount > g.lendCount ? 'sterilized' : 'shared';
            return;
        }
    }

    if (g.round >= g.maxRounds) {
        g.status = 'LOST';
        g.outcome = 'timeout';
        g.log.push('回合耗尽：调整仍未走完闭环，紧缩持续，外部融资转向他国。');
    }
}

/**
 * 终局点评：把玩家实际走过的路径接回笔记的采分点。
 */
export function debrief(g) {
    const base = {
        loop_closed: {
            title: '✅ 自动调节闭环走通',
            body: `五步闭环完整跑完：<b>贸易逆差 → 黄金外流 → 货币紧缩 → 物价下跌 → 出口变便宜 → 转顺差 → 黄金回流</b>。` +
                `但注意你付出的代价——民怨峰值 ${Math.round(Math.max(...g.history.map(h => h.unrest)))}。` +
                `休谟的"自动恢复均衡"在数学上成立，代价却是谷底那几年的通缩与失业，全部由逆差国自己承担。` +
                `<br><br><b>翟东升的撕开点：</b>顺差国（英国）可以对冲黄金流入、拒绝通胀，人为截断自己那半个环；逆差国没有任何对冲工具。<b>规则对等，执行能力却极不对等</b>。`
        },
        unrest: {
            title: '💀 社会先于机制崩溃',
            body: `机制没有失灵——物价确实在下跌、竞争力确实在恢复，但闭环走完之前，通缩转化的失业已经击穿了社会承受力。` +
                `<br><br>这正是史实中外围国的处境：古典金本位时期（1870s–1914），<b>外围国承担了调整的主要负担</b>。` +
                `机制"自动"运转了，代价（通缩、失业）却由外围国独自承受——这就是翟东升把金本位定性为<b>权力结构而非中性技术</b>的史实依据。`
        },
        gold_drained: {
            title: '💀 黄金枯竭，被迫脱轨',
            body: `储备见底，再也无法按平价兑付。逆差国的根本困境在于：黄金外流是<b>被动</b>的，你没有任何工具能对冲它，` +
                `而调整所需的时间又长于储备能撑住的时间。<br><br>顺差国从来不会遇到这个约束——它可以无限期地积累黄金并冲销掉通胀效应。<b>这就是不对称的全部含义</b>。`
        },
        broke_peg: {
            title: '⚖️ 主动脱离金本位',
            body: `你选择了保住就业、放弃平价。通缩立止，但国际信用与低成本融资渠道一并失去。` +
                `<br><br>这个选项本身就是金本位崩溃的缩影：<b>国内民主政治诉求 vs 国际货币纪律</b>的冲突。当选民的失业痛感压过金本位的信用收益，` +
                `脱轨就只是时间问题——1931 年英国正是这样离开金本位的。`
        },
        timeout: {
            title: '⏳ 调整未及完成',
            body: `闭环还没走完，外部融资已经转向别处。休谟机制的隐含假设是"时间足够长"，` +
                `但现实中逆差国往往等不到均衡自动恢复——这正是把"自动调节"当作中性技术叙事的最大盲点。`
        },
        sterilized: {
            title: '👑 你成功拒绝了通胀',
            body: `${g.maxRounds} 回合里你冲销了 ${g.sterilizeCount} 次黄金流入，货币供给始终没有随黄金上升，` +
                `本国物价稳定、就业无虞，黄金存量一路堆到 ${Math.round(g.gold)}。<b>你自己的账本上，这一局毫发无伤。</b>` +
                `<br><br>但看右边那根条：外围民怨从 20 涨到了 <b>${Math.round(g.peripheryUnrest)}</b>。` +
                `<b>机制的另一半从未运转</b>——你截断了自己这半个环，全部调整压力就留在了逆差国那一头，它们的通缩与失业正是你这份稳定的代价。` +
                `<br><br>这就是翟东升的核心判断：价格—铸币流动机制被包装成中性的自我修复，实则<b>顺差国可主动对冲、拒绝紧缩，逆差国只能被动承受</b>；` +
                `规则看似对等，执行能力却极不对等。<b>换成逆差国再玩一次</b>，就知道这个"冲销"按钮有多值钱——那一边根本没有这个开关。`
        },
        shared: {
            title: '🤝 你让机制双向闭合',
            body: `你更多选择了静观与资本输出而非冲销，让黄金重新流回外围，机制在两端同时运转，` +
                `外围民怨被压在 <b>${Math.round(g.peripheryUnrest)}</b>（起始 20）。这在历史上是罕见的。` +
                `<br><br>金德尔伯格意义上的"霸权国提供国际公共物品"大致就是这个意思：<b>有能力也有意愿承担体系的调整成本</b>。` +
                `但请注意，这是你的<b>选择</b>而非义务——顺差国随时可以改按冲销键，逆差国却永远没有这个开关。`
        }
    };
    return base[g.outcome] || { title: '推演结束', body: '' };
}
