/**
 * 外汇储备四问小游戏：知识点必须在游玩过程中被全部掌握，
 * 且六条易混辨析要有对应的机械后果（禁止"打完再背一遍"）。
 */
import {
    KNOWLEDGE, KNOWLEDGE_IDS, KNOWLEDGE_TOTAL, ACTS, MNEMONICS, TRAPS,
    createReservesGame, step, dismissGlossary, playthrough, coverage,
    debrief, availableActions, currentAct, hud
} from '../minigame-reserves.js';

function drainGlossary(g) {
    let n = 0;
    while (g.phase === 'GLOSSARY' && n++ < 40) dismissGlossary(g);
}

function play(choose) {
    return playthrough(choose);
}

export function runReservesMinigameTests() {
    const results = [];

    const catalog = KNOWLEDGE_IDS.length === KNOWLEDGE_TOTAL && KNOWLEDGE_TOTAL >= 40;
    results.push({
        name: '知识点目录与速查卡对齐（≥40 条，id 无重复）',
        passed: catalog && new Set(KNOWLEDGE_IDS).size === KNOWLEDGE_IDS.length,
        detail: `KNOWLEDGE_TOTAL = ${KNOWLEDGE_TOTAL}，唯一 id ${new Set(KNOWLEDGE_IDS).size}`
    });

    const assigned = new Set(ACTS.flatMap(a => a.unlock));
    const unassigned = KNOWLEDGE_IDS.filter(id => !assigned.has(id));
    results.push({
        name: '每条知识点都挂在某一问的 unlock 上（旁观通关也能点亮）',
        passed: unassigned.length === 0,
        detail: unassigned.length ? `未挂载: ${unassigned.join(', ')}` : `四问 unlock 并集 = ${assigned.size}/${KNOWLEDGE_TOTAL}`
    });

    const qSet = new Set(Object.keys(MNEMONICS));
    const actQs = ACTS.flatMap(a => [a.q, ...(a.extraMnemonics || [])]);
    const missingQ = [...qSet].filter(q => !actQs.includes(q));
    results.push({
        name: '七题口诀都有对应的问次门（Q1–Q7）',
        passed: missingQ.length === 0 && qSet.size === 7,
        detail: missingQ.length ? `缺 ${missingQ.join(', ')}` : `七题口诀均绑定到四问战役`
    });

    results.push({
        name: '六条易混辨析都在 TRAPS 里',
        passed: TRAPS.length === 6,
        detail: TRAPS.map(t => t.title).join(' · ')
    });

    const g0 = createReservesGame();
    results.push({
        name: '开局就是双顺差（经常账户、资本账户同向为正）',
        passed: g0.ca > 0 && g0.ka > 0,
        detail: `CA ${g0.ca} / KA ${g0.ka}，经常账户占比 ${hud(g0).caShare}%（笔记锚点约 70%）`
    });

    const observe = play(act => act.actions[0]);
    const covObs = coverage(observe);
    results.push({
        name: '旁观通关：一次走完四问即掌握全部知识点',
        passed: observe.status === 'DONE' && covObs.complete,
        detail: covObs.complete
            ? `掌握 ${covObs.n}/${covObs.total}，口诀 ${observe.acknowledged.join(' → ')}`
            : `结束状态 ${observe.status}，缺 ${covObs.missing.join(', ')}`
    });

    const lastPick = play(act => act.actions[act.actions.length - 1]);
    const covLast = coverage(lastPick);
    results.push({
        name: '每幕选最后一项也能全覆盖（覆盖不依赖特定策略）',
        passed: lastPick.status === 'DONE' && covLast.complete,
        detail: covLast.complete ? `掌握 ${covLast.n}/${covLast.total}` : `缺 ${covLast.missing.join(', ')}`
    });

    const gExport = createReservesGame();
    drainGlossary(gExport);
    const kaBefore = gExport.ka;
    const caBefore = gExport.ca;
    step(gExport, 'boost_export');
    results.push({
        name: '误区「双顺差＝出口厉害」：加出口只抬经常账户，资本账户仍顺差',
        passed: gExport.ca > caBefore && gExport.ka >= kaBefore - 0.05,
        detail: `CA ${caBefore} → ${gExport.ca}，KA ${kaBefore} → ${gExport.ka}`
    });

    const gDrain = createReservesGame();
    drainGlossary(gDrain);
    while (gDrain.act < 2 && gDrain.status === 'PLAYING') {
        if (gDrain.phase === 'GLOSSARY') drainGlossary(gDrain);
        else if (gDrain.phase === 'MNEMONIC') step(gDrain, 'ack_mnemonic');
        else step(gDrain, availableActions(gDrain)[0].id);
    }
    drainGlossary(gDrain);
    const autoBefore = gDrain.autonomy;
    const resBefore = gDrain.reserves;
    step(gDrain, 'drain_autonomy');
    results.push({
        name: '误区「越少越自主」：花光储备，自主性沿 U 型下跌',
        passed: gDrain.reserves < resBefore && gDrain.autonomy < autoBefore,
        detail: `储备 ${resBefore} → ${gDrain.reserves}，自主性 ${autoBefore} → ${gDrain.autonomy}`
    });

    const gCost = createReservesGame();
    drainGlossary(gCost);
    while (gCost.act < 3 && gCost.status === 'PLAYING') {
        if (gCost.phase === 'GLOSSARY') drainGlossary(gCost);
        else if (gCost.phase === 'MNEMONIC') step(gCost, 'ack_mnemonic');
        else step(gCost, currentAct(gCost).actions[0]);
    }
    drainGlossary(gCost);
    const opp0 = gCost.costs.opp;
    const st0 = gCost.costs.sterilize;
    step(gCost, 'do_sterilize');
    results.push({
        name: '误区「机会成本＝冲销成本」：冲销抬显性成本，机会成本仍在涨',
        passed: gCost.costs.sterilize > st0 && gCost.costs.opp > opp0,
        detail: `冲销成本 ${st0} → ${gCost.costs.sterilize}，机会成本 ${opp0} → ${gCost.costs.opp}`
    });

    const gRep = createReservesGame();
    drainGlossary(gRep);
    while (gRep.act < 3 && gRep.status === 'PLAYING') {
        if (gRep.phase === 'GLOSSARY') drainGlossary(gRep);
        else if (gRep.phase === 'MNEMONIC') step(gRep, 'ack_mnemonic');
        else step(gRep, currentAct(gRep).actions[0]);
    }
    drainGlossary(gRep);
    const savers0 = gRep.classes.savers;
    const banks0 = gRep.classes.banks;
    step(gRep, 'do_repress');
    results.push({
        name: '金融抑制：储蓄者被稀释、国有银行吃到制度租金（与冲销方向不同）',
        passed: gRep.classes.savers < savers0 && gRep.classes.banks > banks0,
        detail: `储蓄者 ${savers0} → ${gRep.classes.savers}，银行 ${banks0} → ${gRep.classes.banks}`
    });

    const gFly = createReservesGame();
    drainGlossary(gFly);
    while (gFly.act < 4 && gFly.status === 'PLAYING') {
        if (gFly.phase === 'GLOSSARY') drainGlossary(gFly);
        else if (gFly.phase === 'MNEMONIC') step(gFly, 'ack_mnemonic');
        else step(gFly, currentAct(gFly).actions[0]);
    }
    drainGlossary(gFly);
    const res0 = gFly.reserves;
    step(gFly, 'end_surrender');
    results.push({
        name: '2012 取消强制结汇会触发资本外逃（储备下降）',
        passed: gFly.surrenderOn === false && gFly.reserves < res0,
        detail: `储备 ${res0} → ${gFly.reserves}（对应 2014.6→2017.1 缩水约 1 万亿）`
    });

    const dump = play(act => act.id === 4 ? 'go_cips' : act.actions[0]);
    // Force freeze_dump: walk until EVENT then dump
    const gFr = createReservesGame();
    drainGlossary(gFr);
    let guard = 0;
    while (gFr.status === 'PLAYING' && gFr.phase !== 'EVENT' && guard++ < 80) {
        if (gFr.phase === 'GLOSSARY') drainGlossary(gFr);
        else if (gFr.phase === 'MNEMONIC') step(gFr, 'ack_mnemonic');
        else step(gFr, availableActions(gFr)[0].id);
    }
    const resF = gFr.reserves;
    const credF = gFr.dollarCredit;
    drainGlossary(gFr);
    if (gFr.phase === 'EVENT') step(gFr, 'freeze_dump');
    results.push({
        name: '金融恐怖平衡：抛售美债同时打伤自身储备与美元信用',
        passed: gFr.outcome === 'terror_dump' && gFr.reserves < resF && gFr.dollarCredit < credF,
        detail: `储备 ${resF} → ${gFr.reserves}，美元信用 ${credF} → ${gFr.dollarCredit}`
    });

    const d = debrief(observe);
    const seven = Object.keys(d.mnemonics).length === 7
        && ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'].every(q => observe.acknowledged.includes(q));
    results.push({
        name: '终局点评含七题口诀、六条易混、数字锚点与总纲',
        passed: seven && d.traps.length === 6 && d.numbers.length >= 8 && d.title.includes('交的贡'),
        detail: `口诀 ${observe.acknowledged.join(', ')}；易混 ${d.traps.length}；锚点 ${d.numbers.length}`
    });

    const seign = KNOWLEDGE.seigniorage.card.includes('四项') && KNOWLEDGE.seigniorage.card.includes('20%');
    results.push({
        name: '铸币税词条写明"四项之一"与乘数口径（防答题踩坑）',
        passed: seign,
        detail: '铸币税卡片含四项之一 + 20% GDP'
    });

    void dump;
    return results;
}
