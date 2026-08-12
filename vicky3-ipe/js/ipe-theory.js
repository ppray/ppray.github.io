/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger)
 * 国际政治经济学 (IPE) 核心理论百科、解构概念与历史事件卡牌库
 */

export const IPE_THEORY_DATA = {
    // 理论范式百科数据
    paradigms: {
        mercantilism: {
            id: 'mercantilism',
            name: '重商主义 / 现实主义 (Mercantilism / Realism)',
            founder: '亚历山大·汉密尔顿、弗里德里希·李斯特',
            coreTenets: '国家安全建立在国家实力基础之上，经济是权力的基石。国际经济关系本质上是零和博弈，国家必须通过关税壁垒、产业补贴与战略资源囤积来保障自主独立。',
            keywords: ['幼稚工业保护', '关税壁垒', '国家干预', '零和博弈'],
            quote: '“在自由竞争的舞台上，弱小的工业就像未成年的孩子，必须在国家关税的护翼下成长。” —— 弗里德里希·李斯特'
        },
        liberalism: {
            id: 'liberalism',
            name: '自由主义 / 新自由主义 (Liberalism / Neoliberalism)',
            founder: '亚当·斯密、大卫·李嘉图、罗伯特·基欧汉',
            coreTenets: '市场机制与比较优势能为所有参与国创造绝对收益（Absolute Gains）。自由贸易与跨国资本流动促进相互依存，规则与制度能降低交易成本，促进和平。',
            keywords: ['比较优势', '绝对收益', '复合相互依存', '自由贸易'],
            quote: '“如果一个外国能以比我们自己制造还便宜的商品供应我们，我们最好就用我们有优势的产业生产出来的一部分物品向他们购买。” —— 亚当·斯密'
        },
        structuralism: {
            id: 'structuralism',
            name: '结构主义 / 依附理论 (Structuralism / Dependency Theory)',
            founder: '劳尔·普雷维什、阿吉里·埃曼努尔、沃勒斯坦',
            coreTenets: '资本主义世界体系被不平等的国际分工切割为“核心-半边缘-边缘”。边缘国出口初级产品交换核心国制造品，遭遇贸易条件持续恶化与依附发展锁链。',
            keywords: ['中心-边缘结构', '依附陷阱', '贸易条件恶化', '进口替代'],
            quote: '“中心国家的发展是以边缘国家的落后为代价的，自由贸易不过是巩固这种依附关系的枷锁。” —— 劳尔·普雷维什'
        },
        hegemony: {
            id: 'hegemony',
            name: '霸权稳定论 (Hegemonic Stability Theory)',
            founder: '查尔斯·金德尔伯格、罗伯特·吉尔平',
            coreTenets: '开放稳定的国际经济体系需要一个具备能力与意愿的霸权国提供公共物品（海路安全、全球公认货币、最终贷款人）。霸权衰落易触发金德尔伯格陷阱。',
            keywords: ['国际公共物品', '金德尔伯格陷阱', '霸权负担', '秩序维持'],
            quote: '“1929年大萧条的根本原因在于英国无力提供、而美国不愿提供全球经济稳定所需的公共物品。” —— 查尔斯·金德尔伯格'
        }
    },

    // 核心理论概念库
    concepts: {
        'stolper_samuelson': {
            id: 'stolper_samuelson',
            title: '斯托尔珀-萨缪尔森定理 (Stolper-Samuelson Theorem)',
            category: 'liberalism',
            summary: '自由贸易会增加一国丰裕要素所有者的实际报酬，同时降低稀缺要素所有者的实际报酬。',
            academicDetails: '在 19 世纪英国，资本与劳动力是丰裕要素，土地是稀缺要素。废除《谷物法》推行自由贸易，大幅提升了资本家与工人的收益，但重创了英国地主阶级的地租收入，引发了剧烈的内政政党博弈。',
            gameEffectDescription: '推行自由贸易将提升资本家与工人的实际购买力与政治影响力，但会激怒地主阶级。'
        },
        'infant_industry': {
            id: 'infant_industry',
            title: '李斯特幼稚工业保护论 (Listian Infant Industry Protection)',
            category: 'mercantilism',
            summary: '处于工业化起步阶段的国家，必须通过高关税保护本土未成熟的重工业，抵御后发劣势。',
            academicDetails: '弗里德里希·李斯特指出，英国在自己通过保护主义完成工业化后，劝说其他国家实行自由贸易。普鲁士与美国在 19 世纪均通过高关税成功实现对英追赶。',
            gameEffectDescription: '提高重工业关税可大幅增加国内重工业利润与建设速度，但会短期提高消费成本。'
        },
        'prebisch_singer': {
            id: 'prebisch_singer',
            title: '普雷维什-辛格假说 (Prebisch-Singer Hypothesis)',
            category: 'structuralism',
            summary: '长期来看，初级农矿产品相对于制造品的贸易条件 (Terms of Trade) 呈持续恶化趋势。',
            academicDetails: '由于工业品技术进步速度快且制造需求弹性大，而初级农产品需求弹性低且缺乏议价能力，仅靠出口农矿产品的边缘国将陷入越出口越贫困的依附锁链。',
            gameEffectDescription: '农业/采矿国的贸易条件随技术进步自然衰减，只有建立工业与进口替代才能扭转。'
        },
        'kindleberger_trap': {
            id: 'kindleberger_trap',
            title: '金德尔伯格陷阱 (Kindleberger Trap)',
            category: 'hegemony',
            summary: '主导霸权国无力继续维持国际体系公共物品，而新崛起大国不愿承担责任，导致体系崩溃。',
            academicDetails: '霸权国需要承担维护全球海路安全与金本位稳定的巨大成本。如果霸权国推行孤立主义与关税战，全球经济将陷入混乱与分裂。',
            gameEffectDescription: '霸权国关税过高或削减维持成本，全球霸权度下降，体系稳定性崩溃。'
        },

        /* ========== v3.6 新增：翟东升《货币与金融的国际政治经济学》移植概念 ========== */
        'sterling_tide': {
            id: 'sterling_tide',
            title: '英镑潮汐：金本位时代的美元潮汐前身 (The Sterling Tide)',
            category: 'hegemony',
            summary: '储备货币中心的贴现率周期性放松与收紧，向外围国依次输出繁荣与危机——今日"美元潮汐"收割机制的历史原型。',
            academicDetails: '翟东升把美元霸权的核心收割工具总结为"放水→吹泡→收水→收割"四阶段循环：中心降息放水，资本涌向外围推高资产与信贷；一旦中心加息收水，外围流动性骤紧、资产崩盘，中心资本再低价抄底。这一机制并非美元时代独创——金本位下英格兰银行的贴现率同样牵动全球资本潮汐，1890 年巴林危机、1893 年美国大恐慌都是同一剧本的早期版本。',
            gameEffectDescription: '英格兰银行贴现率宽松期，非英国三国投资池获注入但暗中积累"潮汐脆弱度"；一旦转向紧缩，脆弱度越高的国家投资池与国库被收割越重，英国则收获资本回流之利。'
        },
        'seigniorage_negative_carry': {
            id: 'seigniorage_negative_carry',
            title: '铸币税与负利差循环 (Seigniorage & Negative Carry)',
            category: 'hegemony',
            summary: '外围国积累的对外净资产以低收益形式回流中心国，中心国再以更高回报反向投资外围——差额即外围向中心缴纳的隐性"货币地租"。',
            academicDetails: '翟东升指出，外汇储备的"实力象征"只是表层叙事：美元本位下，外围国积累美元储备本质是向中心国输送信用、缴纳铸币税。其微观基础是"双顺差 + 强制结汇"的被动囤积，储备又以低收益（如买美债 ≈3%）借出，而中心资本再以高回报（FDI ≈10-15%）流回外围，7-12 个百分点的利差就是这层隐性财富转移。铸币税本身占比不算惊人，真正可观的是经财政乘数放大后的效果。',
            gameEffectDescription: '非英国国家只要保有正的对外净资产，每回合就会被小额抽走一部分流入英国国库——储备越多，缴纳的"货币地租"越多，这正是"外储越多≠越强大"的具体呈现。'
        },
        'credit_blockade': {
            id: 'credit_blockade',
            title: '金融城信用封锁：SWIFT 制裁的金本位前身 (City of London Credit Blockade)',
            category: 'hegemony',
            summary: '霸权国凭借对全球清算与承销网络的垄断，可将特定国家排除在外，使其融资成本骤增——今日 SWIFT 金融制裁的历史雏形。',
            academicDetails: '翟东升把 SWIFT 制裁列为美元"三利器"之一：以清算系统为武器，对特定国家实施金融封锁与次级制裁。在金本位时代，伦敦金融城对国债承销与商业信用的垄断发挥着类似功能——被拒绝承销的国家将被迫以更高利率、更差条件在他国市场融资，甚至完全失去外部资本渠道。',
            gameEffectDescription: '英国可对关税壁垒过高的挑战者发起"拒绝承销"：目标国投资池连续数回合被大幅削减，模拟被排除在核心金融网络之外的融资困境。'
        },
        'gold_exchange_standard': {
            id: 'gold_exchange_standard',
            title: '金汇兑本位制："省金失主权" (Gold-Exchange Standard)',
            category: 'structuralism',
            summary: '依附国货币不直接兑换黄金，而是先兑换霸权国货币（如英镑）再间接兑金——节省了黄金储备，却让渡了货币主权。',
            academicDetails: '金汇兑本位制又称"虚金本位制"：国内流通纸币而非金币，纸币规定含金量却不能直接兑现黄金，只能兑换英镑等储备货币，再由该储备货币兑金。这一安排让依附国得以节省黄金储备成本，但其货币命运从此与储备货币发行国的政策周期绑定——是外汇储备"负利差循环"与"铸币税"在金本位时代的制度原型，其取舍本质正是"保汇率稳定+资本流动 ⇒ 货币政策独立性受损"的不可能三角。',
            gameEffectDescription: '选择金汇兑本位可换取英镑潮汐宽松期的资本注入，但会在紧缩期暴露于更重的收割；改行独立的金块本位需一次性国库代价，换取对潮汐的免疫——是资本流动性与货币自主权之间的经典取舍。'
        },
        'flying_geese': {
            id: 'flying_geese',
            title: '雁行模式 (Flying Geese Paradigm)',
            category: 'structuralism',
            summary: '产业沿"头雁—跟雁"梯队依次转移：先进国工资上涨后，劳动密集型产业外迁至工资更低的国家，如雁阵依次接力。',
            academicDetails: '日本经济学家赤松要于 1930 年代提出、后经小岛清等扩展，用以解释东亚产业转移规律：头雁率先发展某产业，待劳动力成本上升后将其转移至次发达经济体，再转移至更低成本地区，形成产业升级接力。翟东升指出，这一秩序在中国崛起后被根本性颠覆——中国凭借"产业链编辑能力"（CICE）跳出雁行队列，在多个产业同时向高端冲击，反而成为区域产业网络的新头雁。',
            gameEffectDescription: '当核心国某劳动密集型建筑的雇佣紧张度突破拐点（工资高企）时，资本谋求向外围国转移产能：外围国获得产能注入，核心国换取利润回流，但也让出该产业的长期主导权。'
        },
        'smile_curve_cice': {
            id: 'smile_curve_cice',
            title: '微笑曲线与产业链编辑能力 (Smile Curve & CICE)',
            category: 'structuralism',
            summary: '价值链两端（研发/品牌）附加值高、中间（组装制造）附加值低——单纯承接雁行转移的产能只能赚取微薄代工费。',
            academicDetails: '台湾宏碁创始人施振荣 1992 年提出微笑曲线：产品价值链呈 U 型，两端附加值高、中间制造环节附加值低，长期停留在曲线底部只赚"组装费"，无法掌握定价权。翟东升提出"产业链编辑能力"（CICE，Capacity for Industrial Chain Editing）——一国主动重配、整合、延伸或切断全球产业链环节的能力，是从"世界工厂"升级为"产业链编辑者"的关键，而非被动承接产业转移。',
            gameEffectDescription: '仅靠承接雁行式产能转移能提升出口规模，但不会自动带来重工业竞争力；唯有持续自建钢厂、机械厂等自主产能，才能跳出微笑曲线底部，掌握产业链的编辑权。'
        },
        'business_cycle_juglar': {
            id: 'business_cycle_juglar',
            title: '信贷周期与朱格拉周期 (Credit Cycle & Juglar Cycle)',
            category: 'hegemony',
            summary: '资本主义经济沿信贷扩张与紧缩交替演进，约 7-11 年一个中周期——英镑/美元潮汐的宽松-紧缩节奏正是这一周期在货币层面的表现。',
            academicDetails: '法国经济学家克莱门特·朱格拉提出的中期经济周期理论，与康德拉季耶夫长波、基钦短周期共同构成经济周期的多层嵌套结构。翟东升的分析框架里，储备货币中心的降息-加息周期既是货币政策操作，也是全球信贷周期的策源地：宽松期对应繁荣扩张，紧缩期对应危机出清，二者交替构成外围国反复遭遇"发展-危机"轮回的深层节律。',
            gameEffectDescription: '英镑潮汐的宽松/紧缩交替，正是游戏内对这一周期节律的具体化：一段时间的投资池扩张之后，必然迎来一次收缩清算，无法通过单纯延长宽松期来消除。'
        },
        'exchange_rate_dilemma': {
            id: 'exchange_rate_dilemma',
            title: '汇率低估的两难 (The Undervaluation Dilemma)',
            category: 'structuralism',
            summary: '本币汇率低估能以廉价出口换取贸易份额与外汇积累，但长期压低本国购买力，且积累的储备本身又被卷入负利差循环。',
            academicDetails: '翟东升在人民币汇率专题指出，汇率低估的代价具有双重性：短期看，低估提升出口竞争力、加速工业化原始积累；长期看，本币购买力被人为压低，工人实际收入受损，而积累的外汇储备又要承受"负利差"的隐性损耗。人民币汇率与外汇储备由此被强制结汇制度焊在一起，成为同一枚硬币的两面。',
            gameEffectDescription: '游戏中虽未单列汇率变量，但净进口商品的关税与到岸价机制已经承载了同样的逻辑：压低关税、放任净出口部门扩张等价于变相的汇率低估——短期扩大贸易份额，长期加剧对贸易条件与储备负利差的暴露。'
        },
        'regional_bloc_zollverein': {
            id: 'regional_bloc_zollverein',
            title: '区域经济集团：从关税同盟到一带一路 (Regional Blocs: Zollverein to BRI)',
            category: 'mercantilism',
            summary: '通过区域性关税同盟或基建-贸易网络，在不依赖单一霸权货币的前提下扩大市场纵深、深化相互捆绑，是"破局之路"的地缘落地形式。',
            academicDetails: '普鲁士主导的德意志关税同盟（Zollverein）是 19 世纪最成功的区域经济一体化范例：通过统一内部市场关税、对外维持保护壁垒，普鲁士得以在不依附英国的情况下积累工业实力，为德意志统一奠定经济基础。翟东升将当代"一带一路"、RCEP 等区域合作项目视为同一逻辑的延伸——通过"产业链编辑能力"把更多国家更深地纳入以本国为中心的供应链网络，超越简单的债权债务关系，形成更深层次的经济捆绑。',
            gameEffectDescription: '普鲁士的关税同盟扩张事件是这一逻辑最直接的游戏化呈现：统一内部市场、对外保护关税，走一条不依赖英国霸权体系的独立工业化路径。'
        },
        'bretton_woods_prelude': {
            id: 'bretton_woods_prelude',
            title: '尾声：从英镑本位到美元本位 (Prelude to Bretton Woods)',
            category: 'hegemony',
            summary: '本局呈现的英镑潮汐、金汇兑本位与铸币税，正是二十世纪布雷顿森林体系与牙买加体系的制度雏形——霸权货币会更迭，但收割的结构逻辑一脉相承。',
            academicDetails: '两次世界大战摧毁了英镑的物质基础，美元通过 1944 年布雷顿森林体系（双挂钩：美元-黄金、各国货币-美元）接棒成为新的中心货币；1971 年"尼克松冲击"关闭黄金窗口后，1976 年《牙买加协议》确立浮动汇率与黄金非货币化，美元凭"石油美元"协议重建实物锚，形成翟东升所说的"一锚·二制·三利器·一霸权"结构——铸币税、美元潮汐、SWIFT 制裁三件利器，本质上正是本局英镑本位机制在二十世纪的重演与升级。',
            gameEffectDescription: '本局不模拟 1944 年之后的历史，但每一次潮汐收割、每一笔铸币税抽成，都是同一套霸权货币逻辑的早期版本——读懂了英镑本位如何运转，也就读懂了美元本位。'
        }
    }
};
