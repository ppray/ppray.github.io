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
import { createSpecieFlowGame, step as specieStep, debrief as specieDebrief, availableActions as specieActions, PARITY, GOLD_POINT } from './minigame-goldstandard.js';
import {
    createReservesGame, step as rsvStep, dismissGlossary as rsvDismiss,
    availableActions as rsvActions, currentAct as rsvAct, coverage as rsvCoverage,
    debrief as rsvDebrief, hud as rsvHud, KNOWLEDGE, KNOWLEDGE_TOTAL,
    ACTS, SEIGNIORAGE_FOUR, COST_KEYS, CLASS_KEYS
} from './minigame-reserves.js';

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

/* 各国速胜手册：基于 65 回合模拟实测的最优路径，写入图鉴页供卡局玩家参考 */
const STRATEGY_PLAYBOOK = {
    GBR: {
        flag: '🇬🇧', name: '大英帝国', difficulty: '难度 🟢 最易（容错大）',
        win: '霸权度 ≥80（全程未跌破）+ 重工业全球第一 + 撑到 1900',
        lose: '国库 < −5000 或霸权度 < 30',
        core: '开局即把所得税拉到 20%（或对棉花/铁矿加 40-60% 关税）即可覆盖霸权维护开支。财政是唯一硬约束——实测任一单一杠杆（提税/关税/建钢厂）都够活到 1900。无需全程操作，但别完全挂机。',
        timeline: '前 10 回合提税一次 → 中期国库告急时再加关税 → 1900 自动判定胜利'
    },
    PRS: {
        flag: '🇩🇪', name: '普鲁士', difficulty: '难度 🟢 易（路径直接）',
        win: '重工业产值反超英国',
        lose: '工人激进度 >80% 或国库 < −4000',
        core: '李斯特幼稚工业保护路线：所得税 20%，每回合集中建炼钢厂。普鲁士煤铁潜能极高，约 10 回合重工业即可超英——是全游戏最快胜利路径。注意别把制成品关税拉到让工人消费不起。',
        timeline: '开局即建钢厂 → 约第 10 回合（1846 前后）重工业超英 → 触发胜利'
    },
    QING: {
        flag: '🇨🇳', name: '大清帝国', difficulty: '难度 🟡 中（需激进转型）',
        win: '制造品出口占比 >40%（破除依附锁链）',
        lose: '贸易条件 <40 或国库 < −3000',
        core: '进口替代工业化（ISI）：所得税 20%，每回合轮流建钢厂/机械厂/兵工厂，把庞大的农业人口底盘转向制造品产能。大清人口红利足、税收基数大，关键是产能结构从原料出口转向制造品。警惕贸易条件随时间恶化（P-S 效应）。',
        timeline: '前 20 回合打重工业地基 → 中期制造品出口占比爬升 → 约第 45 回合（1880 前后）破 40%'
    },
    USA: {
        flag: '🇺🇸', name: '美利坚', difficulty: '难度 🔴 最难（双约束）',
        win: '1870 后 GDP 增速超英（≥1.5% 且高出英国 1pp）+ 内战张力 <50',
        lose: '内战张力 >90 或国库 < −4000',
        core: '后发高增长路线：所得税 20%，激进建重工业（钢厂+机械厂+兵工厂），1870 年后 GDP 增速会自然反超停滞的英国。内战张力是软约束（实测很难触发），但别把制成品关税拉到极端。最难的是"增速差 1 个百分点"——需要持续建厂保持增长势头。',
        timeline: '前 30 回合疯狂工业化 → 1870 时间门通过 → 增速反超英国即胜（实测约 1870 当回合）'
    }
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
        body: '投机泡沫破裂引发挤兑，多家银行濒临倒闭。财政部面临救市与坚守金本位的两难——若本国正处于英镑潮汐的高脆弱度中，这场恐慌只会更猛烈。',
        opts: [
            { t: '央行注资救市', d: '国库 −1500 起，投资池 +500 起（按潮汐脆弱度加重/减效）', log: '央行紧急注资：稳定金融体系，国库大幅承压。', fx: n => { const scale = 1 + (n.tideFragility || 0) / 100; n.treasury = (n.treasury || 0) - Math.round(1500 * scale); n.investmentPool = (n.investmentPool || 0) + Math.round(500 / scale); } },
            { t: '坚守金本位，任其出清', d: '国库无损，投资池 −300 起（按潮汐脆弱度加重）', log: '坚守金本位：市场出清，投资池萎缩。', fx: n => { const scale = 1 + (n.tideFragility || 0) / 100; n.investmentPool = Math.max(0, (n.investmentPool || 0) - Math.round(300 * scale)); } }
        ]
    },
    {
        id: 'education_reform', tag: '内政改革', title: '国民教育法案',
        body: '改革派推动建立国民教育体系，提升长期人力资本；保守派忧虑税负与教会影响。',
        opts: [
            { t: '推行国民教育', d: '国库 −800，工人 Clout +5%', log: '推行国民教育法：人力资本长期投资，工人阶层壮大。', fx: n => { n.treasury = (n.treasury || 0) - 800; if (n.pops?.workers) n.pops.workers.clout = Math.min(0.95, (n.pops.workers.clout || 0) + 0.05); } },
            { t: '维持现状，节省开支', d: '国库无损，阶层格局不变', log: '搁置教育改革：财政稳健，阶层格局维持现状。' }
        ]
    },

    /* ========== GBR 专属（霸权 / 财政 / 海权） ========== */
    {
        id: 'gbr_opium_prelude', nation: 'GBR', tag: '远东贸易', title: '鸦片贸易与对华开战之争',
        body: '东印度公司在广州的鸦片走私利润丰厚但引爆外交危机，议会的自由贸易派与道德改良派就是否诉诸武力激烈交锋。',
        opts: [
            { t: '动用海军打开通商口岸', d: '国库 +2000，贸易条件改善；工人 Clout +3%', log: '对华开战：通商口岸洞开，关税与贸易条件大幅改善。', fx: n => { n.treasury = (n.treasury || 0) + 2000; if (n.pops?.workers) n.pops.workers.clout = Math.min(0.95, (n.pops.workers.clout || 0) + 0.03); } },
            { t: '收敛鸦片、避免战争', d: '国库无损，错失扩张红利', log: '选择道德路线：收缩鸦片贸易，财政稳健但远东扩张停滞。' }
        ]
    },
    {
        id: 'gbr_india_tribute', nation: 'GBR', tag: '殖民财源', title: '印度殖民地岁入汇缴',
        body: '东印度公司向伦敦汇缴本季殖民地岁入，财政部可选择直接入库或留给殖民地作基础投资。',
        opts: [
            { t: '直接汇缴国库', d: '国库 +1500', log: '印度岁入汇缴：国库一次性大额补充。', fx: n => { n.treasury = (n.treasury || 0) + 1500; } },
            { t: '留作殖民地铁路投资', d: '投资池 +800', log: '殖民地铁路投资：岁入转化为长期产能。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 800; } }
        ]
    },
    {
        id: 'gbr_gold_standard', nation: 'GBR', minYear: 1860, tag: '货币体系', title: '金本位存废之议',
        body: '战争开支使英格兰银行黄金储备吃紧，议会辩论是否暂停金本位兑换以增发货币。',
        opts: [
            { t: '坚守金本位', d: '国库 −1000，霸权度稳定；维持信用', log: '坚守金本位：财政紧缩但保住英镑信用。', fx: n => { n.treasury = (n.treasury || 0) - 1000; } },
            { t: '暂停兑换、增发纸币', d: '国库 +1200，通胀压工人实际工资', log: '暂停金本位兑换：短期财政宽裕，工人激进度 +15%。', fx: n => { n.treasury = (n.treasury || 0) + 1200; if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 15); } }
        ]
    },
    {
        id: 'gbr_naval_arms', nation: 'GBR', minYear: 1850, tag: '军备竞赛', title: '皇家海军两年造舰计划',
        body: '法俄海军扩张威胁海权，海军部要求专项拨款扩建铁甲舰以维持两强标准。',
        opts: [
            { t: '批准造舰、巩固海权', d: '国库 −1800，兵工厂 ×1.3 产出 4 回合', log: '启动造舰计划：兵工厂进入战时动员。', modifier: 'war_mobilization' },
            { t: '削减海军、节省财政', d: '国库无损，霸权度承压', log: '削减造舰预算：财政稳健但海权优势收窄。' }
        ]
    },
    {
        id: 'gbr_famine_relief', nation: 'GBR', minYear: 1845, maxYear: 1855, tag: '人道危机', title: '爱尔兰马铃薯饥荒',
        body: '连年马铃薯歉收引发爱尔兰大饥荒，内阁面临救济开支与自由放任教条的抉择。',
        opts: [
            { t: '拨款赈灾', d: '国库 −1200，工人激进度 −10%', log: '拨款赈济爱尔兰：人道代价缓解，民心稍稳。', fx: n => { n.treasury = (n.treasury || 0) - 1200; if (n.pops?.workers) n.pops.workers.radicals = Math.max(0, (n.pops.workers.radicals || 0) - 10); } },
            { t: '坚持自由放任', d: '国库无损，工人激进度 +12%', log: '坚持自由放任：饥荒加剧，工人不满上升。', fx: n => { if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 12); } }
        ]
    },
    {
        id: 'gbr_long_depression', nation: 'GBR', minYear: 1873, tag: '周期危机', title: '1873 大萧条冲击',
        body: '维也纳股市崩盘引发全球长萧条，英国出口骤降、失业攀升，财政部辩论救市方向——若外围国普遍深陷英镑潮汐的高脆弱度，这场萧条的全球传导也会更猛烈。',
        opts: [
            { t: '央行注资 + 铁路拉动', d: '国库 −1500 起（按外围潮汐脆弱度加重），6 回合投资池持续注入', log: '反周期刺激：央行注资并启动铁路繁荣对冲萧条。', fx: (n, state) => { const others = ['PRS', 'QING', 'USA']; const avgFrag = others.reduce((s, c) => s + (state.nations[c].tideFragility || 0), 0) / others.length; n.treasury = (n.treasury || 0) - Math.round(1500 * (1 + avgFrag / 100)); }, modifier: 'railway_boom' },
            { t: '等市场自发出清', d: '国库无损，投资池 −400 起（按外围潮汐脆弱度加重）', log: '放任出清：市场调节，投资池萎缩。', fx: (n, state) => { const others = ['PRS', 'QING', 'USA']; const avgFrag = others.reduce((s, c) => s + (state.nations[c].tideFragility || 0), 0) / others.length; n.investmentPool = Math.max(0, (n.investmentPool || 0) - Math.round(400 * (1 + avgFrag / 100))); } }
        ]
    },

    /* ========== PRS 专属（幼稚工业 / 重工业 / 关税同盟） ========== */
    {
        id: 'prs_zollverein', nation: 'PRS', tag: '关税同盟', title: '德意志关税同盟扩张',
        body: 'Zollverein 拟纳入更多邦国，统一内部市场的同时对外维持保护关税，李斯特派力主加速。',
        opts: [
            { t: '加速同盟、统一市场', d: '投资池 +500，制成品关税 +10%', log: '扩张关税同盟：内部市场扩大，保护关税上调。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 500; ['steel', 'tools', 'textiles', 'arms'].forEach(g => { n.tariffs[g] = Math.min(0.6, (n.tariffs[g] || 0) + 0.10); }); } },
            { t: '谨慎渐进', d: '投资池 +200，关税不变', log: '渐进扩张同盟：稳健但红利有限。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 200; } }
        ]
    },
    {
        id: 'prs_krupp_steel', nation: 'PRS', minYear: 1850, tag: '产业突破', title: '克虏伯炼钢法引进',
        body: '埃森的克虏伯工厂试验新式坩埚炼钢，产能跃升需要大笔资本投入，政府被请求担保。',
        opts: [
            { t: '担保克虏伯扩产', d: '6 回合制造品产出 ×1.15', log: '引进克虏伯炼钢法：重工业产能系统性提升。', modifier: 'tech_transfer' },
            { t: '让私人资本自行承担', d: '无财政支出，扩产缓慢', log: '由私人资本承担：稳健但错失技术红利。' }
        ]
    },
    {
        id: 'prs_war_indemnity', nation: 'PRS', minYear: 1864, maxYear: 1875, tag: '战争红利', title: '战争赔款注入国库',
        body: '对丹麦/法国的军事胜利带来巨额赔款与领土，财政部可选择一次性入库或专项投入重工业。',
        opts: [
            { t: '赔款直接入库', d: '国库 +2500', log: '战争赔款入库：财政一次性大额补充。', fx: n => { n.treasury = (n.treasury || 0) + 2500; } },
            { t: '专项投入重工业', d: '投资池 +2000', log: '赔款转投重工业：为反超英国铺路。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 2000; } }
        ]
    },
    {
        id: 'prs_social_insurance', nation: 'PRS', minYear: 1860, tag: '社会政策', title: '俾斯麦社会保险法案',
        body: '为压制工人运动、巩固容克-资本联盟，俾斯麦推动世界首创的疾病/工伤/养老社会保险。',
        opts: [
            { t: '推行社会保险', d: '国库 −1000，工人激进度 −25%', log: '推行社会保险：工人激进度大幅下降，阶层稳定。', fx: n => { n.treasury = (n.treasury || 0) - 1000; if (n.pops?.workers) n.pops.workers.radicals = Math.max(0, (n.pops.workers.radicals || 0) - 25); } },
            { t: '拒绝、维持高压', d: '国库无损，工人激进度 +10%', log: '拒绝社会保险：财政省下，工人不满积累。', fx: n => { if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 10); } }
        ]
    },
    {
        id: 'prs_iron_tariff', nation: 'PRS', tag: '保护主义', title: '铁血宰相的高关税路线',
        body: '俾斯麦为筹措军费与保护容克地主，推动对钢铁与粮食大幅加征关税，自由贸易派强烈反对。',
        opts: [
            { t: '加征保护关税', d: '钢铁/粮食关税 +20%，地主 Clout +5%', log: '通过保护关税法：重工业与地主双双受益。', fx: n => { n.tariffs.steel = Math.min(0.6, (n.tariffs.steel || 0) + 0.20); n.tariffs.grain = Math.min(0.6, (n.tariffs.grain || 0) + 0.20); if (n.pops?.landowners) n.pops.landowners.clout = Math.min(0.95, (n.pops.landowners.clout || 0) + 0.05); } },
            { t: '维持温和税率', d: '关税不变，资本家满意', log: '维持温和税率：自由贸易派满意，保护不足。' }
        ]
    },
    {
        id: 'prs_gruender', nation: 'PRS', minYear: 1870, tag: '金融泡沫', title: '1873 创办者狂潮崩盘',
        body: '统一后的德国爆发创办公司狂热，股市泡沫破裂导致大批银行倒闭，财政部面临救市抉择——若持续挂钩英镑吃尽潮汐宽松红利，这场崩盘的账单也会更沉重。',
        opts: [
            { t: '国家救助银行', d: '国库 −1500 起，投资池 +600 起（按潮汐脆弱度加重/减效）', log: '救助金融体系：稳定市场，国库大幅承压。', fx: n => { const scale = 1 + (n.tideFragility || 0) / 100; n.treasury = (n.treasury || 0) - Math.round(1500 * scale); n.investmentPool = (n.investmentPool || 0) + Math.round(600 / scale); } },
            { t: '任其出清', d: '国库无损，投资池 −500 起（按潮汐脆弱度加重）', log: '放任出清：市场重整，投资池萎缩。', fx: n => { const scale = 1 + (n.tideFragility || 0) / 100; n.investmentPool = Math.max(0, (n.investmentPool || 0) - Math.round(500 * scale)); } }
        ]
    },

    /* ========== QING 专属（进口替代 / 白银 / 贸易条件） ========== */
    {
        id: 'qing_opium_war', nation: 'QING', tag: '不平等条约', title: '鸦片战争与五口通商',
        body: '英舰北上游弋，朝廷在割地赔款与持久抵抗间抉择。战败将打开国门、冲击贸易条件。',
        opts: [
            { t: '签订通商条约', d: '国库 −1500，贸易条件 −15', log: '签订不平等条约：国门洞开，贸易条件恶化。', fx: n => { n.treasury = (n.treasury || 0) - 1500; } },
            { t: '坚持抵抗', d: '国库 −800，工人激进度 +10%', log: '坚持抵抗：财政消耗，民心激愤。', fx: n => { n.treasury = (n.treasury || 0) - 800; if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 10); } }
        ]
    },
    {
        id: 'qing_taiping', nation: 'QING', tag: '内乱', title: '太平天国运动',
        body: '南方爆发大规模民变，江南赋税重镇告急。朝廷面临全力镇压与招抚安抚的两难。',
        opts: [
            { t: '调集重兵镇压', d: '国库 −2000，工人激进度 −15%', log: '镇压太平天国：财政重负，但恢复秩序。', fx: n => { n.treasury = (n.treasury || 0) - 2000; if (n.pops?.workers) n.pops.workers.radicals = Math.max(0, (n.pops.workers.radicals || 0) - 15); } },
            { t: '妥协招抚', d: '国库 −600，地主 Clout −5%', log: '招抚妥协：财政省却兵费，但中央权威受损。', fx: n => { n.treasury = (n.treasury || 0) - 600; if (n.pops?.landowners) n.pops.landowners.clout = Math.max(0.05, (n.pops.landowners.clout || 0) - 0.05); } }
        ]
    },
    {
        id: 'qing_self_strengthening', nation: 'QING', minYear: 1860, tag: '自强运动', title: '洋务自强与新式工厂',
        body: '曾国藩、李鸿章力主"师夷长技"，在上海、江南筹建兵工厂与造船厂，亟需专款。',
        opts: [
            { t: '拨款兴办洋务', d: '国库 −1800，6 回合制造品产出 ×1.15', log: '推行洋务自强：重工业产能系统性提升。', modifier: 'tech_transfer' },
            { t: '缓办、先行厘清财政', d: '国库无损，错失近代化窗口', log: '缓办洋务：财政稳健但近代化延误。' }
        ]
    },
    {
        id: 'qing_lijin_tax', nation: 'QING', tag: '财政改革', title: '厘金流通税推广',
        body: '为筹措军饷，地方建议在全国推广厘金（国内流通税），短期充实财政但阻碍国内贸易。',
        opts: [
            { t: '全国推行厘金', d: '国库 +1800，投资池 −300', log: '推广厘金：财政充实但国内流通受阻。', fx: n => { n.treasury = (n.treasury || 0) + 1800; n.investmentPool = Math.max(0, (n.investmentPool || 0) - 300); } },
            { t: '维持旧税制', d: '国库 +300，无副作用', log: '维持旧税制：稳健但财政红利有限。', fx: n => { n.treasury = (n.treasury || 0) + 300; } }
        ]
    },
    {
        id: 'qing_sino_japanese', nation: 'QING', minYear: 1890, tag: '地缘危机', title: '甲午战争前夜',
        body: '日本在朝鲜挑衅，朝廷内部海防派与避战派相持不下，北洋水师战备吃紧。',
        opts: [
            { t: '扩军备战', d: '国库 −1500，4 回合兵工厂 ×1.3 产出', log: '扩军备战：军工动员，财政承压。', modifier: 'war_mobilization' },
            { t: '避战求和', d: '国库 −500，地主 Clout −8%', log: '避战求和：节省军费但主权与威信受损。', fx: n => { n.treasury = (n.treasury || 0) - 500; if (n.pops?.landowners) n.pops.landowners.clout = Math.max(0.05, (n.pops.landowners.clout || 0) - 0.08); } }
        ]
    },
    {
        id: 'qing_coast_vs_frontier', nation: 'QING', minYear: 1870, tag: '战略之争', title: '海防与塞防之争',
        body: '左宗棠主张西征收复新疆（塞防），李鸿章主张专注海军建设（海防），朝廷军费有限只能侧重一方。',
        opts: [
            { t: '重海防、建北洋水师', d: '国库 −1200，投资池 +400', log: '侧重海防：海军成型，民用投资有限。', fx: n => { n.treasury = (n.treasury || 0) - 1200; n.investmentPool = (n.investmentPool || 0) + 400; } },
            { t: '重塞防、收复新疆', d: '国库 −1500，地主 Clout +6%', log: '侧重塞防：西北平定，地主威望上升。', fx: n => { n.treasury = (n.treasury || 0) - 1500; if (n.pops?.landowners) n.pops.landowners.clout = Math.min(0.95, (n.pops.landowners.clout || 0) + 0.06); } }
        ]
    },

    /* ========== USA 专属（增速 / 南北 / 西进） ========== */
    {
        id: 'usa_civil_war', nation: 'USA', minYear: 1860, tag: '南北分裂', title: '南北战争爆发',
        body: '南方蓄奴州宣布脱离联邦。林肯面临动员平叛与妥协和解的抉择，关税保护主义正是分裂导火索之一。',
        opts: [
            { t: '动员联邦军平叛', d: '国库 −2000，4 回合兵工厂 ×1.3 产出', log: '动员内战：军工全速运转，财政重负。', modifier: 'war_mobilization' },
            { t: '寻求妥协', d: '国库 −800，内战张力 −20', log: '妥协退让：避免全面战争但张力仍存。', fx: n => { n.treasury = (n.treasury || 0) - 800; } }
        ]
    },
    {
        id: 'usa_transcontinental', nation: 'USA', minYear: 1860, tag: '西进运动', title: '横贯大陆铁路',
        body: '联邦政府拟拨地担保修建横贯大陆铁路，连接东西海岸，资本与劳动力需求空前。',
        opts: [
            { t: '联邦担保修建', d: '6 回合投资池持续 +120', log: '启动横贯铁路：投资池持续注入，拉动西进。', modifier: 'railway_boom' },
            { t: '交由私人投机', d: '国库 +300，扩张缓慢', log: '私人铁路：财政无损但扩张缓慢。', fx: n => { n.treasury = (n.treasury || 0) + 300; } }
        ]
    },
    {
        id: 'usa_gilded_trust', nation: 'USA', minYear: 1875, tag: '镀金时代', title: '垄断托拉斯扩张',
        body: '洛克菲勒、卡内基等巨头整合产业形成托拉斯，效率与价格操纵并存，国会辩论反托拉斯立法。',
        opts: [
            { t: '放任垄断整合', d: '投资池 +800，工人激进度 +12%', log: '放任托拉斯：产能集中，工人不满上升。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 800; if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 12); } },
            { t: '推动反托拉斯法', d: '国库 −500，资本家 Clout −5%', log: '反托拉斯立法：抑制垄断，资本家势力下降。', fx: n => { n.treasury = (n.treasury || 0) - 500; if (n.pops?.capitalists) n.pops.capitalists.clout = Math.max(0.05, (n.pops.capitalists.clout || 0) - 0.05); } }
        ]
    },
    {
        id: 'usa_silver_free', nation: 'USA', minYear: 1870, tag: '货币之争', title: '金银本位之争',
        body: '银矿州与农场主推动自由铸造银币以扩张货币、减轻债务；东部银行家坚持金本位。',
        opts: [
            { t: '自由铸银、扩张货币', d: '国库 +1200，通胀压工人实际工资', log: '自由铸银：短期财政宽裕，工人激进度 +12%。', fx: n => { n.treasury = (n.treasury || 0) + 1200; if (n.pops?.workers) n.pops.workers.radicals = Math.min(100, (n.pops.workers.radicals || 0) + 12); } },
            { t: '坚守金本位', d: '国库 −600，资本家 Clout +4%', log: '坚守金本位：紧缩信用，资本家受益。', fx: n => { n.treasury = (n.treasury || 0) - 600; if (n.pops?.capitalists) n.pops.capitalists.clout = Math.min(0.95, (n.pops.capitalists.clout || 0) + 0.04); } }
        ]
    },
    {
        id: 'usa_spanish_war', nation: 'USA', minYear: 1890, tag: '海外扩张', title: '美西战争与海外领地',
        body: '古巴局势引发对西班牙的战争呼声，扩张派主张夺取古巴、菲律宾，反战派警告帝国过度扩张。',
        opts: [
            { t: '对西开战、夺取领地', d: '国库 −1500，4 回合兵工厂 ×1.3 产出', log: '美西战争：军工动员，海外领地扩张。', modifier: 'war_mobilization' },
            { t: '保持中立', d: '国库无损，错失海外领地', log: '保持中立：财政稳健，海外扩张停滞。' }
        ]
    },
    {
        id: 'usa_immigration', nation: 'USA', tag: '人口红利', title: '欧洲移民潮涌入',
        body: '连年欧洲动荡驱动大规模移民涌入美国东岸，工厂主欢呼廉价劳动力，本土工人担忧工资被压。',
        opts: [
            { t: '开放移民、充实工业', d: '投资池 +700，资本家 Clout +5%', log: '开放移民：劳动力充裕，资本家势力上升。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 700; if (n.pops?.capitalists) n.pops.capitalists.clout = Math.min(0.95, (n.pops.capitalists.clout || 0) + 0.05); } },
            { t: '限制移民', d: '工人 Clout +5%，投资池 +200', log: '限制移民：保护本土工人，资本扩张放缓。', fx: n => { n.investmentPool = (n.investmentPool || 0) + 200; if (n.pops?.workers) n.pops.workers.clout = Math.min(0.95, (n.pops.workers.clout || 0) + 0.05); } }
        ]
    },

    /* ========== v3.6 跨国系统事件（英镑潮汐时机 / 雁行产业转移 / 金融城信用封锁）
     * fx 签名扩展为 (nation, state)，可跨国读写 state.nations.*；cond(nation, state) 为运行时条件门。 */
    {
        id: 'gbr_boe_rate', nation: 'GBR', tag: '潮汐决策', title: '英格兰银行贴现率抉择',
        cond: (n, state) => state.tide && state.tide.phase === 'EASY' && state.tide.turnsInPhase >= 6,
        body: '海外信贷持续扩张，黄金储备缓慢流出。英格兰银行行长请求内阁定夺：是否即刻加息以捍卫金本位，还是再放任资本潮汐外溢一段时日。',
        opts: [
            { t: '即刻加息，捍卫黄金', d: '下回合触发潮汐收紧，外围国脆弱度提前清算，收割较温和', log: '英格兰银行宣布加息：贴现率抬升，全球资本开始回流伦敦。', fx: (n, state) => { state.tide.turnsInPhase = state.tide.phaseLength; } },
            { t: '维持宽松，继续放水', d: '宽松期延长 4 回合，外围国脆弱度继续累积，日后收割更猛烈', log: '内阁决定维持低贴现率：伦敦资本继续外溢，潮汐脆弱度持续累积。', fx: (n, state) => { state.tide.phaseLength += 4; } }
        ]
    },
    {
        id: 'gbr_textile_offshoring', nation: 'GBR', minYear: 1850, tag: '雁行首发', title: '纺织资本谋求海外设厂',
        cond: (n, state) => (n.employmentTightness || 0) >= 0.90 || state.year >= 1870,
        body: '兰开夏郡的纺织工资持续攀升，工厂主们盯上了大清通商口岸的低廉劳动力，请求政府放行资本出海设厂。',
        opts: [
            { t: '资本出海，通商口岸设厂', d: '大清纺织产能 +3；此后 8 回合内小额利润回流英国国库', log: '纺织资本移师大清通商口岸：产业接力棒交出，海外利润开始回流母国。', fx: (n, state) => { const q = state.nations.QING; q.buildings.textile_mill = (q.buildings.textile_mill || 0) + 3; state.globalEffects.push({ type: 'profit_repatriation', from: 'QING', to: 'GBR', amount: 40, turnsLeft: 8 }); } },
            { t: '保护本土产业链，拒绝外迁', d: '错失雁行红利，但纺织产业链完整留在本土', log: '拒绝资本外迁：纺织产业链留在本土，错失海外扩张窗口。' }
        ]
    },
    {
        id: 'qing_foreign_concession_mill', nation: 'QING', minYear: 1850, tag: '通商口岸', title: '洋商申请设立纺纱厂',
        cond: (n, state) => (state.nations.GBR.employmentTightness || 0) >= 0.90 || state.year >= 1860,
        body: '英国洋行请求在通商口岸自建纺纱厂，承诺带来机器与订单，但利润将循原航路汇回伦敦。李鸿章一系主张借船出海，清流则警告"以夷制夷"恐养虎为患。',
        opts: [
            { t: '批准洋商设厂', d: '纺织产能 +3；此后 8 回合内小额利润流向英国', log: '批准洋商设厂：产能立时扩张，但利润开始外流。', fx: (n, state) => { n.buildings.textile_mill = (n.buildings.textile_mill || 0) + 3; state.globalEffects.push({ type: 'profit_repatriation', from: 'QING', to: 'GBR', amount: 40, turnsLeft: 8 }); } },
            { t: '洋务自强，婉拒洋商', d: '错失产能红利，但利润与产业主权完整自留', log: '婉拒洋商设厂：自强路线继续，产业主权完整保留。' }
        ]
    },
    {
        id: 'gbr_credit_blockade', nation: 'GBR', minYear: 1850, tag: '金融武器', title: '金融城的承销抉择',
        body: '一个不驯的贸易伙伴对英国商品筑起高墙关税，金融城的承销商们私下讨论：是否该拒绝为其国债承销，让它尝尝被排除在伦敦资本网络之外的滋味。',
        opts: [
            { t: '拒绝承销，实施信用封锁', d: '关税最高的挑战者投资池连续 6 回合遭压制', log: '金融城行使信用封锁：向不驯的贸易伙伴关闭伦敦资本大门。', fx: (n, state) => {
                const codes = ['PRS', 'QING', 'USA'];
                let target = null, maxTariff = -1;
                codes.forEach(code => {
                    const nn = state.nations[code];
                    const avg = ['steel', 'tools', 'textiles', 'arms'].reduce((s, g) => s + (nn.tariffs[g] || 0), 0) / 4;
                    if (avg > maxTariff) { maxTariff = avg; target = code; }
                });
                if (target) {
                    state.globalEffects.push({ type: 'credit_blockade', nation: target, turnsLeft: 6 });
                    state.logs.unshift(`${state.year} · 🚫 金融城对${state.nations[target].name}实施信用封锁：投资池遭持续压制。`);
                }
            } },
            { t: '保持金融中立', d: '不动用金融武器，避免激化对抗', log: '金融城保持中立：暂不动用承销权作为武器。' }
        ]
    }
];

/* v3.6 条件触发：事件可选带 nation（字符串或数组，缺省=通用全国家可见）
 * 与 minYear/maxYear（整数年份门，缺省=不限）。先按条件筛，再在合格子集内去重随机。
 * v3.6 新增 e.cond(nation, state) 谓词：用于挂钩运行时指标（如雇佣紧张度突破拐点）。 */
function eventApplies(e) {
    const code = gameState.playerNationKey, yr = gameState.year;
    if (e.nation) {
        const ns = Array.isArray(e.nation) ? e.nation : [e.nation];
        if (!ns.includes(code)) return false;
    }
    if (e.minYear && yr < e.minYear) return false;
    if (e.maxYear && yr > e.maxYear) return false;
    if (e.cond && !e.cond(gameState.nations[code], gameState)) return false;
    return true;
}

/* 随机抽取事件：先条件筛 → 再避开最近 3 次（recentEventIds）以保证新鲜感。
 * 若条件筛后无一合格则返回 null（调用方跳过，不硬塞不合格事件）。 */
function pickRandomEvent() {
    const recent = gameState.recentEventIds || [];
    const eligible = EVENTS.filter(eventApplies);
    if (!eligible.length) return null;
    let pool = eligible.filter(e => !recent.includes(e.id));
    if (!pool.length) pool = eligible;                  // 去重空了→放弃去重，仍只挑合格的
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

/* ---------------- v3.6 跨国系统（英镑潮汐 / 铸币税 / 金融城信用封锁）----------------
 * 与 MODIFIER_TYPES（仅作用于玩家本国）不同，这里的效果需要读写全部四国，
 * 因此单独用 state.tide / state.globalEffects 承载，在 tick() 之前对 prev.nations 直接写入
 * （与 applyActiveModifiers 同一时机），只碰 treasury/investmentPool/buildings 等 tick 会
 * 增量延续的字段，不碰每回合从建筑重算的 production/consumption（写了也会被覆盖，参见
 * MODIFIER_TYPES.tech_transfer/war_mobilization 的产出加成分支——那两条其实从未生效过）。 */
const PERIPHERY_CODES = ['PRS', 'QING', 'USA'];

function applyGlobalSystems(prev) {
    const tide = prev.tide;
    const others = PERIPHERY_CODES.map(c => prev.nations[c]).filter(Boolean);

    // (1) 铸币税 / 负利差循环：正对外净资产每回合被小额抽成流入英国国库（seigniorage_negative_carry）
    let seigniorage = 0;
    others.forEach(n => {
        const nfa = n.netForeignAssets || 0;
        if (nfa > 0) {
            const skim = Math.round(nfa * 0.01);
            if (skim > 0) {
                n.treasury = (n.treasury || 0) - skim;
                seigniorage += skim;
            }
        }
    });
    if (seigniorage > 0) {
        prev.nations.GBR.treasury = (prev.nations.GBR.treasury || 0) + seigniorage;
        if (seigniorage >= 5) {
            prev.logs.unshift(`${prev.year} · 💰 铸币税：外围储备回流伦敦，英国国库 +${seigniorage}（负利差循环）。`);
        }
    }

    // (2) 英镑潮汐：EASY 宽松期资本溢出 + 脆弱度累积；TIGHT 收紧期一次性收割
    if (tide.phase === 'EASY') {
        others.forEach(n => {
            n.investmentPool = (n.investmentPool || 0) + 70;
            const gain = n.goldExchangeStandard ? 7 : 0; // 金块本位免疫脆弱度累积
            n.tideFragility = Math.min(100, (n.tideFragility || 0) + gain);
        });
        tide.turnsInPhase += 1;
        if (tide.turnsInPhase >= tide.phaseLength) {
            tide.phase = 'TIGHT';
        }
    } else {
        let gbrGain = 0;
        others.forEach(n => {
            const frag = n.tideFragility || 0;
            if (frag <= 0) return;
            const poolHit = Math.round(frag * 6);
            const treasuryHit = Math.round(frag * 4);
            n.investmentPool = Math.max(0, (n.investmentPool || 0) - poolHit);
            n.treasury = (n.treasury || 0) - treasuryHit;
            gbrGain += treasuryHit * 0.5;
            if (frag >= 15) {
                prev.logs.unshift(`${prev.year} · 🌊 英镑潮汐收割：${n.name} 投资池 −${poolHit}、国库 −${treasuryHit}（脆弱度 ${Math.round(frag)}）。`);
            }
            n.tideFragility = 0;
        });
        if (gbrGain > 0) {
            prev.nations.GBR.treasury = (prev.nations.GBR.treasury || 0) + Math.round(gbrGain);
            prev.logs.unshift(`${prev.year} · 💷 伦敦资本回流：英格兰银行加息捍卫黄金，英国国库 +${Math.round(gbrGain)}。`);
        }
        tide.phase = 'EASY';
        tide.turnsInPhase = 0;
        tide.phaseLength = 10 + Math.floor(Math.random() * 6);
    }

    // (3) globalEffects：跨国持续效应（雁行利润回流 / 金融城信用封锁）
    if (prev.globalEffects && prev.globalEffects.length) {
        const expiredLabels = [];
        prev.globalEffects = prev.globalEffects.filter(e => {
            const from = prev.nations[e.from];
            const to = prev.nations[e.to];
            const target = prev.nations[e.nation];
            if (e.type === 'profit_repatriation' && from && to) {
                from.treasury = (from.treasury || 0) - e.amount;
                to.treasury = (to.treasury || 0) + e.amount;
            } else if (e.type === 'credit_blockade' && target) {
                target.investmentPool = Math.round((target.investmentPool || 0) * 0.7);
            }
            e.turnsLeft -= 1;
            if (e.turnsLeft <= 0) {
                expiredLabels.push(e);
                return false;
            }
            return true;
        });
        expiredLabels.forEach(e => {
            if (e.type === 'profit_repatriation') {
                prev.logs.unshift(`${prev.year} · 🏭 ${prev.nations[e.to]?.name}对${prev.nations[e.from]?.name}的产业利润回流期结束。`);
            } else if (e.type === 'credit_blockade') {
                prev.logs.unshift(`${prev.year} · 🚫 金融城对${prev.nations[e.nation]?.name}的信用封锁解除。`);
            }
        });
    }
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

// 补齐 v3.5/v3.6 新增字段，兼容旧存档与 createInitialState 的纯引擎产物
function normalizeState(s) {
    if (!Array.isArray(s.activeModifiers)) s.activeModifiers = [];
    if (!Array.isArray(s.recentEventIds)) s.recentEventIds = [];
    if (!s.advisoryFlags) s.advisoryFlags = {};
    // v3.6: 英镑潮汐周期（EASY 宽松 / TIGHT 收紧-收割），UI 层跨国系统，不进入引擎纯函数
    if (!s.tide) s.tide = { phase: 'EASY', turnsInPhase: 0, phaseLength: 10 + Math.floor(Math.random() * 6) };
    if (!Array.isArray(s.globalEffects)) s.globalEffects = [];
    Object.entries(s.nations || {}).forEach(([code, n]) => {
        if (code !== 'GBR') {
            if (n.goldExchangeStandard === undefined) n.goldExchangeStandard = true;
            if (n.tideFragility === undefined) n.tideFragility = 0;
        }
    });
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
    // v3.6 跨国系统：英镑潮汐/铸币税/信用封锁，四国全局生效，与玩家选择的国家无关
    applyGlobalSystems(prev);

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
        const ev = pickRandomEvent();
        if (ev) eventQueue.push(ev);
    }

    saveState();

    // 财政预警与接近胜利提示（每条仅触发一次，标志位存于 state 避免刷屏）
    emitAdvisories(now, nowStats);

    render();
    if (gameState.gameStatus !== 'PLAYING') showEndgame();
    else if (!maybeTriggerSpecieCrisis()) showNextEvent();
}

/* 国际收支危局：对外净资产转负、或贸易大幅逆差时触发一次金本位自动调节推演。
 * 返回 true 表示已弹出（调用方跳过本回合的普通事件，避免两个弹窗叠在一起）。 */
function maybeTriggerSpecieCrisis() {
    const flags = gameState.advisoryFlags || (gameState.advisoryFlags = {});
    if (flags.specieCrisis) return false;
    if (gameState.turn < 8) return false;

    const code = gameState.playerNationKey;
    const n = gameState.nations[code];
    // 注意：引擎的 n.tradeBalance 从未被赋值（core.js/stats.js 都是 `|| 0` 读取），
    // 这里用 market.js 真实计算的进出口额差价，而不是那个恒为 0 的字段。
    const tradeBal = (n.exportValSum || 0) - (n.importValSum || 0);
    // 角色由结构位置决定而非贸易差额瞬时符号：GBR 是金本位的清算中心（握有"冲销"工具），
    // 其余国是被动承受调整的外围。这正是笔记"规则对等、执行能力不对等"的建模。
    const role = code === 'GBR' ? 'surplus' : 'deficit';
    const stressed = role === 'surplus' ? tradeBal > 0 : tradeBal < -200;
    // 兜底：即使本局没出现明显失衡，也保证第 14 回合前必定推演一次，不让玩家整局错过
    if (!stressed && gameState.turn < 14) return false;

    flags.specieCrisis = true;
    showSpecieFlowGame({
        mode: 'crisis', role, nationName: n.name,
        onFinish: g => { applySpecieOutcome(g); saveState(); render(); showNextEvent(); }
    });
    return true;
}

/* 把推演结果写回本局：国库 / 工人激进度 / 潮汐脆弱度。
 * 顺差国的"冲销"把代价转嫁给外围——所以要改的是其余三国的脆弱度，而不是自己的。 */
function applySpecieOutcome(g) {
    const code = gameState.playerNationKey;
    const n = gameState.nations[code];
    const bumpRadicals = d => { if (n.pops?.workers) n.pops.workers.radicals = Math.max(0, Math.min(100, (n.pops.workers.radicals || 0) + d)); };
    const bumpOwnFragility = d => { if (n.tideFragility !== undefined) n.tideFragility = Math.max(0, Math.min(100, (n.tideFragility || 0) + d)); };
    const bumpPeripheryFragility = d => PERIPHERY_CODES.forEach(c => {
        const p = gameState.nations[c];
        if (p && p.tideFragility !== undefined) p.tideFragility = Math.max(0, Math.min(100, (p.tideFragility || 0) + d));
    });

    let log;
    if (g.status === 'WON' && g.role === 'deficit') {
        n.treasury += 600; bumpOwnFragility(-25); bumpRadicals(8);
        log = '🪙 金本位自动调节闭环走通：国际收支恢复平衡，国库 +600、脆弱度 −25，但通缩留下的失业推高了工人激进度 +8。';
    } else if (g.status === 'WON' && g.role === 'surplus' && g.outcome === 'sterilized') {
        n.treasury += 500; bumpRadicals(-5); bumpPeripheryFragility(12);
        log = `🪙 冲销黄金流入：拒绝通胀，国库 +500、工人激进度 −5。调整代价转嫁给外围——三国潮汐脆弱度 +12。`;
    } else if (g.status === 'WON' && g.role === 'surplus') {
        n.treasury -= 300; bumpPeripheryFragility(-15);
        log = '🪙 分担调整成本：资本输出让机制双向闭合，国库 −300，但外围三国脆弱度 −15，体系更稳。';
    } else if (g.outcome === 'broke_peg') {
        n.treasury -= 800; bumpOwnFragility(20); bumpRadicals(-10);
        log = '🪙 暂停黄金兑换、脱离金本位：通缩立止，工人激进度 −10；但国际信用受损，国库 −800、脆弱度 +20。';
    } else {
        n.treasury -= 700; bumpOwnFragility(15); bumpRadicals(18);
        log = '🪙 国际收支调整失败：国库 −700、工人激进度 +18、脆弱度 +15。';
    }
    gameState.logs.unshift(`${gameState.year} · ${log}`);
}

/* 一次性预警/提示：财政悬崖告急 + USA/QING 接近胜利。标志位持久化于 state。 */
function emitAdvisories(nation, stats) {
    const code = gameState.playerNationKey;
    const flags = gameState.advisoryFlags || (gameState.advisoryFlags = {});
    const treasury = Math.round(nation.treasury);

    // 财政告急：国库 < 2000 且未预警过
    if (treasury < 2000 && !flags.fiscal) {
        flags.fiscal = true;
        gameState.logs.unshift(`${gameState.year} · ⚠️ 财政告急：国库仅 ¥${treasury}。基础治理与霸权开支随回合上升，建议尽快提高所得税率、对净进口商品加关税或关闭亏损补贴。`);
    }

    // USA 接近胜利：增速与 GBR 差距 < 0.5%，1870 后
    if (code === 'USA' && gameState.year >= 1870 && !flags.usaClose) {
        const usaG = stats.gdpGrowth || 0;
        const gbrG = gameState.derivedStats.GBR?.gdpGrowth || 0;
        if (usaG >= gbrG - 0.005 && usaG < gbrG + 0.01) {
            flags.usaClose = true;
            gameState.logs.unshift(`${gameState.year} · 🗽 美国经济增速（${(usaG*100).toFixed(1)}%）已逼近英国（${(gbrG*100).toFixed(1)}%），再加几座重工业工厂即可反超达成胜利。`);
        }
    }

    // QING 接近胜利：制造品出口占比突破 25%
    if (code === 'QING' && !flags.qingClose) {
        const ratio = stats.manufacturedExportRatio || 0;
        if (ratio >= 0.25 && ratio < 0.40) {
            flags.qingClose = true;
            gameState.logs.unshift(`${gameState.year} · ⛵ 大清制造品出口占比已达 ${Math.round(ratio*100)}%，进口替代工业化初见成效，继续扩建钢厂/机械厂/兵工厂推向 40% 即可破除依附锁链。`);
        }
    }

    // GBR 霸权告急：heg 跌破 82 且未预警（预警后不再重复）
    if (code === 'GBR' && !flags.hegWarn && gameState.hegemonyScore < 82) {
        flags.hegWarn = true;
        gameState.logs.unshift(`${gameState.year} · ⚠️ 霸权稳定度降至 ${Math.round(gameState.hegemonyScore)}%：他国重工业崛起正在挤压英国。建议维持钢厂/兵工厂产能以稳住重工业全球第一。`);
    }
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
                if (o.fx) o.fx(nation, gameState);
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
    const code = gameState.playerNationKey;
    const n = gameState.nations[code];
    const won = gameState.gameStatus === 'WON';
    const diag = won ? diagnoseWin(gameState, code) : diagnoseLoss(gameState, code);
    showModal({
        tag: won ? '战略胜利' : '国家危机', tagClass: won ? 'win' : 'lose',
        title: won ? '🏆 达成历史战略目标' : '⚠️ 触及失败防线',
        body: `<p>${won ? `胜利条件：${n.winCondition.desc}` : `失败条件：${n.loseCondition.desc}`}</p>
               <p style="margin-top:10px;padding-top:10px;border-top:1px solid oklch(72% 0.11 75 / .25)"><b style="color:var(--brass)">${won ? '📊 制胜路径' : '🔬 失败诊断'}</b><br>${diag}</p>
               <p style="margin-top:10px;padding-top:10px;border-top:1px solid oklch(72% 0.11 75 / .25)"><b style="color:var(--ink-mute)">🕯️ 尾声</b><br>本局的英镑潮汐、金汇兑本位与铸币税，正是二十世纪布雷顿森林体系与牙买加体系的制度雏形——两次世界大战后霸权货币从英镑更迭为美元，1971 年黄金窗口关闭、1976 年牙买加协议确认浮动汇率，但"铸币税・潮汐・信用封锁"三利器的收割逻辑一脉相承。读懂了这盘账本里英镑本位如何运转，也就读懂了今天的美元本位。</p>`,
        opts: [
            { t: '重新开局', d: '回到 1836 年，延续同一国家', fx: () => { gameState = normalizeState(createInitialState(gameState.playerNationKey)); viewNation = gameState.playerNationKey; lastDelta = null; endgameShown = false; eventQueue = []; saveState(); } },
            { t: '留在终局画面', d: '查看最终账本' }
        ]
    });
}

/* 失败诊断：按各国 lose 条件逐条比对，返回根因 + 对策（基于实测最优路径） */
function diagnoseLoss(state, code) {
    const n = state.nations[code];
    const st = state.derivedStats?.[code] || {};
    const tips = {
        GBR: {
            treasury: '国库被霸权维护成本（每回合 +45×年）与基础治理开支拖垮。对策：开局即把所得税拉到 20%+，或对棉花/铁矿（净进口）加 40-60% 关税增收入；维持钢厂/兵工厂产能以保霸权度不崩。',
            hegemony: '霸权度跌破 30：他国重工业崛起挤压（挑战者压力）。对策：每回合维持 1-2 座钢厂/兵工厂的建造节奏，确保重工业全球第一。'
        },
        PRS: {
            radicals: '工人激进度 >80%：消费篮子过贵或配给不足。对策：对粮食/煤炭降关税压低生存成本，或开启亏损产业补贴维持就业。',
            treasury: '国库破产（< −4000）。对策：所得税 20%+，集中建炼钢厂（普鲁士煤铁潜能高），约 10 回合重工业即可超英获胜，避免拖延。'
        },
        QING: {
            tot: '贸易条件跌破 40（Prebisch-Singer 依附恶化）。对策：加速进口替代——每回合建钢厂/机械厂/兵工厂，把制造品出口占比推向 40% 后即破除依附锁链获胜。',
            treasury: '国库破产（< −3000）。对策：所得税 20%，激进工业化；大清人口底盘大、税收基数足，关键是把产能转向制造品而非原料出口。'
        },
        USA: {
            tension: '内战张力 >90：保护主义关税加剧南北撕裂。对策：适度（非最大化）制成品关税，平衡北方工业与南方种植园利益。',
            treasury: '国库破产（< −4000）。对策：所得税 20%，激进建重工业；1870 年后 GDP 增速会反超英国达成胜利，期间保持内战张力 <50。'
        }
    };
    if (code === 'GBR') {
        if (n.treasury < -5000) return tips.GBR.treasury;
        if (state.hegemonyScore < 30) return tips.GBR.hegemony;
        return tips.GBR.treasury;
    }
    if (code === 'PRS') {
        if ((n.pops?.workers?.radicals || 0) > 80) return tips.PRS.radicals;
        return tips.PRS.treasury;
    }
    if (code === 'QING') {
        if ((st.termsOfTrade || 100) < 40) return tips.QING.tot;
        return tips.QING.treasury;
    }
    if (code === 'USA') {
        if ((st.civilWarTension || 0) > 90) return tips.USA.tension;
        return tips.USA.treasury;
    }
    return '详见「图鉴 · 各国速胜手册」。';
}

/* 胜利诊断：简述达成的关键指标 */
function diagnoseWin(state, code) {
    const st = state.derivedStats?.[code] || {};
    const n = state.nations[code];
    if (code === 'GBR') return `霸权稳定度终值 ${Math.round(state.hegemonyScore)}%，全程未跌破 80，重工业全球第 ${st.heavyRank}，撑到 ${state.year} 年。`;
    if (code === 'PRS') return `重工业产值 ${st.heavyIndustryVal} 反超英国（${state.derivedStats.GBR.heavyIndustryVal}），完成李斯特式产业追赶。`;
    if (code === 'QING') return `制造品出口占比 ${Math.round((st.manufacturedExportRatio||0)*100)}% 破除依附锁链，贸易条件 ${st.termsOfTrade}。`;
    if (code === 'USA') return `GDP 增速 ${(st.gdpGrowth*100).toFixed(1)}% 反超英国，内战张力 ${st.civilWarTension}，完成新兴大国崛起。`;
    return '';
}

/* ---------------- 金本位自动调节小游戏（休谟价格—铸币流动机制）----------------
 * mode='crisis'  ：国际收支恶化时强制弹出，结算回写国库/激进度/潮汐脆弱度
 * mode='sandbox' ：从图鉴页随时打开，纯练习，不触碰存档
 * role 由玩家国在体系中的位置决定：GBR=顺差国（有"冲销"按钮），其余=逆差国（没有）。 */

const SG_LO = 50, SG_HI = 150;   // 变量条的显示区间（均衡 100 落在正中）

function sgPct(v) { return Math.max(0, Math.min(100, ((v - SG_LO) / (SG_HI - SG_LO)) * 100)); }

function sgBar({ name, hint, value, prev, color, max100 = false }) {
    const pct = max100 ? Math.max(0, Math.min(100, value)) : sgPct(value);
    const delta = prev == null ? null : Math.round((value - prev) * 10) / 10;
    const dTxt = delta === null || delta === 0 ? '' :
        `<span class="sg-delta" style="color:${delta > 0 ? 'var(--verdant)' : 'oklch(72% 0.14 30)'}">${delta > 0 ? '+' : ''}${delta}</span>`;
    return `<div class="sg-var">
        <div class="sg-top">
            <span class="sg-name">${name}<i>${hint}</i></span>
            <span class="sg-num" style="color:${color}">${Math.round(value * 10) / 10}${dTxt}</span>
        </div>
        <div class="sg-track">
            <i style="width:${pct}%;background:${color}"></i>
            ${max100 ? '' : `<div class="sg-eq" style="left:${sgPct(PARITY)}%"></div>`}
        </div>
    </div>`;
}

/* 复刻笔记那张四变量时序图：黄金先动 → 货币跟进 → 物价最滞后 */
function sgChart(history) {
    const W = 660, H = 118, padL = 8, padR = 8, padT = 10, padB = 10;
    const series = [
        { key: 'gold', color: '#d97706', label: '黄金存量' },
        { key: 'money', color: '#6366f1', label: '货币供给' },
        { key: 'prices', color: '#16a34a', label: '物价水平' }
    ];
    const all = history.flatMap(h => series.map(s => h[s.key]));
    const lo = Math.min(...all, 95) - 3, hi = Math.max(...all, 105) + 3;
    const n = Math.max(1, history.length - 1);
    const x = i => padL + (i / n) * (W - padL - padR);
    const y = v => padT + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - padT - padB);

    const eqY = y(PARITY);
    const paths = series.map(s => {
        const d = history.map((h, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(h[s.key]).toFixed(1)}`).join(' ');
        const last = history[history.length - 1];
        return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="${x(history.length - 1).toFixed(1)}" cy="${y(last[s.key]).toFixed(1)}" r="2.6" fill="${s.color}"/>`;
    }).join('');

    return `<div class="sg-chart">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="黄金存量、货币供给、物价水平三条曲线的时序推演">
            <line x1="${padL}" y1="${eqY.toFixed(1)}" x2="${W - padR}" y2="${eqY.toFixed(1)}"
                  stroke="var(--ink-mute)" stroke-width="1" stroke-dasharray="2 4" opacity=".55"/>
            ${paths}
        </svg>
        <div class="sg-legend">
            ${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}
            <span style="margin-left:auto">虚线＝均衡 100 · 注意三者的<b style="color:var(--brass)">相位差</b>：黄金先动、货币跟进、物价最滞后</span>
        </div>
    </div>`;
}

function sgFxBand(game) {
    // 把 [PARITY-2*GOLD_POINT, PARITY+2*GOLD_POINT] 映射到 0-100%，输送点带落在中间一半
    const lo = PARITY - GOLD_POINT * 2, hi = PARITY + GOLD_POINT * 2;
    const pos = v => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    const bandL = pos(PARITY - GOLD_POINT), bandR = pos(PARITY + GOLD_POINT);
    return `<div class="sg-var sg-fx">
        <div class="sg-top">
            <span class="sg-name">汇率<i>铸币平价 ± 运金成本＝黄金输送点</i></span>
            <span class="sg-num" style="color:#a855f7">${(Math.round(game.fx * 10) / 10).toFixed(1)}</span>
        </div>
        <div class="sg-fxband">
            <div class="band" style="left:${bandL}%;width:${bandR - bandL}%"></div>
            <div class="par" style="left:${pos(PARITY)}%"></div>
            <div class="dot ${game.fxPinned ? 'pinned' : ''}" style="left:${pos(game.fx)}%"></div>
        </div>
        <div class="sg-fxnote ${game.fxPinned ? 'pinned' : ''}">${game.fxPinned
            ? '⚠️ 汇率已抵输送点——继续偏离不划算，黄金开始实物外运。这就是金本位"固定汇率"的物理机制。'
            : '汇率被锁在输送点窄带内小幅震荡，不会大幅偏离铸币平价。'}</div>
    </div>`;
}

function showSpecieFlowGame({ mode = 'sandbox', role, nationName, onFinish } = {}) {
    const game = createSpecieFlowGame({ role, maxRounds: 10, nationName });
    const isCrisis = mode === 'crisis';

    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    document.getElementById('stage').appendChild(wrap);

    const draw = () => {
        const h = game.history;
        const cur = h[h.length - 1];
        const prev = h.length > 1 ? h[h.length - 2] : null;
        const done = game.status !== 'PLAYING';

        const intro = game.role === 'deficit'
            ? `<b>${nationName}</b> 出现国际收支逆差，黄金正按平价外运。休谟的价格—铸币流动机制理论上会自动把你拉回均衡——
               <b>逆差→黄金外流→货币紧缩→物价下跌→出口变便宜→转顺差→黄金回流</b>。
               问题在于：让物价跌下去正是让失业涨上来。你手里没有对冲黄金外流的工具，只能决定<b>怎么熬</b>。`
            : `全球黄金的定价与清算集中在伦敦，<b>${nationName}</b> 是这套体系的中心——净黄金正随结算流入。
               按机制你的货币供给应当随之扩张、物价上涨，直到出口变贵、顺差消失，这是闭环的另一半。
               但你有一个外围国永远没有的按钮：<b>冲销</b>。用它就能拒绝通胀、人为截断自己这半个环，
               代价则留在贸易对手那一头。<b>注意观察"外围民怨"那根条</b>——那才是这一局真正的计分板。`;

        const bars = [
            sgBar({ name: '黄金存量', hint: '最先反应', value: game.gold, prev: prev && prev.gold, color: '#d97706' }),
            sgBar({ name: '货币供给', hint: '滞后跟进', value: game.money, prev: prev && prev.money, color: '#6366f1' }),
            sgBar({ name: '物价水平', hint: '粘性最强', value: game.prices, prev: prev && prev.prices, color: '#16a34a' }),
            sgBar({ name: game.role === 'deficit' ? '民怨（通缩失业）' : '本国民怨', hint: '≥100 崩溃', value: game.unrest, prev: prev && prev.unrest, color: 'oklch(72% 0.14 30)', max100: true })
        ];
        if (game.role === 'surplus') {
            bars.push(sgBar({ name: '外围民怨', hint: '你转嫁出去的代价', value: game.peripheryUnrest, prev: prev && prev.peripheryUnrest, color: 'oklch(60% 0.16 15)', max100: true }));
        }

        const tb = game.tradeBalance;
        const tbTxt = `<div style="font-size:.74rem;color:var(--ink-mute);margin:-4px 0 12px">
            贸易差额 <b style="font-family:var(--mono);color:${tb >= 0 ? 'var(--verdant)' : 'oklch(72% 0.14 30)'}">${tb >= 0 ? '+' : ''}${Math.round(tb * 10) / 10}</b>
            ${tb >= 0 ? '（顺差·黄金流入）' : '（逆差·黄金流出）'}　·　物价每低于均衡 1 点，竞争力改善约 0.42</div>`;

        let tail;
        if (done) {
            const d = specieDebrief(game);
            const rewardTxt = isCrisis ? `<div class="sg-reward">${describeSpecieReward(game)}</div>` : '';
            tail = `<div class="sg-debrief"><h3>${d.title}</h3><p>${d.body}</p></div>${rewardTxt}
                <div class="sg-acts" style="margin-top:12px">
                    <button data-close="1"><div class="t">${isCrisis ? '接受结果，回到账本' : '关闭推演'}</div><div class="d">${isCrisis ? '本次推演的结果将写入本局' : '不影响当前对局'}</div></button>
                    ${isCrisis ? '' : '<button data-replay="1"><div class="t">↻ 再推演一次</div><div class="d">换个策略试试，或切换攻守两方体会不对称</div></button>'}
                </div>`;
        } else {
            tail = `<div class="sg-acts">${specieActions(game.role).map(a =>
                `<button data-act="${a.id}"><div class="t">${a.label}</div><div class="d">${a.detail}</div></button>`
            ).join('')}</div>`;
        }

        const logHtml = game.log.length
            ? `<div class="sg-log">${game.log.slice(-4).map(l => `<div>${l}</div>`).join('')}</div>` : '';

        wrap.innerHTML = `<div class="specie event frame">
            <div class="head">
                <div class="sg-round">回合 ${game.round} / ${game.maxRounds}</div>
                <div class="tag ${done ? (game.status === 'WON' ? 'win' : 'lose') : ''}">${isCrisis ? '国际收支危局' : '金本位推演'}</div>
                <h2>${game.role === 'deficit' ? '黄金正在外流' : '黄金正在流入'}</h2>
            </div>
            <div class="body">
                <div class="sg-intro">${intro}</div>
                ${sgChart(h)}
                <div class="sg-vars">${bars.join('')}${sgFxBand(game)}</div>
                ${tbTxt}
                ${tail}
                ${logHtml}
            </div>
        </div>`;

        wrap.querySelectorAll('[data-act]').forEach(b => {
            b.onclick = () => { specieStep(game, b.dataset.act); draw(); };
        });
        const closeBtn = wrap.querySelector('[data-close]');
        if (closeBtn) closeBtn.onclick = () => {
            wrap.remove();
            if (onFinish) onFinish(game);
        };
        const replayBtn = wrap.querySelector('[data-replay]');
        if (replayBtn) replayBtn.onclick = () => {
            wrap.remove();
            showSpecieFlowGame({ mode, role: role === 'deficit' ? 'surplus' : 'deficit', nationName, onFinish });
        };
    };

    draw();
}

/* 危机模式的结算说明（实际写入在 onFinish 回调里） */
function describeSpecieReward(game) {
    if (game.status === 'WON' && game.role === 'deficit') {
        return '📈 <b>结算：</b>闭环走通，国际收支恢复平衡——国库 <b style="color:var(--verdant)">+600</b>，潮汐脆弱度 <b style="color:var(--verdant)">−25</b>；但通缩留下了伤痕，工人激进度 <b>+8</b>。';
    }
    if (game.status === 'WON' && game.role === 'surplus') {
        return game.outcome === 'sterilized'
            ? '📈 <b>结算：</b>冲销保住了国内稳定——国库 <b style="color:var(--verdant)">+500</b>，工人激进度 <b style="color:var(--verdant)">−5</b>。代价记在别人账上：外围三国潮汐脆弱度 <b>+12</b>。'
            : '📈 <b>结算：</b>你分担了调整成本——国库 <b>−300</b>，但外围三国潮汐脆弱度 <b style="color:var(--verdant)">−15</b>，体系更稳。';
    }
    if (game.outcome === 'broke_peg') {
        return '📉 <b>结算：</b>脱离金本位——工人激进度 <b style="color:var(--verdant)">−10</b>（通缩立止），但国库 <b>−800</b>、潮汐脆弱度 <b>+20</b>（信用受损，融资更贵）。';
    }
    return '📉 <b>结算：</b>调整失败——国库 <b>−700</b>，工人激进度 <b>+18</b>，潮汐脆弱度 <b>+15</b>。';
}

/* ---------------- 外汇储备四问（1994–2022 顺差外围） ----------------
 * 图鉴练习模式。四问战役把速查卡上的词条、口诀、易混、数字锚点嵌进机制，
 * 词条卡必须点过才能继续——保证"在游戏过程中掌握"，而不是打完再背。 */

function rsvBar({ name, hint, value, color, max = 130 }) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return `<div class="sg-var">
        <div class="sg-top">
            <span class="sg-name">${name}${hint ? `<i>${hint}</i>` : ''}</span>
            <span class="sg-num" style="color:${color}">${Math.round(value * 10) / 10}</span>
        </div>
        <div class="sg-track"><i style="width:${pct}%;background:${color}"></i></div>
    </div>`;
}

function rsvChain(g) {
    const on = g.surrenderOn;
    const steps = [
        ['企业外汇', true],
        ['强制结售汇', on],
        ['央行购汇', on],
        ['外汇占款', true],
        ['外储 / 基础货币', true],
        ['美债', g.ustShare > 60]
    ];
    return `<div class="rsv-chain">${steps.map(([t, live], i) =>
        `${i ? '<span class="arr">→</span>' : ''}<span class="st ${live ? 'on' : 'off'}">${t}</span>`
    ).join('')}</div>`;
}

function rsvLocks(g) {
    const inst = g.surrenderOn;
    const items = [
        { on: inst, t: '制度锁定', d: inst ? '强制结汇仍在转' : '2012 门已开，钱在跑' },
        { on: true, t: '利益锁定', d: '出口 · 银行 · 地方' },
        { on: g.ustShare > 62, t: '外部锁定', d: '美元无处可去' }
    ];
    return `<div class="rsv-locks">${items.map(x =>
        `<div class="lk ${x.on ? 'shut' : 'open'}"><b>${x.on ? '锁' : '开'}</b><span>${x.t}</span><i>${x.d}</i></div>`
    ).join('')}</div>`;
}

function rsvProgress(g) {
    return `<div class="rsv-progress">${ACTS.map(a => {
        const done = g.act > a.id || (g.act === a.id && (g.phase === 'MNEMONIC' || g.phase === 'DONE' || g.status === 'DONE'));
        const cur = g.act === a.id && g.status === 'PLAYING' && g.phase !== 'MNEMONIC';
        return `<div class="pip ${done ? 'done' : ''} ${cur ? 'cur' : ''}"><em>${a.q}</em>${a.title}</div>`;
    }).join('')}</div>`;
}

function showReservesGame() {
    const game = createReservesGame();
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    document.getElementById('stage').appendChild(wrap);

    const draw = () => {
        const act = rsvAct(game);
        const cov = rsvCoverage(game);
        const h = rsvHud(game);
        const done = game.status === 'DONE';

        const bars = [
            rsvBar({ name: '经常账户', hint: `卖东西赚的 · 约占流入 ${h.caShare}%`, value: game.ca, color: '#0F6E56', max: 14 }),
            rsvBar({ name: '资本账户', hint: '借来 / FDI 10–15%', value: game.ka, color: '#185FA5', max: 14 }),
            rsvBar({ name: '外汇储备', hint: `≈ ${h.reservesUsd} 万亿美元`, value: game.reserves, color: '#d97706' }),
            rsvBar({ name: '外汇占款', hint: `≈ ${h.fxPurchaseCny} 万亿人民币`, value: game.fxPurchase, color: '#6366f1' }),
            rsvBar({ name: '基础货币', hint: '占款一度占投放 80%+', value: game.baseMoney, color: '#a855f7' }),
            rsvBar({ name: 'U 型自主性', hint: '过多绑架 · 过少放逐', value: game.autonomy, color: '#854F0B', max: 100 })
        ];

        const costHtml = game.act >= 3 || done ? `<div class="rsv-costs">${COST_KEYS.map(c => {
            const v = game.costs[c.id] || 0;
            return `<div class="cg"><span>${c.term}<i>${c.hint}</i></span>
                <div class="sg-track"><i style="width:${Math.min(100, v)}%;background:#993C1D"></i></div></div>`;
        }).join('')}</div>` : '';

        const ledgerHtml = game.act >= 4 || done ? `<div class="rsv-ledger">
            <div class="col lose"><div class="h">被剥夺</div>${CLASS_KEYS.filter(c => c.side === 'lose').map(c =>
                `<div class="row"><span>${c.term}</span><b>${Math.round(game.classes[c.id] ?? 0)}</b></div>`
            ).join('')}</div>
            <div class="col win"><div class="h">被补贴</div>${CLASS_KEYS.filter(c => c.side === 'win').map(c =>
                `<div class="row"><span>${c.term}</span><b>${Math.round(game.classes[c.id] ?? 0)}</b></div>`
            ).join('')}</div>
        </div>` : '';

        const fourHtml = game.act >= 2 || done ? `<div class="rsv-four">${SEIGNIORAGE_FOUR.map(s =>
            `<div class="mini"><b>${s.title}</b><p>${s.body}</p></div>`
        ).join('')}</div>` : '';

        let tail;
        if (done) {
            const d = rsvDebrief(game);
            tail = `<div class="sg-debrief">
                <h3>${d.title}</h3>
                <p>${d.ending} 抓住「美元霸权 → 双顺差 → 强制结汇 → 被动囤储 → 买美债 → 负利差输血 → 三重锁定」这条链，七题可一气呵成。</p>
                <div class="rsv-mn">${Object.entries(d.mnemonics).map(([q, t]) =>
                    `<div><em>${q}</em>${t}</div>`).join('')}</div>
                <div class="rsv-traps">${d.traps.map(t => `<div><b>${t.title}</b> ${t.body}</div>`).join('')}</div>
                <div class="note" style="margin-top:10px"><b>数字锚点</b><p>${d.numbers.join(' · ')}</p></div>
            </div>
            <div class="sg-acts" style="margin-top:12px">
                <button data-close="1"><div class="t">关闭推演</div><div class="d">不影响 1836 对局</div></button>
                <button data-replay="1"><div class="t">↻ 再走一遍四问</div><div class="d">换条路：取消结汇、去美国化、或撞上抛售</div></button>
            </div>`;
        } else if (game.phase === 'GLOSSARY' && game.glossary[0]) {
            const id = game.glossary[0];
            const k = KNOWLEDGE[id];
            tail = `<div class="rsv-card">
                <div class="k">词条 · 必须记下才能继续</div>
                <h3>${k.term}</h3>
                <p>${k.card}</p>
                <button data-dismiss="1">记下了（${game.glossary.length}）</button>
            </div>`;
        } else if (game.phase === 'MNEMONIC') {
            const extras = (act.extraMnemonics || []).map(q => {
                const map = { Q1: '外汇占款（投本币）· 铸币税（四好之一）· 强制结售汇（收外汇）', Q3: '安全流动、回流撑出口、别无选择、稳汇率', Q5: '一象征、两面性、一出路' };
                return `<div class="ex"><em>${q}</em>${map[q] || ''}</div>`;
            }).join('');
            tail = `<div class="rsv-mnemo">
                <div class="k">${act.q} 口诀 · 本问带走</div>
                <div class="m">${act.mnemonic}</div>
                ${extras}
            </div>
            <div class="sg-acts">${rsvActions(game).map(a =>
                `<button data-act="${a.id}"><div class="t">${a.label}</div><div class="d">${a.detail}</div></button>`
            ).join('')}</div>`;
        } else {
            tail = `<div class="sg-acts">${rsvActions(game).map(a =>
                `<button data-act="${a.id}" class="${a.trap ? 'trap' : ''}"><div class="t">${a.label}</div><div class="d">${a.detail}</div></button>`
            ).join('')}</div>`;
        }

        const logHtml = game.log.length
            ? `<div class="sg-log">${game.log.slice(-5).map(l => `<div>${l}</div>`).join('')}</div>` : '';

        const title = done ? '四问走完' : (game.phase === 'EVENT' ? '人质考验' : act.question);
        const tag = done ? '掌握 ' + cov.n + '/' + cov.total : (game.phase === 'EVENT' ? '2022 冻结' : `第 ${game.act} 问 · ${act.title}`);
        const intro = `<div class="sg-intro">${done ? '金本位局里顺差等于中心；这一局里中国是顺差国，却仍是外围。' : act.intro}</div>`;
        const hudBlock = `${rsvChain(game)}
                ${game.act >= 2 || done ? rsvLocks(game) : ''}
                <div class="sg-vars">${bars.join('')}</div>
                ${costHtml}
                ${fourHtml}
                ${ledgerHtml}`;
        wrap.innerHTML = `<div class="specie rsv event frame">
            <div class="head">
                <div class="sg-round">${game.year} · 掌握 ${cov.n}/${KNOWLEDGE_TOTAL}</div>
                <div class="tag ${done ? 'win' : ''}">${tag}</div>
                <h2>${title}</h2>
            </div>
            <div class="body">
                ${rsvProgress(game)}
                ${intro}${tail}${hudBlock}
                ${logHtml}
            </div>
        </div>`;

        wrap.querySelector('.specie')?.scrollTo(0, 0);
        wrap.querySelectorAll('[data-act]').forEach(b => {
            b.onclick = () => { rsvStep(game, b.dataset.act); draw(); };
        });
        const dismissBtn = wrap.querySelector('[data-dismiss]');
        if (dismissBtn) dismissBtn.onclick = () => { rsvDismiss(game); draw(); };
        const closeBtn = wrap.querySelector('[data-close]');
        if (closeBtn) closeBtn.onclick = () => wrap.remove();
        const replayBtn = wrap.querySelector('[data-replay]');
        if (replayBtn) replayBtn.onclick = () => { wrap.remove(); showReservesGame(); };
    };

    draw();
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
    const modBadges = mods.map(m => {
        const def = MODIFIER_TYPES[m.type];
        if (!def) return '';
        return `<span class="mod-badge" title="${def.desc}">${def.label} <i>×${m.turnsLeft}</i></span>`;
    }).join('');

    // v3.6 英镑潮汐阶段徽章：宽松/紧缩全局可见；非英国国查看自身脆弱度
    const tide = gameState.tide;
    let tideBadge = '';
    if (tide) {
        if (tide.phase === 'EASY') {
            tideBadge = `<span class="mod-badge" title="伦敦资本外溢中，非英国国投资池获注入但脆弱度持续累积">🌊 潮汐·宽松期 <i>${tide.turnsInPhase}/${tide.phaseLength}</i></span>`;
        } else {
            tideBadge = `<span class="mod-badge" title="英格兰银行加息捍卫黄金，正在收割外围">🌊 潮汐·收紧中</span>`;
        }
        if (code !== 'GBR') {
            const frag = Math.round(n.tideFragility || 0);
            tideBadge += `<span class="mod-badge" title="金汇兑本位下随宽松期累积，紧缩期按此比例冲击投资池与国库">⚖️ 脆弱度 <i>${frag}</i></span>`;
        }
    }

    document.getElementById('hud-modifiers').innerHTML = tideBadge + modBadges;
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
            </div>
            ${code !== 'GBR' ? `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:.8rem;">
                <span>💷 货币本位：<b>${n.goldExchangeStandard ? '金汇兑本位（挂钩英镑）' : '金块本位（独立黄金储备）'}</b></span>
                <button data-goldstd="1">${n.goldExchangeStandard ? '改行金块本位' : '重挂英镑'}</button>
            </div>
            <div class="note" style="margin-top:6px"><b>潮汐脆弱度</b><p>当前 ${Math.round(n.tideFragility || 0)}/100——金汇兑本位下随英镑潮汐宽松期持续累积，紧缩期按此比例冲击投资池与国库；金块本位可免疫但已付一次性黄金储备代价。</p></div>` : ''}` : `<div class="note" style="margin-top:16px"><b>AI 治理</b><p>${n.name} 的经济政策由 AI 脚本治理，切换为本国开局后方可操作。</p></div>`;
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

    return `<div class="sec-label">🎲 互动推演</div>
        <div class="cards one-col">
            <div class="card"><h3>⚖️ 金本位自动调节机制</h3>
            <p>休谟价格—铸币流动机制（Price-Specie-Flow Mechanism, 1752）的十回合推演：
            <b style="color:var(--brass)">逆差 → 黄金外流 → 货币紧缩 → 物价下跌 → 出口变便宜 → 转顺差 → 黄金回流</b>。
            亲手操作一遍就会发现，让物价跌下去正是让失业涨上来——"自动恢复均衡"的代价究竟由谁承担，是这套机制真正的政治内核。</p>
            <div class="row" style="margin-top:8px">
                <button data-specie="deficit">▶ 扮演逆差国（外围）</button>
                <button data-specie="surplus">▶ 扮演顺差国（中心）</button>
            </div>
            <div class="note" style="margin-top:8px"><b>建议两边各玩一次</b><p>中心国有"冲销黄金流入"按钮，外围国没有——两局打完，"规则对等、执行能力不对等"就不再是一句需要背的话。此处为练习模式，不影响当前对局。</p></div>
            </div>
            <div class="card"><h3>🧧 外汇储备四问 · 顺差外围</h3>
            <p>同一套霸权货币逻辑在 1994–2022 的重演。你是中国货币当局：强制结汇自动把双顺差变成外储、再变成美债。
            四问 <b style="color:var(--brass)">含义 → 成因 → 代价 → 分摊</b> 走完，七题口诀、六条易混、八个数字锚点都嵌在机制里——不是打完再背，是走一遍就会。
            金本位那局里顺差等于中心；这一局中国是<b>顺差国，却仍是外围</b>。</p>
            <div class="row" style="margin-top:8px">
                <button data-reserves="1">▶ 开始四问战役</button>
            </div>
            <div class="note" style="margin-top:8px"><b>练习模式</b><p>不影响当前 1836 对局。词条必须点过才能进下一问；走偏的选项（出口＝双顺差、花光储备换自主、美债绝对安全）都有机械代价。</p></div>
            </div>
        </div>
        <div class="sec-label" style="margin-top:16px">📜 各国速胜手册</div>
        <div class="cards one-col">${Object.entries(STRATEGY_PLAYBOOK).map(([code, p]) => `
            <div class="card"><h3>${p.flag} ${p.name} <span style="font-size:.72rem;color:var(--ink-mute);font-weight:400">· ${p.difficulty}</span></h3>
            <p><b style="color:var(--verdant)">胜利：</b>${p.win}<br>
            <b style="color:oklch(72% 0.14 30)">失败：</b>${p.lose}</p>
            <div class="note" style="margin-top:8px"><b>核心打法</b><p>${p.core}</p></div>
            <div class="note" style="margin-top:6px"><b>关键回合</b><p>${p.timeline}</p></div></div>`).join('')}</div>
        <div class="sec-label" style="margin-top:16px">范式</div>
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
        const goldBtn = body.querySelector('[data-goldstd]');
        if (goldBtn) {
            goldBtn.onclick = () => {
                const n = gameState.nations[code];
                if (n.goldExchangeStandard) {
                    n.goldExchangeStandard = false;
                    n.treasury = (n.treasury || 0) - 800;
                    n.tideFragility = Math.max(0, (n.tideFragility || 0) - 40);
                    gameState.logs.unshift(`${gameState.year} · 💰 ${n.name}改行金块本位：自建独立黄金储备，国库 −800，此后免疫英镑潮汐脆弱度累积。`);
                } else {
                    n.goldExchangeStandard = true;
                    gameState.logs.unshift(`${gameState.year} · 💷 ${n.name}重新挂钩英镑（金汇兑本位）：融资成本降低，但重新暴露于潮汐收割风险。`);
                }
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
    if (id === 'codex') {
        body.querySelectorAll('[data-specie]').forEach(b => {
            b.onclick = () => showSpecieFlowGame({
                mode: 'sandbox',
                role: b.dataset.specie,
                nationName: b.dataset.specie === 'surplus' ? '中心国' : '外围国'
            });
        });
        body.querySelectorAll('[data-reserves]').forEach(b => {
            b.onclick = () => showReservesGame();
        });
    }
}
