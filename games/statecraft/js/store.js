// 本地存储：当前这一局的存档 + 跨局的答题进度。浏览器存储随时可能不可用（隐私模式、预览），
// 所有读写都包在 try/catch 里，失败时游戏照常运行，只是不存档。
const KEY_SAVE = 'miaosuan:save:v1';
const KEY_PROG = 'miaosuan:progress:v1';
const KEY_SEEN = 'miaosuan:seen-help:v1';

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
  progress: () => (progCache ||= read(KEY_PROG, {})),
  recordAnswer(id, correct) {
    const p = this.progress();
    const r = p[id] || { n: 0, ok: 0 };
    r.n += 1; if (correct) r.ok += 1; r.last = correct ? 1 : 0; r.t = Date.now();
    p[id] = r;
    write(KEY_PROG, p);
  },
  seenHelp: () => read(KEY_SEEN, false),
  markHelp: () => write(KEY_SEEN, true),
};
