/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 核心模拟器引擎：10 步纯函数 `tick(state) => nextState` 滞后一期收入管线
 * 使用 structuredClone 保障深拷贝完整性与确定性快照测试
 */

import { BUILDINGS } from '../data/buildings.js';
import { GOODS } from '../data/goods.js';
import { COUNTRIES_1836 } from '../data/countries.js';
import { calculatePopConsumptionNeeds, getGovernmentDemand, getConstructionNeeds } from '../data/pop_needs.js';
import { calculateMarketAndPrices } from './market.js';
import { calculateFactorReturnsAndPops } from './pops.js';
import { computeDerivedStats } from './stats.js';
import { executeNationAI, executeNationBuild } from './ai.js';
import { NATION_RULES } from './rules.js';
import { mulberry32, DEFAULT_RNG_SEED } from './rng.js';

export function createInitialState(playerNationKey = 'GBR') {
    const nations = structuredClone(COUNTRIES_1836);

    Object.values(nations).forEach(n => {
        n.production = {};
        n.consumption = {};
    });

    const initialState = {
        turn: 1,
        year: 1836,
        playerNationKey,
        hegemonyScore: 90,
        prices: {},
        nations,
        rngState: DEFAULT_RNG_SEED, // M2-3.3: 种子化 RNG 状态，快照重演确定性来源
        logs: [`📜 1836 年，《帝国的账本：核心与边缘》模拟开启。工业革命与金本位秩序重塑世界。`],
        unlockedConcepts: ['stolper_samuelson', 'infant_industry', 'prebisch_singer', 'kindleberger_trap'],
        activeEvent: null,
        gameStatus: 'PLAYING'
    };

    return tick(initialState);
}

/**
 * 10 步纯函数 Tick 管线
 */
export function tick(state) {
    const nextTurn = state.turn + 1;
    const nextYear = 1836 + Math.floor((nextTurn - 1) / 1);

    // 步骤 1: 结构深拷贝与 AI 行为决策
    // M2-3.3: 种子化 RNG，种子从 state.rngState 恢复，回合结束后持久化
    const rng = mulberry32(state.rngState ?? DEFAULT_RNG_SEED);
    let nextNations = {};
    Object.entries(state.nations).forEach(([code, n]) => {
        nextNations[code] = executeNationAI(n, code, state.playerNationKey, rng);
    });

    // Prebisch-Singer 技术驱动累积系数
    const techMultiplier = 1 + ((nextTurn - 1) * 0.012);
    const primaryTechMultiplier = 1 + ((nextTurn - 1) * 0.002);

    // 步骤 2 & 3: 算劳动力与潜在产出，计算本回合总需求 (基于滞后收入)
    Object.values(nextNations).forEach(n => {
        const prod = {};
        const cons = {};
        Object.keys(GOODS).forEach(g => { prod[g] = 0; cons[g] = 0; });

        // 建筑产出与折旧 (补丁 10a: upkeep 维护费扣减)
        Object.entries(n.buildings).forEach(([bId, count]) => {
            if (count <= 0) return;
            const bConfig = BUILDINGS[bId];
            if (!bConfig) return;

            const mult = bConfig.category === 'manufactured' ? techMultiplier : primaryTechMultiplier;

            Object.entries(bConfig.outputs).forEach(([g, qty]) => {
                prod[g] += Math.round(qty * count * mult);
            });
            Object.entries(bConfig.inputs).forEach(([g, qty]) => {
                cons[g] += qty * count;
            });
        });

        // 叠加 Pop 需求、政府采购与建造需求
        const popNeeds = calculatePopConsumptionNeeds(n);
        const govNeeds = getGovernmentDemand(n, state.prices);
        const constNeeds = getConstructionNeeds(n.newBuilds || 0);

        cons.grain += popNeeds.grain;
        cons.coal += popNeeds.coal;
        cons.textiles += popNeeds.textiles;
        cons.tools += popNeeds.tools + constNeeds.tools;
        cons.arms += govNeeds.arms;

        n.production = prod;
        n.consumption = cons;
        n.newBuilds = 0;
    });

    // 步骤 4: 世界市场出清 (阻尼钳位 + Smoothstep 关税楔子)
    const marketResult = calculateMarketAndPrices(nextNations, state.prices, nextTurn);
    const updatedPrices = marketResult.prices;
    const nationsWithTrade = marketResult.nations;

    // M3: 在 t=0 (nextTurn === 2) 固定各国基期贸易篮子与基期价值，用于拉氏 ToT 指数
    if (nextTurn === 2) {
        Object.values(nationsWithTrade).forEach(n => {
            n.baseExportBasket = {};
            n.baseImportBasket = {};
            n.baseExportValue = 0;
            n.baseImportValue = 0;
            Object.entries(n.netExports || {}).forEach(([gId, net]) => {
                const p = updatedPrices[gId] ? updatedPrices[gId].basePrice : GOODS[gId].base_price;
                if (net > 0) {
                    n.baseExportBasket[gId] = net;
                    n.baseExportValue += net * p;
                } else if (net < 0) {
                    n.baseImportBasket[gId] = -net;
                    n.baseImportValue += -net * p;
                }
            });
        });
    }

    // 步骤 5, 6, 7: 残差要素分配、开工率、SOL 与激进度更新
    Object.values(nationsWithTrade).forEach(n => {
        const popsResult = calculateFactorReturnsAndPops(n, updatedPrices);
        n.factorIncome = popsResult.factorIncome;
        n.nationalIncome = popsResult.nationalIncome;
        n.realIncome = popsResult.realIncome;
        n.realIncomeRatio = popsResult.realIncomeRatio;
        n.popHeadcount = popsResult.popHeadcount;
        n.employmentTightness = popsResult.employmentTightness;
        n.wageRate = popsResult.wageRate;
        n.pops = popsResult.pops;
        n.plantationLandRent = popsResult.plantationLandRent;

        // 步骤 8: 真实财政守恒与投资池 (Investment Pool)
        const totalIncomeSum = n.factorIncome.landRent + n.factorIncome.capitalProfit + n.factorIncome.laborWages;
        const incomeTaxRevenue = Math.round(totalIncomeSum * (n.incomeTaxRate || 0.05));
        const tariffRevenue = n.tariffRevenue || 0;
        const subsidiesCost = popsResult.subsidiesCost || 0;
        const hegemonyCost = n.hegemonyCost || 0;

        const netFiscalDelta = tariffRevenue + incomeTaxRevenue - subsidiesCost - hegemonyCost;
        n.treasury += netFiscalDelta;

        // 税后资本家利润 30% 存入投资池
        const capitalistProfit = n.factorIncome.capitalProfit || 0;
        n.prevCapitalProfit = n.prevCapitalProfit || capitalistProfit; // M2-3.5: 保存上一期供内战张力增速计算
        const postTaxProfit = capitalistProfit * (1 - (n.incomeTaxRate || 0.05));
        n.investmentPool = Math.round((n.investmentPool || 0) + (postTaxProfit * 0.30));

        // 步骤 8.5: 国际收支外债计息 (5%)
        let nfa = n.netForeignAssets || 0;
        nfa += n.tradeBalance || 0;
        if (nfa < 0) {
            nfa = Math.round(nfa * 1.05);
        }
        n.netForeignAssets = nfa;
    });

    // 步骤 8.6: AI 蛛网建造与退出 (M2-3.1+3.2, 财政/投资池结算之后)
    Object.entries(nationsWithTrade).forEach(([code, n]) => {
        nationsWithTrade[code] = executeNationBuild(n, code, state.playerNationKey, rng);
    });

    // 步骤 8.7: 人口增长 (M2-3.6: LaborEndowment_{t+1} = LaborEndowment_t × (1 + g_n))
    // 生存部门人口随之自动补充，刘易斯拐点变为可往返
    // 增长率取低值避免短期内稀释人均产出，干扰 S-S 福利涌现
    const growthRates = { GBR: 0.003, PRS: 0.008, USA: 0.020, QING: 0.004 };
    Object.entries(nationsWithTrade).forEach(([code, n]) => {
        const g = growthRates[code] || 0.005;
        if (n.endowments && n.endowments.labor) {
            n.endowments.labor = Math.round(n.endowments.labor * (1 + g));
        }
        // 保存上一期种植园地租供下回合内战张力增速计算
        n.prevPlantationRent = n.plantationLandRent || 0;
    });

    // 步骤 9 & 10: 派生指标计算 (stats.js) 与霸权度动态
    const derivedStats = computeDerivedStats(nationsWithTrade, updatedPrices);

    // 步骤 10: 霸权度动态 (M2-3.4: 向 H_target 渐进，替换 +1/-2 规则)
    let hegemonyScore = state.hegemonyScore;
    const gbrHegemonyTarget = derivedStats.GBR ? derivedStats.GBR.hegemonyTarget : 50;
    // 渐进系数 0.1：每回合向目标靠近 10%
    hegemonyScore = Math.round((hegemonyScore + (gbrHegemonyTarget - hegemonyScore) * 0.1) * 10) / 10;
    hegemonyScore = Math.max(0, Math.min(100, hegemonyScore));

    if (hegemonyScore < 80) {
        nationsWithTrade.GBR.everBelow80 = true;
    }

    // 海运安全度 (M2-3.4: seaLaneSecurity = clamp(paidCost/requiredCost, 0, 1))
    // requiredHegemonyCost 标定目标：占 GBR 财政收入 30-50%，这里取 40% 的基准收入
    const gbrFiscalBase = 300; // GBR 基准期财政收入量级 (hegemonyCost=300 即此口径)
    const requiredHegemonyCost = gbrFiscalBase;
    const paidCost = nationsWithTrade.GBR.treasury > 0 ? nationsWithTrade.GBR.hegemonyCost : 0;
    const seaLaneSecurity = Math.max(0, Math.min(1, paidCost / Math.max(1, requiredHegemonyCost)));
    nationsWithTrade.GBR.seaLaneSecurity = seaLaneSecurity;

    // 海运成本楔入进口价 (M2-3.4: freightCost_g = baseFreight_g × (2 - seaLaneSecurity))
    // seaLaneSecurity=1 时 freight=base (安全)；=0 时 freight=2×base (瘫痪)
    // 作为隐性关税楔入各国进口商品的国内到岸价——在 market.js 已计算 domesticPrices 基础上叠加
    if (seaLaneSecurity < 1) {
        const freightMultiplier = 2 - seaLaneSecurity; // [1, 2]
        Object.values(nationsWithTrade).forEach(n => {
            if (!n.domesticPrices) return;
            Object.keys(n.domesticPrices).forEach(g => {
                // 仅对净进口商品叠加海运成本
                if (n.netExports && n.netExports[g] < 0) {
                    const baseFreight = 2; // 每单位基础海运成本
                    n.domesticPrices[g] += baseFreight * freightMultiplier;
                }
            });
        });
    }

    const playerNation = nationsWithTrade[state.playerNationKey];
    const playerRules = NATION_RULES[state.playerNationKey];
    const playerDescs = COUNTRIES_1836[state.playerNationKey];
    let gameStatus = state.gameStatus;
    const logs = [...state.logs];

    const ruleState = { ...state, nations: nationsWithTrade, year: nextYear, hegemonyScore };
    if (playerRules && playerRules.win(derivedStats, ruleState)) {
        gameStatus = 'WON';
        logs.unshift(`🎉 胜利！成功达成国家历史战略目标：${playerDescs.winCondition.desc}`);
    } else if (playerRules && playerRules.lose(derivedStats, ruleState)) {
        gameStatus = 'LOST';
        logs.unshift(`💔 失败！触发国家危机防线：${playerDescs.loseCondition.desc}`);
    }

    logs.unshift(`⌛ 推进至 ${nextYear} 年 (第 ${nextTurn} 回合)。全球市场完成价格、关税与配给出清。`);
    if (logs.length > 50) logs.pop();

    return {
        ...state,
        turn: nextTurn,
        year: nextYear,
        hegemonyScore,
        prices: updatedPrices,
        nations: nationsWithTrade,
        derivedStats,
        logs,
        gameStatus,
        rngState: rng.getState() // M2-3.3: 持久化 RNG 种子状态
    };
}
