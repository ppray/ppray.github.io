/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 派生指标引擎 (Stats Engine): 霸权度动态 (补丁 9)、拉氏 ToT 与内生 USA 内战张力
 */

import { GOODS } from '../data/goods.js';

export function computeDerivedStats(nations, prices) {
    const statsMap = {};

    Object.entries(nations).forEach(([code, nation]) => {
        const prod = nation.production || {};

        // 1. 重工业实际产值 (使用固定 Base Price 计价)
        const heavyIndustryVal = Math.round(
            ((prod.steel || 0) * GOODS.steel.base_price) +
            ((prod.tools || 0) * GOODS.tools.base_price) +
            ((prod.arms || 0) * GOODS.arms.base_price)
        );

        // 2. 制造品毛出口占比
        const manufacturedExportQty = nation.manufacturedExportQty || 0;
        const totalExportQty = nation.totalExportQty || 1;
        const manufacturedExportRatio = totalExportQty > 0 ? (manufacturedExportQty / totalExportQty) : 0;

        // 3. 国家 GDP
        let totalGdpSum = 0;
        Object.entries(prod).forEach(([gId, qty]) => {
            const p = prices[gId] ? prices[gId].price : GOODS[gId].base_price;
            totalGdpSum += qty * p;
        });
        const gdp = Math.round(totalGdpSum / 10);

        // 4. 拉氏固定权重贸易条件 Index (M3 修正)
        //    Prebisch-Singer 口径：出口篮子 = 初级品/原材料净出口，进口篮子 = 制造品/中间品净进口
        //    基期价值固定于 t=0，指数 = (出口价格指数 / 进口价格指数) × 100
        const basePrices = {};
        Object.keys(GOODS).forEach(gId => {
            basePrices[gId] = (prices[gId] && prices[gId].basePrice) || GOODS[gId].base_price;
        });

        const exportBasket = nation.baseExportBasket || {};
        const importBasket = nation.baseImportBasket || {};
        const baseExportValue = nation.baseExportValue || 1;
        const baseImportValue = nation.baseImportValue || 1;

        let currentExportValue = 0, currentImportValue = 0;
        Object.entries(exportBasket).forEach(([gId, qty]) => {
            const cat = GOODS[gId] && GOODS[gId].category;
            if (cat !== 'primary' && cat !== 'raw') return;
            const p = basePrices[gId] || GOODS[gId].base_price;
            currentExportValue += qty * p;
        });
        Object.entries(importBasket).forEach(([gId, qty]) => {
            const cat = GOODS[gId] && GOODS[gId].category;
            if (cat !== 'intermediate' && cat !== 'manufactured') return;
            const p = basePrices[gId] || GOODS[gId].base_price;
            currentImportValue += qty * p;
        });

        const exportIndex = baseExportValue > 0 ? (currentExportValue / baseExportValue) * 100 : 100;
        const importIndex = baseImportValue > 0 ? (currentImportValue / baseImportValue) * 100 : 100;
        let rawTot = Math.round((exportIndex / Math.max(0.1, importIndex)) * 100);
        if (nation.totModifier) {
            rawTot = Math.round(rawTot * (1 + nation.totModifier));
        }
        const termsOfTrade = Math.max(5, Math.min(300, rawTot));

        // 5. 补丁 10c: 美国内战张力 (M2-3.5: 改用收入增速差，地主按部门拆分)
        //    仅种植园地主进入张力公式 (南方奴隶制利益 vs 北方工业资本家)
        let civilWarTension = nation.civilWarTension || 10;
        if (code === 'USA') {
            // 种植园地租 = 棉花种植园残差的地租份额 (南方利益)
            const plantationLandRent = nation.plantationLandRent || 0;
            const capitalistIncome = nation.factorIncome ? nation.factorIncome.capitalProfit : 100;

            // 收入增速差：资本家收益增速 - 种植园地租增速
            // 若资本家增长快于种植园地主，南北利益拉扯加剧
            const plantationGrowth = nation.prevPlantationRent ? (plantationLandRent - nation.prevPlantationRent) / Math.max(1, nation.prevPlantationRent) : 0;
            const capitalistGrowth = nation.prevCapitalProfit ? (capitalistIncome - nation.prevCapitalProfit) / Math.max(1, nation.prevCapitalProfit) : 0;
            const incomeGrowthDiff = capitalistGrowth - plantationGrowth;

            const tensionDelta = Math.round(incomeGrowthDiff * 20);
            civilWarTension = Math.max(0, Math.min(100, civilWarTension + tensionDelta));
        }

        statsMap[code] = {
            heavyIndustryVal,
            manufacturedExportRatio: Math.round(manufacturedExportRatio * 100) / 100,
            gdp,
            civilWarTension,
            termsOfTrade,
            tradeBalance: nation.tradeBalance || 0,
            tariffRevenue: nation.tariffRevenue || 0
        };
    });

    // 6. 补丁 9: 霸权国 H_target = 100 × (w1·armsShare + w2·heavyShare + w3·tradeShare)
    //    M2-3.4: 改用排名映射使霸权国 H_target 接近 90，渐进后霸权度不崩塌
    //    第1名=90、第2名=60、第3名=35、第4名=15，按维度加权 (重工业 0.4、军火 0.35、贸易 0.25)
    const armsValMap = {};
    const exportMap = {};
    Object.keys(statsMap).forEach(code => {
        armsValMap[code] = (nations[code].production && nations[code].production.arms) || 0;
        exportMap[code] = nations[code].totalExportQty || 0;
    });
    const heavySorted2 = Object.keys(statsMap).sort((a, b) => statsMap[b].heavyIndustryVal - statsMap[a].heavyIndustryVal);
    const armsSorted = Object.keys(statsMap).sort((a, b) => armsValMap[b] - armsValMap[a]);
    const exportSorted = Object.keys(statsMap).sort((a, b) => exportMap[b] - exportMap[a]);

    const rankScore = [90, 60, 35, 15];
    Object.keys(statsMap).forEach(code => { statsMap[code].hegemonyTarget = 0; });
    [heavySorted2, armsSorted, exportSorted].forEach((sorted, dimIdx) => {
        const weight = dimIdx === 0 ? 0.4 : (dimIdx === 1 ? 0.35 : 0.25);
        sorted.forEach((code, idx) => {
            statsMap[code].hegemonyTarget += Math.round(rankScore[Math.min(idx, 3)] * weight);
        });
    });

    // v3.5 挑战者压力：当 GBR 之外的国家重工业产值逼近英国时，霸权目标被压低
    // ——模拟霸权被后发挑战者（普鲁士/美国）侵蚀的历史动力学。
    // 压力 = Σ max(0, (挑战者重工业 - GBR×0.6) / GBR)，目标减去 压力×55。
    // 阈值定在 60%：玩家通过主动维持重工业领先可把挑战者压回 60% 以下、解除压力；
    // 被动挂机则随挑战者扩张触发 heg 跌破 80、everBelow80=true，1900 胜利条件失效。
    if (statsMap.GBR) {
        const gbrHeavy = statsMap.GBR.heavyIndustryVal || 1;
        let challengerPressure = 0;
        Object.keys(statsMap).forEach(code => {
            if (code === 'GBR') return;
            const otherHeavy = statsMap[code].heavyIndustryVal || 0;
            if (otherHeavy > gbrHeavy * 0.6) {
                challengerPressure += (otherHeavy - gbrHeavy * 0.6) / gbrHeavy;
            }
        });
        const gbrTargetDrop = Math.round(challengerPressure * 55);
        statsMap.GBR.hegemonyTarget = Math.max(15, statsMap.GBR.hegemonyTarget - gbrTargetDrop);
        statsMap.GBR.challengerPressure = Math.round(challengerPressure * 100) / 100;
    }

    // GDP 排名与重工业排名
    const gdpSorted = Object.keys(statsMap).sort((a, b) => statsMap[b].gdp - statsMap[a].gdp);
    gdpSorted.forEach((code, idx) => { statsMap[code].gdpRank = idx + 1; });

    heavySorted2.forEach((code, idx) => { statsMap[code].heavyRank = idx + 1; });

    return statsMap;
}
