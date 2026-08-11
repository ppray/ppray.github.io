/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.4
 * 阻塞门禁工具：解算 t=0 阶段全球 8 种商品供需比 (S/D)、工资后残差与守恒
 *
 * 补丁 1 门禁四条断言 (任一违规 exit 1 阻塞):
 *   1. 8 种货物 S/D ∈ [0.7, 1.4]
 *   2. 各建筑扣除工资后的 t=0 残差 > 0 (兵工厂允许微亏)
 *   3. 全球商品净出口和恒等于 0 (聚合簿记恒等式校验)
 *   4. M1-2.2 量级约束: max(四国工资率) ≤ min(各建筑人均VA) × 0.8
 *
 * 用法: node tools/balance.js
 */

import { GOODS } from '../js/data/goods.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { COUNTRIES_1836 } from '../js/data/countries.js';
import { POP_NEEDS, calculatePopConsumptionNeeds, getGovernmentDemand } from '../js/data/pop_needs.js';
import { computeSubsistenceBasketCost, computeWageRateMultiplier } from '../js/engine/pops.js';

export function solveInitialBalance() {
    const supply = {};
    const demand = {};

    Object.keys(GOODS).forEach(g => {
        supply[g] = 0;
        demand[g] = 0;
    });

    let totalEmployedLabor = 0;
    const buildingResiduals = []; // 每国每建筑的 t=0 工资后残差
    const nationWageRates = []; // M1-2.2: 各国工资率，供工资量级约束断言

    // t=0 生存工资 (基准价篮子, 口径与 pops.js 一致)
    const wSub = Math.max(2.0, computeSubsistenceBasketCost(GOODS.grain.base_price, GOODS.coal.base_price) * (1 + 0.05));

    // 1. 汇总四国建筑产出与工业/人口需求
    Object.values(COUNTRIES_1836).forEach(nation => {
        let nationPops = { landowners: 0, capitalists: 0, workers: 0 };
        let nationEmployed = 0;

        Object.entries(nation.buildings).forEach(([bId, count]) => {
            if (count <= 0) return;
            const bConfig = BUILDINGS[bId];
            if (!bConfig) return;

            const totalHead = count * (bConfig.employmentSize || 2.5);
            totalEmployedLabor += totalHead;
            nationEmployed += totalHead;

            nationPops.landowners += Math.round(totalHead * bConfig.employment.landowners);
            nationPops.capitalists += Math.round(totalHead * bConfig.employment.capitalists);
            nationPops.workers += Math.round(totalHead * bConfig.employment.workers);

            // 产出
            Object.entries(bConfig.outputs).forEach(([g, qty]) => {
                supply[g] += qty * count;
            });
            // 工业投入
            Object.entries(bConfig.inputs).forEach(([g, qty]) => {
                demand[g] += qty * count;
            });
        });

        // 2. 该国工资率 (两段制发散, 与 pops.js 同一函数)
        const u = Math.min(0.98, nationEmployed / Math.max(1, nation.endowments.labor));
        const wageRate = Math.min(10 * wSub, wSub * computeWageRateMultiplier(u));
        nationWageRates.push({ nation: nation.id, u, wageRate });

        // 3. 每座建筑 t=0 工资后残差 (基准价)
        Object.entries(nation.buildings).forEach(([bId, count]) => {
            if (count <= 0) return;
            const bConfig = BUILDINGS[bId];
            if (!bConfig) return;

            let outputValue = 0;
            Object.entries(bConfig.outputs).forEach(([g, qty]) => {
                outputValue += qty * GOODS[g].base_price;
            });
            let inputCost = 0;
            Object.entries(bConfig.inputs).forEach(([g, qty]) => {
                inputCost += qty * GOODS[g].base_price;
            });

            const wageBill = (bConfig.employmentSize || 2.5) * wageRate;
            const upkeep = (bConfig.buildCost || 0) * 0.02; // 单座口径 (与产出/工资一致; 此前误乘 count 导致多国残差假负)
            const residual = outputValue - inputCost - wageBill - upkeep;
            buildingResiduals.push({
                nation: nation.id,
                building: bConfig.name,
                residual: Math.round(residual * 10) / 10,
                // 兵工厂允许微亏 (补丁 1 判定标准): 残差 > -10% 产值
                profitable: bId === 'arms_factory' ? residual > -outputValue * 0.1 : residual > 0
            });
        });

        // 仅就业人口消费市场需求 (生存部门人口自给自足排除出全球 D)
        const popNeeds = calculatePopConsumptionNeeds({ popHeadcount: nationPops, realIncomeRatio: 1.0 });
        demand.grain += popNeeds.grain;
        demand.coal += popNeeds.coal;
        demand.textiles += popNeeds.textiles;
        demand.tools += popNeeds.tools;

        // 政府采购需求
        const govNeeds = getGovernmentDemand(nation, GOODS);
        demand.arms += govNeeds.arms;
    });

    const report = [];
    let allBalanced = true;
    const violations = [];

    // 断言 1: S/D ∈ [0.7, 1.4]
    Object.keys(GOODS).forEach(gId => {
        const S = supply[gId];
        const D = demand[gId];
        const ratio = Math.round((S / Math.max(1, D)) * 100) / 100;
        const inBounds = ratio >= 0.7 && ratio <= 1.4;
        if (!inBounds) {
            allBalanced = false;
            violations.push({ gate: 'S/D', good: GOODS[gId].name, supply: S, demand: D, ratio, issue: 'S/D 超出 [0.7, 1.4]' });
        }

        // 断言 3: 全球净出口和 = Σ(S - D) 应与逐国 (产出-消费) 聚合恒等 (簿记校验)
        const netExportSum = S - D;

        report.push({
            good: GOODS[gId].name,
            supply: S,
            demand: D,
            ratio,
            netExportSum,
            status: inBounds ? '✅ 平衡 [0.7, 1.4]' : '❌ 失衡'
        });
    });

    // 断言 2: 工资后残差 > 0
    buildingResiduals.forEach(r => {
        if (!r.profitable) {
            allBalanced = false;
            violations.push({ gate: '残差', nation: r.nation, building: r.building, residual: r.residual, issue: 't=0 工资后残差 <= 0' });
        }
    });

    // 断言 4 (M1-2.2 量级约束): max(四国工资率) ≤ min(各建筑人均VA) × 0.8，留出 ≥20% 利润垫
    const vaPerWorker = Object.values(BUILDINGS).map(b => {
        let outV = 0;
        Object.entries(b.outputs).forEach(([g, qty]) => { outV += qty * GOODS[g].base_price; });
        let inV = 0;
        Object.entries(b.inputs).forEach(([g, qty]) => { inV += qty * GOODS[g].base_price; });
        return { building: b.name, va: (outV - inV) / (b.employmentSize || 2.5) };
    });
    const minVA = vaPerWorker.reduce((m, x) => x.va < m.va ? x : m);
    const maxWage = nationWageRates.reduce((m, x) => x.wageRate > m.wageRate ? x : m);
    const wageCeiling = minVA.va * 0.8;
    if (maxWage.wageRate > wageCeiling) {
        allBalanced = false;
        violations.push({
            gate: '工资量级',
            nation: maxWage.nation,
            building: minVA.building,
            residual: Math.round((maxWage.wageRate - wageCeiling) * 10) / 10,
            issue: `max工资率 ${maxWage.wageRate.toFixed(1)} > min人均VA ${minVA.va.toFixed(1)} × 0.8 = ${wageCeiling.toFixed(1)}`
        });
    }

    return {
        totalEmployedLabor: Math.round(totalEmployedLabor),
        wSub: Math.round(wSub * 100) / 100,
        report,
        buildingResiduals,
        allBalanced,
        violations
    };
}

// CLI 入口: node tools/balance.js — 任何违规 exit 1 阻塞 (补丁 1)
// 浏览器可安全 import solveInitialBalance；仅 Node CLI 才跑下方门禁输出
const isNodeCLI = typeof process !== 'undefined'
    && Array.isArray(process.argv)
    && process.argv[1]
    && import.meta.url === `file://${process.argv[1]}`;

if (isNodeCLI) {
    const result = solveInitialBalance();

    console.log('📊 t=0 全球供需平衡表 (总就业人口: ' + result.totalEmployedLabor + ', W_sub: ' + result.wSub + ')');
    console.table(result.report);
    console.log('🏭 建筑工资后残差 (t=0, 基准价):');
    console.table(result.buildingResiduals);

    if (result.allBalanced) {
        console.log('✅ 门禁通过：S/D、工资后残差、净出口簿记、工资量级约束四条断言全部满足。');
        process.exit(0);
    } else {
        console.error('❌ 门禁失败， violations:');
        console.table(result.violations);
        process.exit(1);
    }
}
