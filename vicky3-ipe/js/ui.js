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
        body: '维也纳股市崩盘引发全球长萧条，英国出口骤降、失业攀升，财政部辩论救市方向。',
        opts: [
            { t: '央行注资 + 铁路拉动', d: '国库 −1500，6 回合投资池持续注入', log: '反周期刺激：央行注资并启动铁路繁荣对冲萧条。', modifier: 'railway_boom' },
            { t: '等市场自发出清', d: '国库无损，投资池 −400', log: '放任出清：市场调节，投资池萎缩。', fx: n => { n.investmentPool = Math.max(0, (n.investmentPool || 0) - 400); } }
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
        body: '统一后的德国爆发创办公司狂热，股市泡沫破裂导致大批银行倒闭，财政部面临救市抉择。',
        opts: [
            { t: '国家救助银行', d: '国库 −1500，投资池 +600', log: '救助金融体系：稳定市场，国库大幅承压。', fx: n => { n.treasury = (n.treasury || 0) - 1500; n.investmentPool = (n.investmentPool || 0) + 600; } },
            { t: '任其出清', d: '国库无损，投资池 −500', log: '放任出清：市场重整，投资池萎缩。', fx: n => { n.investmentPool = Math.max(0, (n.investmentPool || 0) - 500); } }
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
    }
];

/* v3.6 条件触发：事件可选带 nation（字符串或数组，缺省=通用全国家可见）
 * 与 minYear/maxYear（整数年份门，缺省=不限）。先按条件筛，再在合格子集内去重随机。 */
function eventApplies(e) {
    const code = gameState.playerNationKey, yr = gameState.year;
    if (e.nation) {
        const ns = Array.isArray(e.nation) ? e.nation : [e.nation];
        if (!ns.includes(code)) return false;
    }
    if (e.minYear && yr < e.minYear) return false;
    if (e.maxYear && yr > e.maxYear) return false;
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
    if (!s.advisoryFlags) s.advisoryFlags = {};
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
        const ev = pickRandomEvent();
        if (ev) eventQueue.push(ev);
    }

    saveState();

    // 财政预警与接近胜利提示（每条仅触发一次，标志位存于 state 避免刷屏）
    emitAdvisories(now, nowStats);

    render();
    if (gameState.gameStatus !== 'PLAYING') showEndgame();
    else showNextEvent();
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
    const code = gameState.playerNationKey;
    const n = gameState.nations[code];
    const won = gameState.gameStatus === 'WON';
    const diag = won ? diagnoseWin(gameState, code) : diagnoseLoss(gameState, code);
    showModal({
        tag: won ? '战略胜利' : '国家危机', tagClass: won ? 'win' : 'lose',
        title: won ? '🏆 达成历史战略目标' : '⚠️ 触及失败防线',
        body: `<p>${won ? `胜利条件：${n.winCondition.desc}` : `失败条件：${n.loseCondition.desc}`}</p>
               <p style="margin-top:10px;padding-top:10px;border-top:1px solid oklch(72% 0.11 75 / .25)"><b style="color:var(--brass)">${won ? '📊 制胜路径' : '🔬 失败诊断'}</b><br>${diag}</p>`,
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

    return `<div class="sec-label">📜 各国速胜手册</div>
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
