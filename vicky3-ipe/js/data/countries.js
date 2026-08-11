/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 静态数据：1836 年四国初始状态、重定标劳动力禀赋与咬住的土地上限 (Countries Schema)
 */

export const COUNTRIES_1836 = {
    GBR: {
        id: 'GBR',
        name: '大英帝国',
        flag: '🇬🇧',
        rankTitle: '霸权国 (Core Hegemon)',
        desc: '日不落帝国，工业革命发源地。1836 年处于《谷物法》庇护地主阶段(谷物关税 35%)，废除谷物法将开启全球自由贸易与资本家崛起。',
        endowments: { land: 60, capital: 1000, labor: 300 }, // M1: 就业 ≈258.5, u ≈ 0.862 (刚过拐点)
        buildings: {
            rye_farm: 15,
            cotton_plantation: 1,
            iron_mine: 12,
            coal_mine: 16,
            steel_mill: 10,
            tool_works: 10,
            textile_mill: 20,
            arms_factory: 8
        },
        tariffs: { grain: 0.35, cotton: 0.0, iron: 0.0, coal: 0.0, steel: 0.05, tools: 0.05, textiles: 0.05, arms: 0.10 },
        incomeTaxRate: 0.08,
        subsidies: false,
        treasury: 5000,
        hegemonyCost: 300,
        hegemonyScore: 90,
        everBelow80: false,
        netForeignAssets: 2000,
        investmentPool: 1000,
        milSpendRate: 0.06,
        wageRigidity: true,
        winCondition: {
            desc: '👑 保持霸权稳定度 >= 80 (途中从未跌破80%) 且重工业全球第一直至 1900 年。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.GBR.win)
        },
        loseCondition: {
            desc: '💀 霸权维持成本拖垮财政 (国库 < -5000) 或霸权崩塌 (霸权度 < 30)。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.GBR.lose)
        }
    },
    PRS: {
        id: 'PRS',
        name: '普鲁士 / 德意志关税同盟',
        flag: '🇩🇪',
        rankTitle: '崛起列强 (Rising Challenger)',
        desc: '拥有极高煤铁潜能。奉行李斯特幼稚工业保护主义，立志通过高关税保护本土重工业，实现对英超越。',
        endowments: { land: 100, capital: 500, labor: 270 }, // M1: 铁矿 15→12 后连带重定标禀赋 280→270, 就业 233.0, u ≈ 0.863 (准核心，保持过拐点)
        buildings: {
            rye_farm: 20,
            cotton_plantation: 0,
            iron_mine: 12, // M1: 15→12，数量杠杆压铁矿 S/D 至 ≤1.3 (162/126 ≈ 1.29)
            coal_mine: 20,
            steel_mill: 6,
            tool_works: 5,
            textile_mill: 8,
            arms_factory: 6
        },
        tariffs: { grain: 0.15, cotton: 0.10, iron: 0.20, coal: 0.20, steel: 0.35, tools: 0.35, textiles: 0.25, arms: 0.30 },
        incomeTaxRate: 0.10,
        subsidies: true,
        treasury: 2500,
        hegemonyCost: 0,
        hegemonyScore: 50,
        netForeignAssets: 500,
        investmentPool: 500,
        milSpendRate: 0.07,
        wageRigidity: false,
        winCondition: {
            desc: '🔨 组建关税同盟，重工业实际产值超越大英帝国。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.PRS.win)
        },
        loseCondition: {
            desc: '💥 高关税导致工人消费昂贵或配给不足，工人激进度 > 80%。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.PRS.lose)
        }
    },
    QING: {
        id: 'QING',
        name: '大清帝国',
        flag: '🇨🇳',
        rankTitle: '边缘大国 (Periphery Giant)',
        desc: '庞大的人口与农业底盘，但缺乏重工业。面临不平等条约与贸易条件恶化，急需洋务自强搞进口替代。',
        endowments: { land: 250, capital: 150, labor: 2000 }, // M1: 就业 ≈417.0, u ≈ 0.209 (边缘国，海量剩余劳动力)
        buildings: {
            rye_farm: 80,
            cotton_plantation: 19,
            iron_mine: 4,
            coal_mine: 3,
            steel_mill: 0,
            tool_works: 0,
            textile_mill: 3,
            arms_factory: 1
        },
        tariffs: { grain: 0.05, cotton: 0.05, iron: 0.05, coal: 0.05, steel: 0.05, tools: 0.05, textiles: 0.05, arms: 0.05 },
        incomeTaxRate: 0.05,
        subsidies: false,
        treasury: 3000,
        hegemonyCost: 0,
        hegemonyScore: 20,
        netForeignAssets: 0,
        investmentPool: 150,
        milSpendRate: 0.05,
        wageRigidity: true,
        totModifier: 0,
        winCondition: {
            desc: '⛵ 推行进口替代工业化 (ISI)，制造品出口占比 > 40% 破除依附锁链。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.QING.win)
        },
        loseCondition: {
            desc: '📉 陷入依附恶性循环：拉氏贸易条件 TOT < 40 或外债/国库破产 (< -3000)。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.QING.lose)
        }
    },
    USA: {
        id: 'USA',
        name: '美利坚合众国',
        flag: '🇺🇸',
        rankTitle: '新兴巨无霸 (Resource Giant)',
        desc: '西进运动中拥有无限资源潜能。北方工业资本家主张关税保护，南方地主种植园主主张自由贸易。',
        endowments: { land: 200, capital: 600, labor: 360 }, // M1: 就业 ≈297.0, u ≈ 0.825 (临界边疆，恰在拐点下方)
        buildings: {
            rye_farm: 35,
            cotton_plantation: 13,
            iron_mine: 8,
            coal_mine: 10,
            steel_mill: 5,
            tool_works: 6,
            textile_mill: 10,
            arms_factory: 4
        },
        tariffs: { grain: 0.10, cotton: 0.05, iron: 0.15, coal: 0.15, steel: 0.25, tools: 0.25, textiles: 0.20, arms: 0.20 },
        incomeTaxRate: 0.06,
        subsidies: false,
        treasury: 3500,
        hegemonyCost: 0,
        hegemonyScore: 40,
        netForeignAssets: 800,
        investmentPool: 600,
        milSpendRate: 0.05,
        wageRigidity: false,
        civilWarTension: 10,
        winCondition: {
            desc: '🗽 跃居全球第一大 GDP 经济体，且有效控制南北重工业关税引发的内战张力。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.USA.win)
        },
        loseCondition: {
            desc: '⚔️ 保护主义关税加剧南北撕裂，引发内战爆发 (张力 > 90)。'
            // check 逻辑见 js/engine/rules.js (NATION_RULES.USA.lose)
        }
    }
};
