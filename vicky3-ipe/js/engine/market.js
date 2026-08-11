/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.3
 * 核心引擎：Smoothstep 关税楔子平滑化 (补丁 5) + 净进口判定 + 配给出清
 */

import { GOODS } from '../data/goods.js';

function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
}

export function calculateMarketAndPrices(nations, currentPrices = {}, turn = 1) {
    const globalSupply = {};
    const globalDemand = {};

    Object.keys(GOODS).forEach(g => {
        globalSupply[g] = 0;
        globalDemand[g] = 0;
    });

    Object.values(nations).forEach(nation => {
        Object.keys(GOODS).forEach(g => {
            globalSupply[g] += nation.production[g] || 0;
            globalDemand[g] += nation.consumption[g] || 0;
        });
    });

    // 1. 基准价长期 P-S 漂移 & 短期 Vic3 阻尼钳位
    // M2-3.5: 移动锚漂移 Base_{t+1} = Base_t × (1 + 0.02 × (P_t/Base_t − 1))
    //         锚=短期均值回归；叠加长期漂移 (primary -0.4%/turn, manufactured +0.4%/turn)
    const nextPrices = {};
    Object.keys(GOODS).forEach(g => {
        const config = GOODS[g];
        const isPrimary = config.category === 'primary' || config.category === 'raw';
        const longDriftFactor = isPrimary ? (1 - turn * 0.010) : (1 + turn * 0.010);
        const longDrifted = config.base_price * Math.max(0.5, longDriftFactor);
        const driftedBasePrice = Math.max(5, Math.min(config.base_price * 1.4, longDrifted));

        // 移动锚：上一期基准价向上一期实际价格均值回归
        const prevBase = currentPrices[g] ? currentPrices[g].basePrice : driftedBasePrice;
        const prevPrice = currentPrices[g] ? currentPrices[g].price : driftedBasePrice;
        const movingAnchor = prevBase * (1 + 0.02 * (prevPrice / Math.max(1, prevBase) - 1));
        const anchoredBase = (movingAnchor + driftedBasePrice) / 2; // 移动锚与长期漂移取均值

        const S = globalSupply[g] || 1;
        const D = globalDemand[g] || 1;
        const curP = currentPrices[g] ? currentPrices[g].price : anchoredBase;

        const ratio = (D - S) / Math.max(S, D, 1);
        const clampRatio = Math.max(-0.75, Math.min(0.75, 0.75 * ratio));
        const targetPrice = anchoredBase * (1 + clampRatio);

        const smoothedPrice = curP + 0.20 * (targetPrice - curP);

        nextPrices[g] = {
            price: Math.round(smoothedPrice * 100) / 100,
            basePrice: Math.round(anchoredBase * 100) / 100,
            supply: S,
            demand: D,
            ratio: Math.round((D / Math.max(S, 1)) * 100) / 100
        };
    });

    // 2. 补丁 5: Smoothstep 关税楔子平滑化 (在 netImport / domesticCons = 0 附近平滑过渡)
    const updatedNations = {};
    Object.entries(nations).forEach(([code, nation]) => {
        let exportValSum = 0;
        let exportQtySum = 0;
        let importValSum = 0;
        let importQtySum = 0;
        let tariffRevenueSum = 0;
        let manufacturedExportQty = 0;
        let totalExportQty = 0;

        const netExports = {};
        const domesticPrices = {};

        Object.keys(GOODS).forEach(g => {
            const prod = nation.production[g] || 0;
            const cons = nation.consumption[g] || 0;
            const diff = prod - cons;
            netExports[g] = diff;
            const worldP = nextPrices[g].price;
            const tariffRate = nation.tariffs[g] || 0;

            // 补丁 5: 临界过渡函数 sigma = smoothstep(-0.05, 0.05, r)
            const r = cons > 0 ? (-diff / cons) : 0;
            const sigma = smoothstep(-0.05, 0.05, r);
            const domesticP = worldP * (1 + tariffRate * sigma);
            domesticPrices[g] = domesticP;

            if (diff > 0) { // 净出口
                exportValSum += diff * worldP;
                exportQtySum += diff;
                totalExportQty += diff;
                if (GOODS[g].category === 'manufactured') {
                    manufacturedExportQty += diff;
                }
            } else if (diff < 0) { // 净进口
                const impQty = Math.abs(diff);
                const tariffAmount = impQty * worldP * tariffRate * sigma;
                tariffRevenueSum += tariffAmount;

                importValSum += impQty * domesticP;
                importQtySum += impQty;
            }
        });

        // 配给 (Rationing)
        let unmetDemandRatio = 0;
        Object.keys(GOODS).forEach(g => {
            const S = globalSupply[g] || 1;
            const D = globalDemand[g] || 1;
            if (D > S) {
                unmetDemandRatio += (D - S) / D;
            }
        });
        unmetDemandRatio = Math.min(0.5, unmetDemandRatio / 8);

        const avgExportPrice = exportQtySum > 0 ? exportValSum / exportQtySum : 1;
        const avgImportPrice = importQtySum > 0 ? importValSum / importQtySum : 1;

        updatedNations[code] = {
            ...nation,
            netExports,
            domesticPrices,
            tariffRevenue: Math.round(tariffRevenueSum),
            unmetDemandRatio,
            avgExportPrice,
            avgImportPrice,
            exportValSum,
            importValSum,
            manufacturedExportQty,
            totalExportQty
        };
    });

    return {
        prices: nextPrices,
        nations: updatedNations
    };
}
