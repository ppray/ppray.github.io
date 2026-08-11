/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.4
 * M2-3.3 确定性补丁: 种子化 RNG (mulberry32)
 * 替换 ai.js 的 Math.random()，种子存于 state.rngState，快照重演逐比特一致
 */

export const DEFAULT_RNG_SEED = 1836;

export function mulberry32(seed) {
    let s = seed >>> 0;
    function next() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return { next, getState: () => s >>> 0 };
}
