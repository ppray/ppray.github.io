/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.2
 * 静态数据：8 种基础与加工商品定义 (Goods Schema)
 */

export const GOODS = {
    grain: {
        id: 'grain',
        name: '🌾 粮食',
        base_price: 20,
        category: 'primary',
        icon: '🌾',
        desc: '基础生存农产品，恩格尔需求弹性为 0，主要用于 Pop 基础食物开支。'
    },
    cotton: {
        id: 'cotton',
        name: '🌿 棉花',
        base_price: 20,
        category: 'primary',
        icon: '🌿',
        desc: '工业农业原材料，由种植园生产，是纺织厂加工纺织品的必备投入品。'
    },
    iron: {
        id: 'iron',
        name: '⛏️ 铁矿',
        base_price: 46, // M1: 40→46，base_price 杠杆补盈利，使铁矿人均VA 69 满足工资量级约束 (max工资率 ≤ min人均VA × 0.8) 并留 ≥2 余量
        category: 'raw',
        icon: '⛏️',
        desc: '采掘业重工业原材料，炼钢厂的核心投入品。'
    },
    coal: {
        id: 'coal',
        name: '🪨 煤炭',
        base_price: 40,
        category: 'raw',
        icon: '🪨',
        desc: '采掘业能源底座，用于炼钢厂熔炼与 Pop 家庭取暖。'
    },
    steel: {
        id: 'steel',
        name: '🏗️ 钢铁',
        base_price: 60,
        category: 'intermediate',
        icon: '🏗️',
        desc: '重工业核心中间品，由铁矿与煤炭熔炼，用于机械与军火制造。'
    },
    tools: {
        id: 'tools',
        name: '⚙️ 机械',
        base_price: 75,
        category: 'manufactured',
        icon: '⚙️',
        desc: '高附加值资本品，用于工业生产率提升、构造新建筑与高收入 Pop 消费。'
    },
    textiles: {
        id: 'textiles',
        name: '🧵 纺织品',
        base_price: 30,
        category: 'manufactured',
        icon: '🧵',
        desc: '轻工业制造品，核心消费品，收入弹性高，核心国向边缘国出口的主要商品。'
    },
    arms: {
        id: 'arms',
        name: '⚔️ 军火',
        base_price: 90,
        category: 'manufactured',
        icon: '⚔️',
        desc: '高端军事物资，由国家政府与军事预算采购，决定军力投射(Power Projection)。'
    }
};
