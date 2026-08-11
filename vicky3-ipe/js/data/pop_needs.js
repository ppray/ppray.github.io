/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.2
 * 需求侧模型：{base, elasticity} 恩格尔需求弹性篮子、家庭取暖 0.3/人与军费预算需求
 */

import { BUILDINGS } from '../data/buildings.js';
import { GOODS } from '../data/goods.js';

export const POP_NEEDS = {
    workers: {
        grain:    { base: 2.0, elasticity: 0.0 },
        coal:     { base: 0.3, elasticity: 0.2 },
        textiles: { base: 0.4, elasticity: 0.8 },
        tools:    { base: 0.0, elasticity: 0.0 }
    },
    landowners: {
        grain:    { base: 2.0, elasticity: 0.0 },
        coal:     { base: 0.6, elasticity: 0.4 },
        textiles: { base: 1.2, elasticity: 1.0 },
        tools:    { base: 0.2, elasticity: 1.4 }
    },
    capitalists: {
        grain:    { base: 2.0, elasticity: 0.0 },
        coal:     { base: 0.8, elasticity: 0.5 },
        textiles: { base: 1.5, elasticity: 1.2 },
        tools:    { base: 0.4, elasticity: 1.6 }
    }
};

/**
 * 计算 Pop 人口总消费需求 (按人头数 * {base, elasticity})
 */
export function calculatePopConsumptionNeeds(nation) {
    const needs = { grain: 0, coal: 0, textiles: 0, tools: 0 };
    const popsCount = nation.popHeadcount || { workers: 100, landowners: 10, capitalists: 20 };
    const realIncomeRatio = nation.realIncomeRatio || 1.0;

    Object.entries(POP_NEEDS).forEach(([classKey, basket]) => {
        const headCount = popsCount[classKey] || 10;
        const incomeMult = Math.max(0, realIncomeRatio - 1.0);

        Object.entries(basket).forEach(([goodId, config]) => {
            const perCapitaDemand = config.base * (1 + config.elasticity * incomeMult);
            needs[goodId] = (needs[goodId] || 0) + Math.round(headCount * perCapitaDemand);
        });
    });

    return needs;
}

/**
 * 计算国家 t=0 基准国民收入 (GVA): Σ(产出基准价 - 投入基准价) × 建筑数量
 * 补丁 4b 的 MilitaryBudget = milSpendRate × NationalIncome 在 t=0 无滞后收入时用此回退
 */
function computeBaseNationalIncome(nation) {
    let income = 0;
    Object.entries(nation.buildings || {}).forEach(([bId, count]) => {
        if (count <= 0) return;
        const bConfig = BUILDINGS[bId];
        if (!bConfig) return;
        let out = 0;
        Object.entries(bConfig.outputs).forEach(([g, q]) => { out += q * (GOODS[g] ? GOODS[g].base_price : 0); });
        let inp = 0;
        Object.entries(bConfig.inputs).forEach(([g, q]) => { inp += q * (GOODS[g] ? GOODS[g].base_price : 0); });
        income += (out - inp) * count;
    });
    return Math.max(100, income);
}

/**
 * 军事预算驱动军火 (arms) 需求 (补丁 4b)
 */
export function getGovernmentDemand(nation, prices) {
    const nationalIncome = nation.nationalIncome || nation.baseNationalIncome || computeBaseNationalIncome(nation);
    const milSpendRate = Math.max(0, Math.min(1, nation.milSpendRate || 0.05));
    const militaryBudget = Math.round(nationalIncome * milSpendRate);
    // 兼容两种价格表：引擎市场价 ({price}) 与静态货物表 ({base_price})
    const armsP = (prices.arms && (prices.arms.price || prices.arms.base_price)) || 90;
    const armsDemand = Math.max(4, Math.round(militaryBudget / armsP));

    return { arms: armsDemand };
}

/**
 * 建造工程消耗机械 (tools) 需求
 */
export function getConstructionNeeds(newBuildsCount = 0) {
    return { tools: Math.max(0, newBuildsCount * 3) };
}
