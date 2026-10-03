// 可复现随机数：同一 seed 必然得到同一局市场。
// 用途：史实的「方向」写在关卡数据里不随机，随机只作用于「幅度」——
// 危机爆发就是危机爆发，但到底跌 18% 还是 24%，每局不同。这样既能复盘，又不会两局完全一样。

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 对称扰动：[-j, +j]
export function jitter(rng, j) {
  return (rng() * 2 - 1) * j;
}

// 洗牌（抽题、干扰项排序）
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
