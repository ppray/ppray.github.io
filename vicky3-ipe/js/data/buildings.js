/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 静态数据：建筑配方、employmentSize (除以10) 与要素密集度 (Buildings Schema)
 * 补丁 4a: 棉花单座产出 18 -> 7 (把过剩从 2.73 压至 0.96 健康区间)
 */

export const BUILDINGS = {
    rye_farm: {
        id: 'rye_farm',
        name: '🌾 农场',
        category: 'primary',
        employmentSize: 4.0,
        inputs: {},
        outputs: { grain: 20 },
        factorShare: { land: 0.60, capital: 0.10, labor: 0.30 }, // 土地密集型
        employment: { landowners: 0.10, capitalists: 0.05, workers: 0.85 },
        buildCost: 100,
        landReq: 1,
        desc: '基础农业设施，收益主要转化为地主的土地地租。'
    },
    cotton_plantation: {
        id: 'cotton_plantation',
        name: '🌿 棉花种植园',
        category: 'primary',
        employmentSize: 3.5,
        inputs: {},
        outputs: { cotton: 18 }, // M1: 恢复 18，改由建筑数量杠杆调 S/D，保住人均增加值
        factorShare: { land: 0.65, capital: 0.15, labor: 0.20 }, // 土地密集型
        employment: { landowners: 0.15, capitalists: 0.10, workers: 0.75 },
        buildCost: 120,
        landReq: 1,
        desc: '商业化农业种植园，出口棉花，地主阶级核心财富来源。'
    },
    iron_mine: {
        id: 'iron_mine',
        name: '⛏️ 铁矿场',
        category: 'raw',
        employmentSize: 3.0,
        inputs: {},
        outputs: { iron: 4.5 },
        factorShare: { land: 0.20, capital: 0.50, labor: 0.30 },
        employment: { landowners: 0.05, capitalists: 0.25, workers: 0.70 },
        buildCost: 200,
        landReq: 1,
        desc: '采掘工业，提供炼钢所需的铁矿石。'
    },
    coal_mine: {
        id: 'coal_mine',
        name: '🪨 煤矿场',
        category: 'raw',
        employmentSize: 3.0,
        inputs: {},
        outputs: { coal: 12 },
        factorShare: { land: 0.20, capital: 0.50, labor: 0.30 },
        employment: { landowners: 0.05, capitalists: 0.25, workers: 0.70 },
        buildCost: 200,
        landReq: 1,
        desc: '采掘工业，提供重工业与家庭取暖所需的煤炭燃料。'
    },
    textile_mill: {
        id: 'textile_mill',
        name: '🧵 纺织厂',
        category: 'manufactured',
        employmentSize: 2.5,
        inputs: { cotton: 14 },
        outputs: { textiles: 23 },
        factorShare: { land: 0.05, capital: 0.45, labor: 0.50 }, // 劳动密集型
        employment: { landowners: 0.00, capitalists: 0.20, workers: 0.80 },
        buildCost: 250,
        landReq: 0,
        desc: '轻工业核心，消耗棉花生产纺织品，主要发放工人工资。'
    },
    steel_mill: {
        id: 'steel_mill',
        name: '🏗️ 炼钢厂',
        category: 'manufactured',
        employmentSize: 2.5,
        inputs: { iron: 6, coal: 6 }, // M1: 6/6 恢复毛利；铁煤过剩改由矿场数量调节
        outputs: { steel: 12 },
        factorShare: { land: 0.05, capital: 0.65, labor: 0.30 }, // 资本密集型
        employment: { landowners: 0.00, capitalists: 0.30, workers: 0.70 },
        buildCost: 350,
        landReq: 0,
        desc: '重工业中枢，消耗铁与煤，高度依赖资本家投资。'
    },
    tool_works: {
        id: 'tool_works',
        name: '⚙️ 机械制造厂',
        category: 'manufactured',
        employmentSize: 2.0,
        inputs: { steel: 5 },
        outputs: { tools: 8 },
        factorShare: { land: 0.00, capital: 0.60, labor: 0.40 }, // 资本/技能密集型
        employment: { landowners: 0.00, capitalists: 0.30, workers: 0.70 },
        buildCost: 400,
        landReq: 0,
        desc: '高端制造，消耗钢铁制造机械，工业化核心指标。'
    },
    arms_factory: {
        id: 'arms_factory',
        name: '⚔️ 兵工厂',
        category: 'manufactured',
        employmentSize: 2.0,
        inputs: { steel: 4, tools: 2 },
        outputs: { arms: 6 },
        factorShare: { land: 0.00, capital: 0.55, labor: 0.45 },
        employment: { landowners: 0.00, capitalists: 0.35, workers: 0.65 },
        buildCost: 500,
        landReq: 0,
        desc: '军工复合体，消耗钢铁与机械生产武器，由政府采购。'
    }
};
