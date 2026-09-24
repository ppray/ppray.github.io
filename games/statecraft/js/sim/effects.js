// 事件的条件与效果：声明式小语言，只能引用 defs.js 里登记过的路径。
//   条件  { path, lt|lte|gt|gte|eq|ne|in } · { flag } · { noflag } · { timer } · { any: [...] }
//   效果  { path, add|set|mul } · { flag, set } · { timer, set } · { schedule, in }
import { PATHS, READ_PATHS } from './defs.js';

export function getPath(S, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S);
}
function setPath(S, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], S);
  obj[last] = v;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function evalCond(S, c) {
  if (c == null) return true;
  if (Array.isArray(c)) return c.every(x => evalCond(S, x));
  if (c.any) return c.any.some(x => evalCond(S, x));
  if (c.flag) return !!S.flags[c.flag];
  if (c.noflag) return !S.flags[c.noflag];
  if (c.timer) return (S.timers[c.timer] || 0) > 0;
  const v = getPath(S, c.path);
  if ('lt' in c) return v < c.lt;
  if ('lte' in c) return v <= c.lte;
  if ('gt' in c) return v > c.gt;
  if ('gte' in c) return v >= c.gte;
  if ('eq' in c) return v === c.eq;
  if ('ne' in c) return v !== c.ne;
  if ('in' in c) return c.in.includes(v);
  return true;
}

// 应用效果，返回可读的变更记录 [{label, from, to}]，供事件结果与史评展示。
export function applyEffects(S, effects = []) {
  const changes = [];
  for (const e of effects) {
    if (e.flag) { S.flags[e.flag] = e.set === undefined ? S.q : e.set; continue; }
    if (e.timer) { S.timers[e.timer] = e.set; continue; }
    if (e.schedule) { S.pending.push({ id: e.schedule, q: S.q + (e.in || 1) }); continue; }
    const spec = PATHS[e.path];
    const from = getPath(S, e.path);
    let to = from;
    if ('set' in e) to = e.set;
    else if ('add' in e) to = from + e.add;
    else if ('mul' in e) to = from * e.mul;
    if (spec.type === 'num') to = clamp(to, spec.min, spec.max);
    setPath(S, e.path, to);
    // 集团支持度的变动有六成会留成「旧账/人情」，在之后的季度里慢慢淡去（见 model.js 的 mood）
    if (e.path.startsWith('soc.groups.') && 'add' in e && S.soc.mood) {
      const g = e.path.slice(11);
      S.soc.mood[g] = (S.soc.mood[g] || 0) + 0.6 * e.add;
    }
    changes.push({ path: e.path, label: spec.label, from, to });
  }
  return changes;
}

// ── schema 校验：{ valid, errors[] }，错误信息写清哪条事件、哪一项、期望什么
const COND_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne', 'in'];
export function validateCond(c, where, errors) {
  if (c == null) return;
  if (Array.isArray(c)) { c.forEach((x, i) => validateCond(x, `${where}[${i}]`, errors)); return; }
  if (typeof c !== 'object') { errors.push(`${where}: 条件必须是对象，收到 ${JSON.stringify(c)}`); return; }
  if (c.any) { if (!Array.isArray(c.any)) errors.push(`${where}.any: 期望数组`); else c.any.forEach((x, i) => validateCond(x, `${where}.any[${i}]`, errors)); return; }
  if (c.flag || c.noflag || c.timer) return;
  if (!c.path) { errors.push(`${where}: 缺少 path / flag / noflag / timer / any`); return; }
  if (!(c.path in PATHS) && !(c.path in READ_PATHS)) errors.push(`${where}: 未登记的路径 "${c.path}"（见 defs.js 的 PATHS / READ_PATHS）`);
  const ops = COND_OPS.filter(k => k in c);
  if (ops.length !== 1) errors.push(`${where}: 需要恰好一个比较符（${COND_OPS.join('/')}），收到 ${ops.join(',') || '无'}`);
  if ('in' in c && !Array.isArray(c.in)) errors.push(`${where}.in: 期望数组`);
}

export function validateEffect(e, where, errors, eventIds) {
  if (!e || typeof e !== 'object') { errors.push(`${where}: 效果必须是对象`); return; }
  if (e.flag) { if (typeof e.flag !== 'string') errors.push(`${where}.flag: 期望字符串`); return; }
  if (e.timer) { if (!Number.isInteger(e.set) || e.set < 0) errors.push(`${where}: timer "${e.timer}" 的 set 需为非负整数（持续季度数）`); return; }
  if (e.schedule) {
    if (eventIds && !eventIds.has(e.schedule)) errors.push(`${where}: schedule 指向不存在的事件 "${e.schedule}"`);
    if (e.in !== undefined && (!Number.isInteger(e.in) || e.in < 1)) errors.push(`${where}: schedule.in 需为 ≥1 的整数`);
    return;
  }
  const spec = PATHS[e.path];
  if (!spec) { errors.push(`${where}: 路径 "${e.path}" 不可写（只有 defs.js 的 PATHS 可被事件改写）`); return; }
  const ops = ['add', 'set', 'mul'].filter(k => k in e);
  if (ops.length !== 1) { errors.push(`${where}: 需要恰好一个操作（add/set/mul），收到 ${ops.join(',') || '无'}`); return; }
  if (spec.type === 'enum' && !('set' in e)) errors.push(`${where}: 枚举路径 "${e.path}" 只能 set`);
  if (spec.type === 'enum' && 'set' in e && !spec.values.includes(e.set)) errors.push(`${where}: "${e.path}" 只接受 ${JSON.stringify(spec.values)}，收到 ${JSON.stringify(e.set)}`);
  if (spec.type === 'bool' && typeof e.set !== 'boolean') errors.push(`${where}: "${e.path}" 期望 set 布尔值`);
  if (spec.type === 'num') {
    const v = e.add ?? e.set ?? e.mul;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${where}: "${e.path}" 期望数值，收到 ${JSON.stringify(v)}`);
    if ('mul' in e && (v <= 0 || v > 3)) errors.push(`${where}: mul 倍数 ${v} 越界（期望 0–3）`);
    if ('set' in e && (v < spec.min || v > spec.max)) errors.push(`${where}: set ${v} 超出 "${e.path}" 的范围 [${spec.min}, ${spec.max}]`);
  }
}
