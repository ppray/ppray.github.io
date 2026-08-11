/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.4
 * 补丁 6+7+8: 投资池建造决策 + AI 蛛网扩产、闲置与拆除退出路径
 * M2-3.1: build() 改从 investmentPool 扣款；建造额度上限 = capital 禀赋；按利润率排序
 * M2-3.2: utilization 与 lowUtilizationTurns 跟踪；产能升降与5回合拆除退出；单位成本计算
 * M2-3.3: Math.random() 已替换为种子化 RNG (rng.next())
 */

import { BUILDINGS } from '../data/buildings.js';
import { GOODS } from '../data/goods.js';

/**
 * 计算单位成本 = (投入成本 + 工资 + 折旧) / 产出 (补丁 7: 删除 estimatedUnitCost=15 硬编码)
 */
function computeUnitCost(bConfig, prices, wageRate) {
    let inputCost = 0;
    Object.entries(bConfig.inputs).forEach(([g, qty]) => {
        inputCost += qty * (prices[g] || GOODS[g].base_price);
    });
    const wagePerBuilding = (bConfig.employmentSize || 2.5) * wageRate;
    const upkeep = (bConfig.buildCost || 0) * 0.02;
    let totalOutput = 0;
    Object.values(bConfig.outputs).forEach(qty => { totalOutput += qty; });
    return totalOutput > 0 ? (inputCost + wagePerBuilding + upkeep) / totalOutput : 999;
}

/**
 * 计算单位利润率 = 残差 / 产值
 */
function computeProfitRate(bConfig, prices, wageRate) {
    let outputValue = 0;
    Object.entries(bConfig.outputs).forEach(([g, qty]) => {
        outputValue += qty * (prices[g] || GOODS[g].base_price);
    });
    let inputCost = 0;
    Object.entries(bConfig.inputs).forEach(([g, qty]) => {
        inputCost += qty * (prices[g] || GOODS[g].base_price);
    });
    const wagePerBuilding = (bConfig.employmentSize || 2.5) * wageRate;
    const upkeep = (bConfig.buildCost || 0) * 0.02;
    const residual = outputValue - inputCost - wagePerBuilding - upkeep;
    return outputValue > 0 ? residual / outputValue : -1;
}

function canBuild(nation, bId) {
    const bConfig = BUILDINGS[bId];
    if (!bConfig) return false;

    if (bConfig.landReq > 0) {
        let occupiedLand = 0;
        Object.entries(nation.buildings).forEach(([id, count]) => {
            if (BUILDINGS[id] && BUILDINGS[id].landReq > 0) occupiedLand += count;
        });
        const maxLand = nation.endowments ? nation.endowments.land : 100;
        if (occupiedLand + 1 > maxLand) return false;
    }
    return true; // 资金检查由调用方处理
}

function buildFromPool(nation, bId) {
    const bConfig = BUILDINGS[bId];
    nation.investmentPool = Math.max(0, nation.investmentPool - bConfig.buildCost);
    nation.buildings[bId] = (nation.buildings[bId] || 0) + 1;
    nation.newBuilds = (nation.newBuilds || 0) + 1;
}

/**
 * 步骤1: AI 政策脚本（关税、补贴），不含建造（M2-3.1: 建造移至步骤8之后）
 */
export function executeNationAI(nation, code, playerNationKey, rng) {
    if (code === playerNationKey) return nation;
    const nextNation = JSON.parse(JSON.stringify(nation));

    // 默认政策脚本
    if (code === 'GBR') {
        nextNation.tariffs.grain = 0.0;
        nextNation.tariffs.cotton = 0.0;
        nextNation.tariffs.textiles = 0.05;
    } else if (code === 'PRS') {
        nextNation.tariffs.steel = 0.35;
        nextNation.tariffs.tools = 0.35;
        nextNation.subsidies = true;
    } else if (code === 'QING') {
        Object.keys(nextNation.tariffs).forEach(g => { nextNation.tariffs[g] = 0.05; });
    } else if (code === 'USA') {
        nextNation.tariffs.grain = 0.10;
        nextNation.tariffs.steel = 0.20;
    }

    return nextNation;
}

/**
 * 步骤8.5: 蛛网建造与退出（M2-3.1+3.2，在财政/投资池结算之后）
 */
export function executeNationBuild(nation, code, playerNationKey, rng) {
    if (code === playerNationKey) return nation;
    const nextNation = JSON.parse(JSON.stringify(nation));

    const prices = nextNation.domesticPrices || {};
    const wageRate = nextNation.wageRate || 10;

    if (!nextNation.buildingState) nextNation.buildingState = {};

    const capitalEndowment = nextNation.endowments ? nextNation.endowments.capital : 0;
    // M2: 每回合总建造额度上限 = capital 禀赋的 10%（流量定义，蛛网扩产+新建共享）
    const buildCapThisTurn = capitalEndowment * 0.10;
    let builtThisTurn = 0;

    // 1. 蛛网退出路径：每建筑记录 utilization 与 lowUtilizationTurns
    Object.entries(nextNation.buildings).forEach(([bId, count]) => {
        if (count <= 0) return;
        const bConfig = BUILDINGS[bId];
        if (!bConfig) return;

        const unitCost = computeUnitCost(bConfig, prices, wageRate);
        const outputGood = Object.keys(bConfig.outputs)[0];
        const pDom = prices[outputGood] || GOODS[outputGood].base_price;

        const bs = nextNation.buildingState[bId] || { utilization: 1.0, lowUtilizationTurns: 0 };

        if (pDom > unitCost * 1.2) {
            // P_dom > UnitCost × 1.2 → 产能 +3%（蛛网扩产，从投资池扣款，受建造额度约束）
            const expand = Math.max(1, Math.round(count * 0.03));
            const expandCost = bConfig.buildCost * expand;
            if (nextNation.investmentPool >= expandCost && builtThisTurn + expandCost <= buildCapThisTurn) {
                nextNation.investmentPool -= expandCost;
                nextNation.buildings[bId] = count + expand;
                nextNation.newBuilds = (nextNation.newBuilds || 0) + expand;
                builtThisTurn += expandCost;
            }
            bs.utilization = 1.0;
            bs.lowUtilizationTurns = 0;
        } else if (pDom < unitCost) {
            // P_dom < UnitCost → 降开工率
            bs.utilization = Math.max(0.3, bs.utilization - 0.1);
            bs.lowUtilizationTurns += 1;

            // 开工率 < 0.5 连续 5 回合 → 拆除 2% 产能
            if (bs.utilization < 0.5 && bs.lowUtilizationTurns >= 5) {
                const demolish = Math.max(1, Math.round(count * 0.02));
                nextNation.buildings[bId] = Math.max(0, count - demolish);
                bs.lowUtilizationTurns = 0;
            }
        } else {
            // 正常区间：开工率恢复
            bs.utilization = Math.min(1.0, bs.utilization + 0.05);
            bs.lowUtilizationTurns = 0;
        }

        nextNation.buildingState[bId] = bs;
    });

    // 2. 投资池建造新建筑：按 t-1 利润率排序选最赚钱产业 (M2-3.1)
    // M2: 共享上述 buildCapThisTurn 剩余额度
    let builtThisTurn2 = builtThisTurn;

    const candidates = Object.entries(BUILDINGS)
        .map(([bId, bConfig]) => ({
            bId,
            profitRate: computeProfitRate(bConfig, prices, wageRate),
            bConfig
        }))
        .filter(x => x.profitRate > 0.1)
        .sort((a, b) => b.profitRate - a.profitRate);

    for (const { bId, bConfig } of candidates) {
        if (rng.next() >= 0.3) continue;
        if (nextNation.investmentPool < bConfig.buildCost) continue;
        // endowments.capital 每回合建造额度上限 (流量定义，不永久占用)
        if (builtThisTurn2 + bConfig.buildCost > buildCapThisTurn) break;
        if (!canBuild(nextNation, bId)) continue;

        buildFromPool(nextNation, bId);
        builtThisTurn2 += bConfig.buildCost;
    }

    return nextNation;
}
