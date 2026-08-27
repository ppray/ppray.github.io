/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.5
 * 产业梯度系统：L2a 中心-外围产业梯度成本乘数与解锁门槛
 *
 * 建筑→梯度映射基于真实 building id（见 buildings.js:7-112）：
 *   T0 = 初级/原材料，无梯度约束
 *   T1 = 轻工业
 *   T2 = 重工业
 *   T3 = 高端/资本品
 */

import { BUILDINGS } from './buildings.js';

// 建筑→梯度映射（真实 building id）。T0 = 初级/原材料，无梯度约束。
export const INDUSTRY_TIERS = {
    T0: ['rye_farm', 'cotton_plantation', 'iron_mine', 'coal_mine'],
    T1: ['textile_mill'],          // 轻工业
    T2: ['steel_mill'],            // 重工业
    T3: ['tool_works', 'arms_factory'], // 高端/资本品
};

// 成本乘数：该国建该梯度建筑，预算口径 buildCost 乘此数。T0 恒 1.0。
// ⚠ 起始占位值，必须经 tools/balance.js 分国可行性断言标定后定稿。
export const INDUSTRIAL_GRADIENT = {
    GBR:  { T1: 1.0,  T2: 1.0,  T3: 1.0  },  // 核心：基准
    PRS:  { T1: 1.1,  T2: 1.15, T3: 1.3  },  // 半核心：追赶中
    USA:  { T1: 1.05, T2: 1.2,  T3: 1.5  },  // 半边缘：资源丰裕但资本品依赖进口
    QING: { T1: 1.3,  T2: 1.7,  T3: 2.5  },  // 边缘：技术断层最大
};

// 解锁门槛：新建本级需先有 N 座低一级。硬约束，仅作用于"新建"，不追溯既有建筑。
export const TIER_UNLOCK = {
    T2: { requiresTier: 'T1', minCount: 2 },
    T3: { requiresTier: 'T2', minCount: 2 },
};

export function tierOf(buildingId) {
    for (const [tier, ids] of Object.entries(INDUSTRY_TIERS)) {
        if (ids.includes(buildingId)) return tier;
    }
    return 'T0';
}

// ★ 核心纯函数：有效建造成本。只进预算/可负担性路径。
//   绝不替代 pops.js:114 / ai.js:21,40 里的 buildCost——那三处是运行期利润率/决策口径，
//   动它们就破坏 P0"不碰利润率"承诺。
export function effectiveBuildCost(countryCode, buildingId) {
    const base = (BUILDINGS[buildingId] && BUILDINGS[buildingId].buildCost) || 0;
    const tier = tierOf(buildingId);
    if (tier === 'T0') return base;                         // 初级恒为基准
    const g = INDUSTRIAL_GRADIENT[countryCode];
    const mult = g ? (g[tier] || 1) : 1;
    return Math.round(base * mult);
}

// 解锁判定。既有建筑视为已满足（不追溯）。
export function isTierUnlocked(nation, buildingId) {
    const tier = tierOf(buildingId);
    const req = TIER_UNLOCK[tier];
    if (!req) return true;
    const have = (nation.buildings && nation.buildings[req.requiresTier]) || 0;
    return have >= req.minCount;
}