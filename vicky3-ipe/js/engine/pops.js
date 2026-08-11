/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 核心引擎：工资前置成本、地租与利润残差分配 (3a) 及两段发散工资率算式 (3b)
 */

import { BUILDINGS } from '../data/buildings.js';
import { GOODS } from '../data/goods.js';
import { POP_NEEDS } from '../data/pop_needs.js';

/**
 * 补丁 3c: 生存篮子定义（最低生存口径，不含纺织品）
 * 文档单一事实来源: grain 1.5 + coal 0.2, margin 5%
 * 仅用于工资底板; POP_NEEDS 仍用于消费侧恩格尔需求
 */
export const SUBSISTENCE_BASKET = { grain: 1.5, coal: 0.2 };
export const SUBSISTENCE_MARGIN = 0.05;

export function computeSubsistenceBasketCost(grainP, coalP) {
    return SUBSISTENCE_BASKET.grain * grainP + SUBSISTENCE_BASKET.coal * coalP;
}

export function computeWageSub(grainP, coalP) {
    return computeSubsistenceBasketCost(grainP, coalP) * (1 + SUBSISTENCE_MARGIN);
}

/**
 * 补丁 3b: 两段制拐点发散工资率倍数 (u = 就业/禀赋)
 * α = 0.6: 拐点右侧仍可见（u=0.95 时工资约为拐点 2.4 倍），但 GBR 刚过拐点处不触发极限环
 */
export function computeWageRateMultiplier(u) {
    const uStar = 0.85;
    const kappa = 0.3;
    const alpha = 0.6;

    let wageRateMult = 1 + kappa * u;
    if (u >= uStar) {
        const basePart = 1 + kappa * uStar;
        const divPart = Math.pow((1 - uStar) / Math.max(0.01, 1 - u), alpha);
        wageRateMult = basePart * divPart;
    }
    return wageRateMult;
}

export function calculateFactorReturnsAndPops(nation, prices) {
    let totalLandRent = 0;
    let totalCapitalProfit = 0;
    let totalLaborWages = 0;
    let totalSubsidiesCost = 0;

    // 1. 推导 Pop 人口数
    const popHeadcount = { landowners: 0, capitalists: 0, workers: 0 };
    let totalEmployedLabor = 0;

    Object.entries(nation.buildings).forEach(([bId, count]) => {
        if (count <= 0) return;
        const bConfig = BUILDINGS[bId];
        if (!bConfig) return;

        const totalHead = count * (bConfig.employmentSize || 2.5);
        totalEmployedLabor += totalHead;

        popHeadcount.landowners += Math.round(totalHead * (bConfig.employment.landowners || 0));
        popHeadcount.capitalists += Math.round(totalHead * (bConfig.employment.capitalists || 0));
        popHeadcount.workers += Math.round(totalHead * (bConfig.employment.workers || 0));
    });

    popHeadcount.landowners = Math.max(2, popHeadcount.landowners);
    popHeadcount.capitalists = Math.max(5, popHeadcount.capitalists);
    popHeadcount.workers = Math.max(20, popHeadcount.workers);

    // 生存部门人口 (自给自足，不进入市场需求)
    const laborEndowment = nation.endowments ? nation.endowments.labor : 300;
    const subsistencePops = Math.max(0, Math.round(laborEndowment - totalEmployedLabor));
    popHeadcount.subsistence = subsistencePops;

    // 2. 补丁 3b: 计算两段制拐点发散工资率 (WageRate)
    const u = Math.min(0.98, totalEmployedLabor / Math.max(1, laborEndowment));

    // 生存工资 W_sub 挂钩上一期生存消费篮子开销（补丁 3c）
    const grainP = nation.domesticPrices ? nation.domesticPrices.grain : 20;
    const coalP = nation.domesticPrices ? nation.domesticPrices.coal : 40;
    const basketCost = computeSubsistenceBasketCost(grainP, coalP);
    const wSub = Math.max(2.0, basketCost * (1 + SUBSISTENCE_MARGIN));

    const wageRate = Math.min(10 * wSub, wSub * computeWageRateMultiplier(u));

    // 3. 补丁 3a: 会计口径重构——工资为前置成本，地租与利润切分残差
    let plantationLandRent = 0; // M2-3.5: 种植园地租单独记账 (USA 内战张力用)
    Object.entries(nation.buildings).forEach(([buildingId, count]) => {
        if (count <= 0) return;
        const bConfig = BUILDINGS[buildingId];
        if (!bConfig) return;

        // 产出按国内到岸价结算
        let outputValue = 0;
        Object.entries(bConfig.outputs).forEach(([goodId, qty]) => {
            const pDom = nation.domesticPrices ? nation.domesticPrices[goodId] : 20;
            outputValue += qty * pDom;
        });

        // 投入按国内到岸价结算
        let inputCost = 0;
        Object.entries(bConfig.inputs).forEach(([goodId, qty]) => {
            const pDom = nation.domesticPrices ? nation.domesticPrices[goodId] : 20;
            inputCost += qty * pDom;
        });

        // 前置工资账单 (与产出售价无关，前置扣除)
        const employment = count * (bConfig.employmentSize || 2.5);
        const sectorWageBill = employment * wageRate;
        totalLaborWages += sectorWageBill;

        // 补丁 10a: 折旧维护费 (buildCost × 2% / turn, 工资后、残差切分前扣除)
        const upkeep = (bConfig.buildCost || 0) * 0.02 * count;

        // 扣除投入、工资与折旧后的残差 (Residual)
        const grossRevenue = outputValue * count - inputCost * count;
        let residual = grossRevenue - sectorWageBill - upkeep;

        // 补贴与闲置
        if (residual < 0) {
            if (nation.subsidies) {
                totalSubsidiesCost += Math.abs(residual);
                residual = 5 * count; // 国库兜底补贴
            } else {
                residual = 1 * count; // 无补贴，低产闲置
            }
        }

        // 地租与资本利润依 factorShare.land 与 factorShare.capital 切分残差
        const landCapSum = (bConfig.factorShare.land || 0) + (bConfig.factorShare.capital || 0) || 1;
        const landShareNormalized = bConfig.factorShare.land / landCapSum;
        const capitalShareNormalized = bConfig.factorShare.capital / landCapSum;

        totalLandRent += residual * landShareNormalized;
        totalCapitalProfit += residual * capitalShareNormalized;

        // M2-3.5: 记录种植园地租 (供 USA 内战张力按部门拆分地主用)
        if (buildingId === 'cotton_plantation') {
            plantationLandRent += residual * landShareNormalized;
        }
    });

    const totalIncomeSum = totalLandRent + totalCapitalProfit + totalLaborWages || 1;
    const nationalIncome = Math.round(totalIncomeSum);

    // 4. Pop 阶级 Clout %
    const landownersIncomeShare = Math.round((totalLandRent / totalIncomeSum) * 100) / 100;
    const capitalistsIncomeShare = Math.round((totalCapitalProfit / totalIncomeSum) * 100) / 100;
    const workersIncomeShare = Math.round((totalLaborWages / totalIncomeSum) * 100) / 100;

    // 5. 真实购买力 (Real Purchasing Power): 用生存篮子计价
    const landownersRealInc = Math.round((totalLandRent / Math.max(1, popHeadcount.landowners)) / Math.max(1, basketCost) * 100);
    const capitalistsRealInc = Math.round((totalCapitalProfit / Math.max(1, popHeadcount.capitalists)) / Math.max(1, basketCost) * 100);
    const workersRealInc = Math.round((totalLaborWages / Math.max(1, popHeadcount.workers)) / Math.max(1, basketCost) * 100);

    const landownersSol = Math.max(5, Math.round(landownersRealInc / 10));
    const capitalistsSol = Math.max(5, Math.round(capitalistsRealInc / 15));
    const workersSol = Math.max(1, Math.round(workersRealInc / 20));

    // 工人激进度
    let workerRadicals = nation.pops && nation.pops.workers ? nation.pops.workers.radicals : 10;
    const rationingPenalty = (nation.unmetDemandRatio || 0) * 50;

    if (basketCost > 60 || rationingPenalty > 10) {
        workerRadicals = Math.min(100, Math.round(workerRadicals + 5 + rationingPenalty));
    } else {
        workerRadicals = Math.max(0, Math.round(workerRadicals - 3));
    }

    return {
        popHeadcount,
        employmentTightness: Math.round(u * 100) / 100,
        wageRate: Math.round(wageRate * 10) / 10,
        factorIncome: {
            landRent: Math.round(totalLandRent),
            capitalProfit: Math.round(totalCapitalProfit),
            laborWages: Math.round(totalLaborWages)
        },
        plantationLandRent: Math.round(plantationLandRent),
        realIncome: {
            landowners: landownersRealInc,
            capitalists: capitalistsRealInc,
            workers: workersRealInc
        },
        realIncomeRatio: workersRealInc / 100,
        subsidiesCost: Math.round(totalSubsidiesCost),
        nationalIncome,
        pops: {
            landowners: { clout: landownersIncomeShare, sol: landownersSol, incomeShare: landownersIncomeShare },
            capitalists: { clout: capitalistsIncomeShare, sol: capitalistsSol, incomeShare: capitalistsIncomeShare },
            workers: { clout: workersIncomeShare, sol: workersSol, incomeShare: workersIncomeShare, radicals: workerRadicals }
        }
    };
}
