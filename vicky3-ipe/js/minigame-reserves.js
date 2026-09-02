/**
 * 《帝国的账本：核心与边缘》 v3.8
 * 小游戏：外汇储备四问（1994–2022 美元本位下的顺差外围）
 *
 * 学理来源：翟东升《货币与金融的国际政治经济学》· 第 ③ 层「中国处境」· 外汇储备专题
 *   七题一条链：含义(Q2) → 成因(Q7) → 代价(Q4) → 分摊(Q6)；Q1 名词、Q3 美债、Q5 中美收尾。
 *   撕开点：外储不是攒下的钱，是向美元体系交的贡。中国是顺差国，却仍是外围——
 *          与金本位小游戏「逆差=外围 / 顺差=中心」形成对照。
 *
 * 本模块是纯逻辑状态机（无 DOM），供 ui.js 渲染，也可在 Node 下直接跑覆盖性测试。
 * 一次完整通关（任意合法操作序列）必须掌握 KNOWLEDGE 中的全部词条。
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }

/* ------------------------------------------------------------------ */
/* 知识点目录：与《外汇储备-关键词速查卡》一一对应                      */
/* ------------------------------------------------------------------ */

export const KNOWLEDGE = {
    fx_reserves: {
        id: 'fx_reserves', layer: 1, q: [1, 2],
        term: '外汇储备',
        card: '央行持有的可自由兑换外币资产。主流叙事讲"实力象征"，翟东升翻转定性为<span class="hl">财富转移的历史记录</span>——不是攒下的钱，是向美元体系交的贡。'
    },
    fx_purchase: {
        id: 'fx_purchase', layer: 1, q: [1, 6],
        term: '外汇占款',
        card: '央行收购外汇资产而相应投放的本国货币。唯二考过 2 次的名词之一。2003–2014 从 3 万亿 → 27 万亿，一度占基础货币投放 80% 以上。'
    },
    surrender: {
        id: 'surrender', layer: 1, q: [1, 2, 7],
        term: '强制结售汇',
        card: '1994 年汇率并轨后，企业外汇须卖给指定银行、需用时再买，央行是"最终买家"。它是"三外路线"中"控制外汇"的核心工具，使外储积累成为行政命令下的被动行为。2012 年后逐步改革。'
    },
    twin_surplus: {
        id: 'twin_surplus', layer: 2, q: [2, 7],
        term: '双顺差',
        card: '经常账户顺差 + 资本账户顺差<b>同向叠加</b>。正常国家应一顺一逆对冲。切忌简化成"出口厉害"——那是两个不同账户。'
    },
    ca_ka: {
        id: 'ca_ka', layer: 2, q: [2, 7],
        term: '经常 / 资本账户',
        card: '经常账户顺差是"卖东西赚的钱"，资本账户顺差是"借来/引进的钱"。约 70% 峰值外储来自经常账户，但两差同向才是问题。'
    },
    chain: {
        id: 'chain', layer: 2, q: [2, 7],
        term: '结汇链条',
        card: '企业结汇 → 央行购汇（投放人民币）→ 外汇占款形成外储。这是行政制度的自动运转，不是市场结果。'
    },
    base_money: {
        id: 'base_money', layer: 2, q: [1, 6],
        term: '基础货币投放',
        card: '外汇占款一度占基础货币投放 80% 以上——央行"被迫开动印钞机"。后面的冲销，就是来回收这轮被动投放。'
    },
    sterilize: {
        id: 'sterilize', layer: 2, q: [4],
        term: '冲销',
        card: '央行回收外汇占款投放的过剩流动性：提高存准、发行央票、财政存款沉淀。<b>与金融抑制对利率作用方向相反</b>，两者不可混淆。'
    },
    repression: {
        id: 'repression', layer: 2, q: [6],
        term: '金融抑制',
        card: '行政压低存款利率，制造巨大存贷利差。是"剥夺储蓄者"的直接工具，国有银行凭此坐收制度租金。'
    },
    dollar_hegemony: {
        id: 'dollar_hegemony', layer: 3, q: [2, 5, 7],
        term: '美元霸权',
        card: '美元本位下美国是发行储备货币的中心国。外围国积累美元＝向中心国输送信用。这是全套代价的总根源。'
    },
    seigniorage: {
        id: 'seigniorage', layer: 3, q: [1, 6],
        term: '铸币税',
        card: '⚠️ 高频踩坑：铸币税只是美元霸权<b>四项好处之一</b>（另三项：调控全球波动并转嫁损失、金融制裁杠杆、使美国国力难被超越），并非最核心一项。狭义约千亿、广义三千多亿美元，低于美国军费；真正可观的是经财政乘数放大后相当于美国近 20% GDP。'
    },
    core_periphery: {
        id: 'core_periphery', layer: 3, q: [2, 5, 7],
        term: '中心—外围',
        card: '理解"储备越多 ≠ 越强大"的钥匙。中国是顺差国，却仍是外围——这与金本位小游戏里"顺差=中心"正好相反。'
    },
    u_curve: {
        id: 'u_curve', layer: 3, q: [5],
        term: 'U 型自主性',
        card: '储备规模与自主性是正 U 型：过多＝绑架式依附，过少＝放逐式脆弱（泰国、阿根廷）。两端都不自主。真正自主（本币国际化）不在此曲线上，是更高维度。'
    },
    alliance: {
        id: 'alliance', layer: 3, q: [7],
        term: '政治联盟',
        card: '出口资本 + 国有银行 + 地方政府组成利益联盟，把低估汇率与结汇制度锁死。改革的阻力不在技术，而在这组受益者。'
    },
    triple_lock: {
        id: 'triple_lock', layer: 3, q: [6, 7],
        term: '三重锁定',
        card: '制度锁定（强制结汇）＋ 利益锁定（出口资本＋银行＋地方）＋ 外部锁定（美元霸权下外储无处可去）。改革突破口不在汇率本身，而在打破三重锁定。'
    },
    opp_cost: {
        id: 'opp_cost', layer: 4, q: [4],
        term: '机会成本',
        card: '该赚没赚：外储收益 ~3% vs 国内实体回报 ~10%。数额最大、最隐性。7 个百分点利差即向美元体系缴纳的铸币税。'
    },
    accounting: {
        id: 'accounting', layer: 4, q: [4],
        term: '会计估值损失',
        card: '美元贬值 → 人民币计价的储备资产账面缩水。可量化，但小于机会成本。'
    },
    sterilize_cost: {
        id: 'sterilize_cost', layer: 4, q: [4],
        term: '冲销成本',
        card: '不得不花的对冲费用：央票利息 + 提准挤压银行盈利。显性，但小于机会成本。切忌把"机会成本"写成"冲销成本"。'
    },
    misalloc: {
        id: 'misalloc', layer: 4, q: [4],
        term: '资源错配',
        card: '实物净输出只换回债权；资源过度向出口部门倾斜，延缓结构调整、加剧资产泡沫与通胀。'
    },
    weaponize: {
        id: 'weaponize', layer: 4, q: [4, 5],
        term: '武器化 / 人质',
        card: '储备可能从资产变成人质（2022 年俄罗斯外储被冻结）。前四项是慢性失血，这一项是一次性致命。翟最强调的政治风险。'
    },
    ust: {
        id: 'ust', layer: 5, q: [3],
        term: '美债',
        card: '持有四因：安全流动性、回流撑出口、投资渠道有限（别无选择）、汇率稳定工具。四因首尾相衔形成自我强化的美元循环闭环。'
    },
    ust_four: {
        id: 'ust_four', layer: 5, q: [3],
        term: '持债四因',
        card: '口诀：<b>安全流动、回流撑出口、别无选择、稳汇率</b>。注意：安全 ≠ 绝对安全，不免疫武器化。'
    },
    terror: {
        id: 'terror', layer: 5, q: [3, 5],
        term: '金融恐怖平衡',
        card: '中国生产美国消费、中国储蓄美国借贷＝相互依赖的战略威慑。中国抛售美债 → 自身外储缩水；美国冻结中国外储 → 美元信用崩塌。任何一方激进破坏 = 双输。'
    },
    safety_not_absolute: {
        id: 'safety_not_absolute', layer: 5, q: [3, 4],
        term: '安全 ≠ 绝对安全',
        card: '"安全"仅指违约概率低、流动性好，不免疫武器化风险。2022 年俄罗斯外储被冻结是现成证据。'
    },
    rational_not_optimal: {
        id: 'rational_not_optimal', layer: 5, q: [3, 5],
        term: '理性 ≠ 最优',
        card: '大量持美债是给定约束下的理性（别无选择），但约束本身是结构性的。突破约束（人民币国际化）才是根本出路。'
    },
    deamericanize: {
        id: 'deamericanize', layer: 5, q: [5],
        term: '去美国化',
        card: '减持美债、增持黄金、推动人民币跨境结算、建 CIPS（独立于 SWIFT）。中美金融关系正从"共生平衡"转向"竞争脱钩"。'
    },
    cips_gold: {
        id: 'cips_gold', layer: 5, q: [5],
        term: 'CIPS · 黄金',
        card: 'CIPS 是独立于 SWIFT 的跨境清算渠道；增持黄金是把储备从"人质资产"里抽一部分出来。两者都慢，且会撞击恐怖平衡。'
    },
    savers: {
        id: 'savers', layer: 6, q: [6],
        term: '储蓄者',
        card: '存款利率被压低、实际利率长期为负，被"隐性通胀税"持续稀释。三受害者之一。'
    },
    workers: {
        id: 'workers', layer: 6, q: [6],
        term: '劳动者（双重剥夺）',
        card: '生产端被低估汇率压工资，储蓄端又遭负利率二次盘剥。三受害者之一。'
    },
    public: {
        id: 'public', layer: 6, q: [6],
        term: '全体国民',
        card: '外储回流买美债 ~3% 而国内回报 ~10%，7 个百分点利差即穷国补贴富国的逆向转移。'
    },
    usa_benefit: {
        id: 'usa_benefit', layer: 6, q: [6],
        term: '美国（最大受益者）',
        card: '中国外储压低美国长期利率，为其赤字与过度消费提供廉价融资。四受益者中最大的一个。'
    },
    exporters: {
        id: 'exporters', layer: 6, q: [6],
        term: '出口企业',
        card: '人民币低估 → 出口商品更便宜 → 隐性"汇率补贴"。利益锁定的第一块。'
    },
    banks: {
        id: 'banks', layer: 6, q: [6],
        term: '国有银行',
        card: '金融抑制制造巨大存贷利差，坐收"制度租金"。'
    },
    local_soe: {
        id: 'local_soe', layer: 6, q: [6],
        term: '地方政府 / 国企',
        card: '低利率下享受近乎免费的资本，信贷扩张推动 GDP 与政绩。'
    },
    peak_399: {
        id: 'peak_399', layer: 0, q: [2, 7],
        term: '2014.6 峰值 ~3.99 万亿美元',
        card: '≈ 当年 GDP 的 40%，绝对值全球第一。Q2 / Q7 收尾必甩。'
    },
    ca_70: {
        id: 'ca_70', layer: 0, q: [7],
        term: '约 70% 来自经常账户',
        card: '说明"两差"中经常账户是主力，不是资本账户。但不能因此把双顺差说成"出口厉害"。'
    },
    purchase_3_27: {
        id: 'purchase_3_27', layer: 0, q: [1, 6],
        term: '外汇占款 3 万亿 → 27 万亿',
        card: '2003–2014。一度占基础货币投放 80% 以上。Q1 / Q6 说明央行被迫开动印钞机。'
    },
    carry_7pt: {
        id: 'carry_7pt', layer: 0, q: [4, 6, 7],
        term: '利差 7pt',
        card: '美债 ~3% vs 国内 ~10%。7 个百分点＝铸币税。Q4 / Q6 / Q7 的核心算式。'
    },
    fdi_return: {
        id: 'fdi_return', layer: 0, q: [2],
        term: 'FDI 在华回报 10–15%',
        card: '负利差循环：高成本借入、低成本借出。资本账户顺差的微观含义。'
    },
    years_1994_2012: {
        id: 'years_1994_2012', layer: 0, q: [1, 6],
        term: '1994 并轨 · 2012 取消强制结汇',
        card: '制度起止。2012 年取消后并没有"解放"——一开门，钱就跑。'
    },
    flight_1tn: {
        id: 'flight_1tn', layer: 0, q: [2],
        term: '2014.6 → 2017.1 缩水约 1 万亿',
        card: '制度开了门，一开就跑，不得不又关上。Q2 追问落点。'
    },
    russia_2022: {
        id: 'russia_2022', layer: 0, q: [4, 5],
        term: '2022 年俄罗斯外储被冻结',
        card: '储备从资产变人质的现实证据。Q4 / Q5 必挂。'
    },
    q1_nouns: {
        id: 'q1_nouns', layer: 1, q: [1],
        term: 'Q1 名词',
        card: '外汇占款（投本币）· 铸币税（四好之一）· 强制结售汇（收外汇）。'
    },
    q5_formula: {
        id: 'q5_formula', layer: 5, q: [5],
        term: 'Q5 口诀',
        card: '<b>一象征、两面性、一出路</b>。储备是"人质"也是"权力"；出路是人民币国际化，而不是把储备花光。'
    },
    q6_formula: {
        id: 'q6_formula', layer: 6, q: [6],
        term: 'Q6 口诀',
        card: '<b>一前提两工具，三受害者（储·工·民）四受益者（美·出·银·地），根因三重锁</b>。'
    },
    tribute: {
        id: 'tribute', layer: 0, q: [2],
        term: '一句话总纲',
        card: '外储不是攒下的钱，是向美元体系交的贡。抓住"美元霸权 → 双顺差 → 强制结汇 → 被动囤储 → 买美债 → 负利差输血 → 三重锁定"这条链，七题可一气呵成。'
    }
};

export const KNOWLEDGE_IDS = Object.keys(KNOWLEDGE);
export const KNOWLEDGE_TOTAL = KNOWLEDGE_IDS.length;

export const SEIGNIORAGE_FOUR = [
    { id: 'sg_tax', title: '① 铸币税', body: '狭义约千亿、广义三千多亿美元，低于美国军费——绝对值并不惊人。' },
    { id: 'sg_cycle', title: '② 调控全球波动并转嫁损失', body: '中心加息/放水的潮汐，把危机输出到外围。' },
    { id: 'sg_sanction', title: '③ 金融制裁杠杆', body: '清算网络（今 SWIFT / 昔日伦敦金融城）可把一国排除在外。' },
    { id: 'sg_gap', title: '④ 使美国国力难被超越', body: '外围以低收益借出、再以高成本把资本请回来，差距被结构锁死。' }
];

export const MNEMONICS = {
    Q1: '外汇占款（投本币）· 铸币税（四好之一）· 强制结售汇（收外汇）',
    Q2: '双顺差赚汇，强制结汇收，央行被动囤，美债成归宿',
    Q7: '一体霸权套、两差送钱到、三环结汇交、四因联盟抱',
    Q3: '安全流动、回流撑出口、别无选择、稳汇率',
    Q4: '让了利、贬了值、付了息、换了纸、成人质',
    Q6: '一前提两工具，三受害者四受益者，根因三重锁',
    Q5: '一象征、两面性、一出路'
};

export const TRAPS = [
    { id: 'trap_export', title: '双顺差 ≠ 出口厉害', body: '经常账户是卖东西赚的，资本账户是借来/引进的。同向叠加才是问题。' },
    { id: 'trap_cost', title: '机会成本 ≠ 冲销成本', body: '机会成本是该赚没赚（隐性、更大）；冲销成本是不得不花的对冲费用（显性、更小）。' },
    { id: 'trap_seigniorage', title: '铸币税 ≠ 美元霸权的核心好处', body: '它只是四项之一。绝对值低于军费，乘数放大后才可观（≈ 美国 20% GDP）。' },
    { id: 'trap_safety', title: '安全资产 ≠ 绝对安全', body: '违约概率低、流动性好，不免疫武器化。' },
    { id: 'trap_rational', title: '理性选择 ≠ 最优选择', body: '给定约束下的理性，约束本身是结构性的。' },
    { id: 'trap_u', title: 'U 型曲线 ≠ 越少越自主', body: '过少是放逐式脆弱。真正自主不在这条曲线上。' }
];

export const COST_KEYS = [
    { id: 'opp', term: '机会成本', hint: '最大 · 隐性' },
    { id: 'accounting', term: '会计损失', hint: '账面缩水' },
    { id: 'sterilize', term: '冲销成本', hint: '显性 · 较小' },
    { id: 'misalloc', term: '资源错配', hint: '实物换债权' },
    { id: 'weapon', term: '武器化', hint: '人质风险' }
];

export const CLASS_KEYS = [
    { id: 'savers', side: 'lose', term: '储蓄者' },
    { id: 'workers', side: 'lose', term: '劳动者' },
    { id: 'public', side: 'lose', term: '全体国民' },
    { id: 'usa', side: 'win', term: '美国' },
    { id: 'exporters', side: 'win', term: '出口企业' },
    { id: 'banks', side: 'win', term: '国有银行' },
    { id: 'local', side: 'win', term: '地方 / 国企' }
];

/* ------------------------------------------------------------------ */
/* 四问战役                                                            */
/* ------------------------------------------------------------------ */

export const ACTS = [
    {
        id: 1, year: 1994, endYear: 2003, rounds: 2,
        title: '是什么', q: 'Q2',
        question: '外汇储备的政治含义是什么？',
        mnemonic: MNEMONICS.Q2,
        extraMnemonics: ['Q1'],
        intro: '1994 年汇率并轨，强制结售汇开动。企业每赚一笔美元，都要卖给银行，央行做最终买家。你现在看到的不是"攒钱"，是一条<b>行政自动机</b>：经常账户与资本账户同时顺差，美元被集中到国家手里，再变成美债。',
        headline: ['fx_reserves', 'surrender', 'twin_surplus'],
        unlock: [
            'fx_reserves', 'fx_purchase', 'surrender', 'twin_surplus', 'ca_ka',
            'chain', 'base_money', 'years_1994_2012', 'tribute', 'ca_70',
            'fdi_return', 'ust', 'q1_nouns'
        ],
        actions: ['observe_chain', 'boost_export', 'proclaim_strength']
    },
    {
        id: 2, year: 2003, endYear: 2008, rounds: 2,
        title: '怎么来的', q: 'Q7',
        question: '这么多储备是怎么堆出来的？为什么停不下来？',
        mnemonic: MNEMONICS.Q7,
        extraMnemonics: [],
        intro: '机器已经在转。你想关掉它——升值、停买美债、把储备花光换自主——会撞上<b>三重锁定</b>。美元霸权是总根源；铸币税只是中心国四项好处之一，不是你可以征收的税。',
        headline: ['triple_lock', 'seigniorage', 'u_curve'],
        unlock: [
            'dollar_hegemony', 'seigniorage', 'core_periphery',
            'u_curve', 'alliance', 'triple_lock', 'ust_four', 'rational_not_optimal',
            'purchase_3_27'
        ],
        actions: ['try_revalue', 'try_diversify', 'drain_autonomy']
    },
    {
        id: 3, year: 2008, endYear: 2014, rounds: 2,
        title: '什么代价', q: 'Q4',
        question: '持有这些储备，究竟付了什么？',
        mnemonic: MNEMONICS.Q4,
        extraMnemonics: ['Q3'],
        intro: '储备冲向 2014 年峰值。五项成本同时填表：口诀 <b>让了利、贬了值、付了息、换了纸、成人质</b>。冲销能压住占款，压不住机会成本；金融抑制能帮银行赚钱，但和冲销对利率的作用方向相反。美债继续买——四因把你锁在闭环里。',
        headline: ['opp_cost', 'sterilize', 'repression'],
        unlock: [
            'sterilize', 'repression', 'opp_cost', 'accounting', 'sterilize_cost',
            'misalloc', 'weaponize', 'carry_7pt', 'peak_399', 'safety_not_absolute'
        ],
        actions: ['do_sterilize', 'do_repress', 'recycle_ust']
    },
    {
        id: 4, year: 2012, endYear: 2022, rounds: 2,
        title: '落在谁头上', q: 'Q6',
        question: '代价由谁承担？中美之间还是不是恐怖平衡？',
        mnemonic: MNEMONICS.Q6,
        extraMnemonics: ['Q5'],
        intro: '账本翻到国内：三受害者、四受益者。2012 年你可以打开强制结汇的门——但门一开，钱会跑。去美国化（黄金 / CIPS）是出路的方向，不是这一局的"获胜键"。终局会有一次人质考验。',
        headline: ['q6_formula', 'terror', 'deamericanize'],
        unlock: [
            'savers', 'workers', 'public', 'usa_benefit', 'exporters', 'banks',
            'local_soe', 'terror', 'deamericanize', 'cips_gold', 'flight_1tn',
            'russia_2022', 'q5_formula', 'q6_formula'
        ],
        actions: ['end_surrender', 'go_cips']
    }
];

export const ACTIONS = {
    observe_chain: {
        id: 'observe_chain',
        label: '旁观结汇链条',
        detail: '企业结汇 → 央行购汇 → 外汇占款 → 基础货币 / 外储。不干预，看行政自动机自己走。',
        trap: false
    },
    boost_export: {
        id: 'boost_export',
        label: '再扩大出口（误区：双顺差＝出口厉害）',
        detail: '经常账户会更肥，但资本账户（FDI）照样顺差——两差同向，不是"出口厉害"四个字能解释的。',
        trap: true, trapId: 'trap_export'
    },
    proclaim_strength: {
        id: 'proclaim_strength',
        label: '对外宣传"外储是实力象征"',
        detail: '叙事可以这样写，账本不会改。储备仍按强制结汇被动堆积，并自动变成美债。',
        trap: true
    },
    try_revalue: {
        id: 'try_revalue',
        label: '让人民币升值、压顺差',
        detail: '撞上利益锁定：出口企业与地方政府会反弹。经常账户只会略降，机器不停。',
        trap: false
    },
    try_diversify: {
        id: 'try_diversify',
        label: '停止买入美债、改持其他资产',
        detail: '撞上外部锁定。安全流动、回流撑出口、别无选择、稳汇率——四因首尾相衔，你没有第四个去处。',
        trap: false
    },
    drain_autonomy: {
        id: 'drain_autonomy',
        label: '把储备花光，换取自主（误区：越少越自主）',
        detail: 'U 型曲线的另一端：过少是放逐式脆弱（泰国、阿根廷），不是解放。真正自主不在这条曲线上。',
        trap: true, trapId: 'trap_u'
    },
    do_sterilize: {
        id: 'do_sterilize',
        label: '冲销：提高存准 / 发行央票',
        detail: '回收过剩流动性，冲销成本上升。机会成本（3% vs 10%）仍在默默计时——它才是最大的一项。',
        trap: false
    },
    do_repress: {
        id: 'do_repress',
        label: '金融抑制：压低存款利率',
        detail: '国有银行吃到制度租金，储蓄者被稀释。注意：这一操作压的是存款利率，和冲销对利率的作用方向相反。',
        trap: false
    },
    recycle_ust: {
        id: 'recycle_ust',
        label: '继续把储备换成美债',
        detail: '给定约束下的理性选择，不是最优选择。安全 ≠ 绝对安全。',
        trap: false
    },
    end_surrender: {
        id: 'end_surrender',
        label: '2012：取消强制结售汇',
        detail: '制度开了门。过不了几年你会看到 2014.6 → 2017.1 缩水约 1 万亿美元——一开就跑。',
        trap: false
    },
    go_cips: {
        id: 'go_cips',
        label: '去美国化：增持黄金、推进 CIPS',
        detail: '减持美债、把一部分储备从人质资产里抽出来。慢，且会撞击恐怖平衡，但方向是"一出路"。',
        trap: false
    },
    freeze_hold: {
        id: 'freeze_hold',
        label: '按住美债，不抛',
        detail: '人质继续在对方手里。你不敢抛，对方也不敢真冻结——这就是威慑。',
        trap: false
    },
    freeze_dump: {
        id: 'freeze_dump',
        label: '抛售美债，先下手',
        detail: '自身外储同步缩水；美国美元信用受损。双输。这就是金融恐怖平衡的定义。',
        trap: false
    }
};

/* ------------------------------------------------------------------ */
/* 状态机                                                              */
/* ------------------------------------------------------------------ */

function autonomyFromReserves(reserves) {
    const x = reserves / 100;
    return round1(clamp(72 - 220 * (x - 0.42) ** 2, 8, 75));
}

function unlock(g, id, { card = false } = {}) {
    if (!KNOWLEDGE[id]) return;
    if (!g.mastered.includes(id)) g.mastered.push(id);
    if (card && KNOWLEDGE[id].card && !g.seenCards.includes(id)) {
        g.glossary.push(id);
        g.seenCards.push(id);
    }
}

function unlockMany(g, ids, opts) {
    ids.forEach(id => unlock(g, id, opts));
}

function updateClasses(g) {
    const r = g.repression;
    const ca = g.ca;
    const carry = g.costs.opp;
    g.classes = {
        savers: round1(clamp(52 - r * 4.2, 8, 80)),
        workers: round1(clamp(50 - r * 2.4 - ca * 1.1, 8, 80)),
        public: round1(clamp(48 - carry * 0.35, 8, 80)),
        usa: round1(clamp(48 + g.reserves * 0.28, 20, 96)),
        exporters: round1(clamp(46 + ca * 2.4, 20, 96)),
        banks: round1(clamp(44 + r * 5.0, 20, 96)),
        local: round1(clamp(45 + r * 3.6, 20, 96))
    };
}

function tickEconomy(g) {
    // 机器自己就会冲销 + 金融抑制，不点这两键也能在账本上看到「谁被剥夺」
    if (g.act >= 2) {
        g.repression = round1(g.repression + 0.35);
        g.sterilization = round1(g.sterilization + 0.2);
    }
    const absorb = g.surrenderOn ? 1 : 0.32;
    const twin = g.ca + g.ka;
    g.reserves = round1(clamp(g.reserves + twin * absorb * 1.05 - g.capitalFlight, 0, 130));
    g.capitalFlight = 0;
    g.fxPurchase = round1(clamp(g.fxPurchase + twin * absorb * 1.25 - g.sterilization * 0.7, 5, 130));
    g.baseMoney = round1(clamp(g.baseMoney + twin * absorb * 1.05 - g.sterilization * 1.05, 15, 140));

    g.costs.opp = round1(g.costs.opp + g.reserves * 0.016);
    g.costs.accounting = round1(g.costs.accounting + 1.15);
    g.costs.sterilize = round1(g.costs.sterilize + g.sterilization * 0.85);
    g.costs.misalloc = round1(g.costs.misalloc + g.ca * 0.22);
    g.costs.weapon = round1(g.freezeRisk);

    g.autonomy = autonomyFromReserves(g.reserves);
    g.ustStock = round1(g.reserves * (g.ustShare / 100));
    updateClasses(g);
}

function snapshot(g, action) {
    return {
        act: g.act, round: g.actRound, year: g.year, action,
        ca: g.ca, ka: g.ka, reserves: g.reserves, fxPurchase: g.fxPurchase,
        baseMoney: g.baseMoney, autonomy: g.autonomy, freezeRisk: g.freezeRisk,
        dollarCredit: g.dollarCredit, ustShare: g.ustShare,
        surrenderOn: g.surrenderOn, sterilization: g.sterilization, repression: g.repression
    };
}

function enterAct(g, actNum) {
    const act = ACTS[actNum - 1];
    g.act = actNum;
    g.actRound = 0;
    g.year = act.year;
    g.phase = 'PLAYING';
    g.event = null;
    unlockMany(g, act.unlock, { card: false });
    unlockMany(g, act.headline, { card: true });
    if (g.glossary.length) g.phase = 'GLOSSARY';
    g.log.push(`${act.year} · 第 ${actNum} 问「${act.title}」：${act.question}`);
}

function flushAct(g) {
    const act = ACTS[g.act - 1];
    unlockMany(g, act.unlock, { card: false });
    act.unlock.forEach(id => {
        if (KNOWLEDGE[id] && KNOWLEDGE[id].card) unlock(g, id, { card: true });
    });
    if (act.id === 3) {
        g.year = 2014;
        g.reserves = round1(Math.max(g.reserves, 100));
        g.fxPurchase = round1(Math.max(g.fxPurchase, 100));
        g.log.push('2014.6 · 外汇储备见顶约 3.99 万亿美元（≈ GDP 的 40%），外汇占款约 27 万亿。');
    }
    if (g.glossary.length) {
        g.phase = 'GLOSSARY';
        g.pendingMnemonic = true;
        return;
    }
    g.phase = 'MNEMONIC';
}

function maybeEvent(g) {
    if (g.act !== 4) return false;
    if (g.eventDone) return false;
    if (g.actRound < ACTS[3].rounds) return false;
    g.event = 'freeze';
    g.eventDone = true;
    g.log.push('2022 · 美国冻结俄罗斯外储。同一个法律工具也可以对准你。抛，还是按住？');
    unlock(g, 'russia_2022', { card: true });
    unlock(g, 'weaponize', { card: true });
    unlock(g, 'terror', { card: true });
    unlock(g, 'safety_not_absolute', { card: true });
    if (g.glossary.length) {
        g.pendingEvent = true;
        g.phase = 'GLOSSARY';
    } else {
        g.phase = 'EVENT';
    }
    return true;
}

function finishActOrEvent(g) {
    if (maybeEvent(g)) return;
    flushAct(g);
}

function applyAction(g, id) {
    switch (id) {
        case 'observe_chain':
            g.log.push(`第 ${g.year} 年：旁观结汇链条自动运转。经常账户 + 资本账户同向流入，央行被动购汇。`);
            break;
        case 'boost_export':
            g.ca = round1(g.ca + 2.4);
            g.log.push(`第 ${g.year} 年：出口再加码，经常账户更肥。但资本账户（FDI 回报 10–15%）照样顺差——这不是"出口厉害"四个字。`);
            unlock(g, 'twin_surplus', { card: true });
            unlock(g, 'ca_ka', { card: true });
            g.trapsFired.push('trap_export');
            break;
        case 'proclaim_strength':
            g.log.push(`第 ${g.year} 年：对外宣传"实力象征"。账本不买账——储备仍是向美元体系交的贡。`);
            unlock(g, 'tribute', { card: true });
            unlock(g, 'fx_reserves', { card: true });
            g.trapsFired.push('trap_strength');
            break;
        case 'try_revalue':
            g.ca = round1(Math.max(3.2, g.ca - 0.7));
            g.classes.exporters = round1((g.classes.exporters || 50) - 8);
            g.classes.local = round1((g.classes.local || 50) - 6);
            g.log.push(`第 ${g.year} 年：尝试升值。出口企业与地方政府反弹，经常账户只降了一点。利益锁定还在。`);
            unlock(g, 'alliance', { card: true });
            unlock(g, 'triple_lock', { card: true });
            break;
        case 'try_diversify':
            g.ustShare = round1(Math.max(g.ustShare - 1.5, 70));
            g.log.push(`第 ${g.year} 年：想停买美债。四处没有去处——安全流动、回流撑出口、别无选择、稳汇率，四因把你送回美债。`);
            unlock(g, 'ust_four', { card: true });
            unlock(g, 'rational_not_optimal', { card: true });
            unlock(g, 'ust', { card: true });
            g.trapsFired.push('trap_rational');
            break;
        case 'drain_autonomy': {
            const before = g.autonomy;
            g.reserves = round1(Math.max(8, g.reserves - 28));
            tickEconomy(g);
            g.log.push(`第 ${g.year} 年：把储备花掉。自主性 ${before} → ${g.autonomy}。过少是放逐式脆弱，不是解放。真正自主不在这条 U 型曲线上。`);
            unlock(g, 'u_curve', { card: true });
            unlock(g, 'core_periphery', { card: true });
            g.trapsFired.push('trap_u');
            return;
        }
        case 'do_sterilize':
            g.sterilization = round1(g.sterilization + 2.4);
            g.log.push(`第 ${g.year} 年：提高存准、发行央票。冲销成本是显性的；机会成本（3% vs 10%）仍在账外计时，而且更大。`);
            unlock(g, 'sterilize', { card: true });
            unlock(g, 'sterilize_cost', { card: true });
            unlock(g, 'opp_cost', { card: true });
            g.trapsFired.push('trap_cost');
            break;
        case 'do_repress':
            g.repression = round1(g.repression + 2.6);
            g.log.push(`第 ${g.year} 年：压低存款利率。银行吃到制度租金，储蓄者被稀释。这一操作和冲销对利率的方向相反。`);
            unlock(g, 'repression', { card: true });
            unlock(g, 'savers', { card: true });
            unlock(g, 'banks', { card: true });
            break;
        case 'recycle_ust':
            g.ustShare = round1(Math.min(92, g.ustShare + 3));
            g.freezeRisk = round1(g.freezeRisk + 4);
            g.log.push(`第 ${g.year} 年：继续换成美债。四因闭环还在转。"安全"指流动性，不是绝对安全。`);
            unlock(g, 'ust_four', { card: true });
            unlock(g, 'safety_not_absolute', { card: true });
            unlock(g, 'rational_not_optimal', { card: true });
            g.trapsFired.push('trap_safety');
            g.trapsFired.push('trap_rational');
            break;
        case 'end_surrender':
            if (!g.surrenderOn) {
                g.log.push(`第 ${g.year} 年：强制结售汇已经取消过了。门开着，资本仍在找缝外逃。`);
                break;
            }
            g.surrenderOn = false;
            g.capitalFlight = 25;
            g.log.push('2012–2017 · 取消强制结汇。2014.6 峰值之后到 2017.1，储备缩水约 1 万亿美元——制度开了门，一开就跑。');
            unlock(g, 'flight_1tn', { card: true });
            unlock(g, 'surrender', { card: true });
            unlock(g, 'years_1994_2012', { card: true });
            break;
        case 'go_cips':
            g.goldShare = round1(g.goldShare + 6);
            g.cips = round1(Math.min(100, g.cips + 22));
            g.ustShare = round1(Math.max(55, g.ustShare - 7));
            g.freezeRisk = round1(Math.max(6, g.freezeRisk - 5));
            g.log.push(`第 ${g.year} 年：增持黄金、推进 CIPS。去美国化开始挪动结构，但恐怖平衡还在——这是出路，不是这一回合的胜利。`);
            unlock(g, 'deamericanize', { card: true });
            unlock(g, 'cips_gold', { card: true });
            unlock(g, 'q5_formula', { card: true });
            break;
        case 'freeze_hold':
            g.freezeRisk = round1(Math.min(92, g.freezeRisk + 18));
            g.costs.weapon = g.freezeRisk;
            g.dollarCredit = round1(g.dollarCredit - 4);
            g.outcome = 'terror_hold';
            g.log.push('你按住美债。人质还在对方手里，对方也不敢真砍美元信用。威慑成立——这就是金融恐怖平衡。');
            unlock(g, 'terror', { card: true });
            unlock(g, 'q5_formula', { card: true });
            break;
        case 'freeze_dump':
            g.reserves = round1(Math.max(12, g.reserves - 18));
            g.dollarCredit = round1(Math.max(20, g.dollarCredit - 24));
            g.freezeRisk = round1(g.freezeRisk + 10);
            g.outcome = 'terror_dump';
            g.log.push('你先抛。自身外储同步缩水，美元信用一并受损。任何一方激进破坏 = 双输。');
            unlock(g, 'terror', { card: true });
            unlock(g, 'q5_formula', { card: true });
            break;
        default:
            return false;
    }
    return true;
}

export function createReservesGame() {
    const g = {
        act: 1,
        actRound: 0,
        year: 1994,
        phase: 'PLAYING',
        event: null,
        eventDone: false,
        pendingMnemonic: false,
        pendingEvent: false,
        ca: 5.6,
        ka: 2.4,
        reserves: 22,
        fxPurchase: 12,
        baseMoney: 26,
        sterilization: 0,
        repression: 0,
        ustShare: 78,
        goldShare: 2,
        cips: 0,
        ustStock: 0,
        freezeRisk: 10,
        dollarCredit: 90,
        surrenderOn: true,
        capitalFlight: 0,
        autonomy: 0,
        costs: { opp: 2, accounting: 1, sterilize: 0, misalloc: 1.5, weapon: 10 },
        classes: {},
        mastered: [],
        seenCards: [],
        glossary: [],
        trapsFired: [],
        log: [],
        history: [],
        status: 'PLAYING',
        outcome: null,
        acknowledged: []
    };
    updateClasses(g);
    g.autonomy = autonomyFromReserves(g.reserves);
    g.ustStock = round1(g.reserves * (g.ustShare / 100));
    g.history.push(snapshot(g, null));
    enterAct(g, 1);
    return g;
}

export function currentAct(g) {
    return ACTS[g.act - 1];
}

export function availableActions(g) {
    if (!g || g.status !== 'PLAYING') return [];
    if (g.phase === 'GLOSSARY') return [];
    if (g.phase === 'MNEMONIC') {
        return [{
            id: 'ack_mnemonic',
            label: g.act >= 4 ? '收起四问，看总纲' : `记下口诀，进入第 ${g.act + 1} 问`,
            detail: currentAct(g).mnemonic,
            trap: false
        }];
    }
    if (g.phase === 'EVENT') {
        return [ACTIONS.freeze_hold, ACTIONS.freeze_dump];
    }
    if (g.phase !== 'PLAYING') return [];
    return currentAct(g).actions.map(id => ACTIONS[id]);
}

export function dismissGlossary(g) {
    if (g.phase !== 'GLOSSARY') return g;
    g.glossary.shift();
    if (g.glossary.length === 0) {
        if (g.pendingEvent) {
            g.pendingEvent = false;
            g.phase = 'EVENT';
        } else if (g.pendingMnemonic) {
            g.pendingMnemonic = false;
            g.phase = 'MNEMONIC';
        } else {
            g.phase = 'PLAYING';
        }
    }
    return g;
}

export function step(g, actionId) {
    if (!g || g.status !== 'PLAYING') return g;

    if (g.phase === 'GLOSSARY') {
        if (actionId === 'dismiss') dismissGlossary(g);
        return g;
    }

    if (g.phase === 'MNEMONIC') {
        if (actionId !== 'ack_mnemonic') return g;
        g.acknowledged.push(currentAct(g).q);
        (currentAct(g).extraMnemonics || []).forEach(q => {
            if (!g.acknowledged.includes(q)) g.acknowledged.push(q);
        });
        if (g.act >= 4) {
            if (!g.acknowledged.includes('Q5')) g.acknowledged.push('Q5');
            g.phase = 'DONE';
            g.status = 'DONE';
            g.log.push('四问走完。外储不是攒下的钱，是向美元体系交的贡。');
            return g;
        }
        enterAct(g, g.act + 1);
        return g;
    }

    if (g.phase === 'EVENT') {
        if (actionId !== 'freeze_hold' && actionId !== 'freeze_dump') return g;
        applyAction(g, actionId);
        tickEconomy(g);
        g.history.push(snapshot(g, actionId));
        g.event = null;
        flushAct(g);
        return g;
    }

    const allowed = currentAct(g).actions;
    if (!allowed.includes(actionId)) return g;

    const skipTick = actionId === 'drain_autonomy';
    applyAction(g, actionId);
    if (!skipTick) tickEconomy(g);

    const act = currentAct(g);
    const t = (g.actRound + 1) / act.rounds;
    g.year = Math.round(act.year + (act.endYear - act.year) * t);
    g.actRound += 1;
    g.history.push(snapshot(g, actionId));

    if (g.glossary.length) g.phase = 'GLOSSARY';

    if (g.actRound >= act.rounds) finishActOrEvent(g);
    return g;
}

export function hud(g) {
    return {
        reservesUsd: (g.reserves / 100 * 3.99).toFixed(2),
        fxPurchaseCny: (g.fxPurchase / 100 * 27).toFixed(1),
        caShare: Math.round(g.ca / Math.max(0.1, g.ca + g.ka) * 100),
        carry: '3% vs 10%',
        peak: g.reserves >= 95
    };
}

export function coverage(g) {
    const got = new Set(g.mastered);
    const missing = KNOWLEDGE_IDS.filter(id => !got.has(id));
    const byLayer = [0, 1, 2, 3, 4, 5, 6].map(layer => {
        const ids = KNOWLEDGE_IDS.filter(id => KNOWLEDGE[id].layer === layer);
        const n = ids.filter(id => got.has(id)).length;
        return { layer, n, total: ids.length };
    });
    return {
        n: g.mastered.length,
        total: KNOWLEDGE_TOTAL,
        complete: missing.length === 0,
        missing,
        byLayer
    };
}

export function debrief(g) {
    const cov = coverage(g);
    const hold = g.outcome === 'terror_hold';
    const dump = g.outcome === 'terror_dump';
    const ending = dump
        ? '你先抛了。自身外储缩水，美元信用一并受损——金融恐怖平衡的定义就是双输。'
        : hold
            ? '你按住了。人质还在，威慑还在。储备是权力，也是人质。'
            : '四问走完。';
    return {
        title: '外储不是攒下的钱，是向美元体系交的贡。',
        ending,
        mnemonics: MNEMONICS,
        acknowledged: g.acknowledged.slice(),
        traps: TRAPS,
        coverage: cov,
        numbers: [
            '2014.6 峰值 ~3.99 万亿美元（≈ GDP 40%）',
            '约 70% 来自经常账户顺差',
            '外汇占款 3 万亿 → 27 万亿（2003–2014）',
            '美债 ~3% vs 国内 ~10%（利差 7pt）',
            'FDI 在华回报 10–15%',
            '1994 并轨 · 2012 取消强制结汇',
            '2014.6 → 2017.1 缩水约 1 万亿',
            '2022 年俄罗斯外储被冻结'
        ]
    };
}

/**
 * 任意合法操作序列走完四问后，必须掌握全部知识点。
 * 供测试与"自动演示"使用。默认每幕选第一个行动。
 */
export function playthrough(choose = act => act.actions[0]) {
    const g = createReservesGame();
    let guard = 0;
    while (g.status === 'PLAYING' && guard++ < 80) {
        if (g.phase === 'GLOSSARY') {
            dismissGlossary(g);
            continue;
        }
        const acts = availableActions(g);
        if (!acts.length) break;
        const pick = g.phase === 'PLAYING' ? choose(currentAct(g), g) : acts[0].id;
        step(g, pick);
    }
    return g;
}
