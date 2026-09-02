/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.4
 * 测试统一入口：真实执行全部测试套件并汇总退出码 (M0-1.3, 禁止假绿)
 *
 * 用法: node tools/run-tests.js  (或 npm test)
 */

import { runInvariantTests } from '../js/tests/invariants.test.js';
import { runSSTheoremTest } from '../js/tests/theory_ss.test.js';
import { runPSTheoremTest } from '../js/tests/theory_ps.test.js';
import { runReservesMinigameTests } from '../js/tests/minigame-reserves.test.js';

const suites = [
    { name: '不变量测试 (invariants)', run: runInvariantTests },
    { name: 'S-S 定理断言 (theory_ss)', run: () => [runSSTheoremTest()] },
    { name: 'P-S 假说断言 (theory_ps)', run: () => [runPSTheoremTest()] },
    { name: '外汇储备四问小游戏 (minigame-reserves)', run: runReservesMinigameTests }
];

let passCount = 0;
let failCount = 0;

suites.forEach(suite => {
    console.log(`\n=== ${suite.name} ===`);
    let results;
    try {
        results = suite.run();
    } catch (err) {
        failCount++;
        console.error(`💥 套件执行异常: ${err.message}`);
        return;
    }
    results.forEach(r => {
        if (r.passed) {
            passCount++;
            console.log(`✅ PASS - ${r.name}`);
        } else {
            failCount++;
            console.error(`❌ FAIL - ${r.name}`);
        }
        console.log(`   ${r.detail}`);
    });
});

console.log(`\n========================================`);
console.log(`总计: ${passCount} 通过, ${failCount} 失败`);

process.exit(failCount > 0 ? 1 : 0);
