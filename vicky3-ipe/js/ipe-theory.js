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
        }
    }
};
