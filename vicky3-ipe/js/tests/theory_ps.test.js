/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger)
 * 理论验收测试：Prebisch-Singer 假说 (M3)
 * 断言：边缘大国大清的拉氏贸易条件在 50 回合内恶化 ≥15%
 *        ToT_{QING}(t=50) <= ToT_{QING}(t=0) * 0.85
 */

import { createInitialState, tick } from '../engine/core.js';

export function runPSTheoremTest() {
    let state = createInitialState('GBR');

    const initialTot = state.derivedStats?.QING?.termsOfTrade ?? 100;

    for (let i = 0; i < 50; i++) {
        state = tick(state);
    }

    const finalTot = state.derivedStats?.QING?.termsOfTrade ?? 100;
    const threshold = Math.round(initialTot * 0.85);
    const passed = finalTot <= threshold;

    return {
        name: '📉 Prebisch-Singer 假说断言：大清贸易条件 50 回合恶化 ≥15%',
        passed,
        detail: passed
            ? `成功！大清 ToT 从 ${initialTot} 降至 ${finalTot}，恶化幅度 ≥15% (阈值 ${threshold})，符合核心-边缘依附模型。`
            : `失败！大清 ToT 未达预期恶化 (初始 ${initialTot} -> 50 回合后 ${finalTot}，阈值 ${threshold})，检查初级品/制造品价格漂移与出口结构。`
    };
}
