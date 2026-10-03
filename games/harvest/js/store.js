// 本地存储：当前这一局 + 通关战绩 + 跨局答题进度。
// 浏览器存储随时可能不可用（隐私模式、预览），所有读写都包 try/catch，失败时游戏照常跑，只是不存档。
const KEY_SAVE = 'harvest:save:v1';
const KEY_BEST = 'harvest:best:v1';
const KEY_PROG = 'harvest:progress:v1';

function read(key, fallback) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; }
}

let progCache = null;

export const store = {
  loadGame: () => read(KEY_SAVE, null),
  saveGame: S => write(KEY_SAVE, S),
  clearGame: () => { try { localStorage.removeItem(KEY_SAVE); } catch {} },

  // 战绩：{ [levelId]: { equity, grade, seed, at } }
  best: () => read(KEY_BEST, {}),
  recordBest(levelId, equity, grade) {
    const b = this.best();
    const cur = b[levelId];
    if (!cur || equity > cur.equity) b[levelId] = { equity, grade, at: Date.now() };
    write(KEY_BEST, b);
  },

  progress: () => (progCache ||= read(KEY_PROG, {})),
  recordAnswer(id, correct) {
    const p = this.progress();
    const r = p[id] || { n: 0, ok: 0 };
    r.n += 1; if (correct) r.ok += 1; r.last = correct ? 1 : 0; r.t = Date.now();
    p[id] = r;
    write(KEY_PROG, p);
  },
};
