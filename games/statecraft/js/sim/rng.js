// 可序列化的种子随机数（mulberry32）。状态就是一个 uint32，存进存档、克隆推演都不丢。
export function makeRng(state) {
  let s = state >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    get state() { return s; },
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: p => next() < p,
    // Box–Muller，σ 由调用方乘
    normal: () => {
      const u = Math.max(next(), 1e-9), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted: (items, w) => {
      const total = items.reduce((n, it) => n + w(it), 0);
      let r = next() * total;
      for (const it of items) { r -= w(it); if (r <= 0) return it; }
      return items[items.length - 1];
    },
  };
}

export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
