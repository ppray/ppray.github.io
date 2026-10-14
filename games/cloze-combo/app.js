/* 填空连击 —— 翟东升《货币与金融的国际政治经济学》必背四章挖空速记
 *
 * 手感致敬 grmchn/dopa-drill（ドパドリル，MIT）：逐格即时判定、连击跨题累积、
 * 演出随进度只升不降、答错只断连击不扣分。代码为本站重写，不含原作源码。
 *
 * 题源：/games/statecraft/data/questions/core-cloze.json
 *   由 scripts/statecraft/extract-questions.mjs 生成：必背四章纪年页游里手写的挖空题与排序题，
 *   加上 games/cloze-combo/supplement.mjs 里取自速查卡的补充题。勿手改。
 * 风格：研学（默认）/ 街机。两套只差外观、措辞和特效开关，逻辑、节奏与计分完全相同（见 arcade()）。
 * 记录：localStorage「clozeCombo.v1」（v: 2），只在本机。
 */
(() => {
  'use strict';

  const DATA_URL = '/games/statecraft/data/questions/core-cloze.json';
  const STORE_KEY = 'clozeCombo.v1';
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
  const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
  const BASIC_N = 10;            // 四章混合一局的题数；单章通关 = 该章全部
  const REVIEW_N = 10;
  const REVIEW_MAX = 40;
  const EXTRA_MS = 90000;
  const EXTRA_INTRO_MS = 900;
  const EXTRA_GATE = 0.8;        // 一次全对率达到它才开放加时赛
  // 「跨境收付」上限：2023 年全年银行代客人民币跨境收付（含资本项目）52.3 万亿元
  const L_MAX = Math.log10(52.3e12);
  const LEVEL_AT = [2.2, 4.4, 6.6, 8.8, 11, 13.2];
  const MILESTONES = [[4, '1 万元'], [6, '100 万元'], [8, '1 亿元'], [10, '100 亿元'], [12, '1 万亿元'], [13, '10 万亿元']];
  const COMBO_MARKS = [10, 20, 30, 50, 75, 100];
  const CHAPTER_COLORS = {
    arcade: { 'fx-reserves': '#3b6bff', 'fx-rate': '#ff7ab6', 'gold-std': '#ffd23f', 'rmb-intl': '#3fdcb0' },
    scholar: { 'fx-reserves': '#2f4e86', 'fx-rate': '#8c4b62', 'gold-std': '#a8742a', 'rmb-intl': '#3f7a5a' },
  };
  // 两套风格的措辞：街机沿用 dopa-drill 的口吻，研学用考场上的说法
  const WORDS = {
    scholar: { ng: '失误', clean: '一次通过', done: '完成', comboEnd: '连击中断', timeout: '连击超时' },
    arcade: { ng: '可惜', clean: '完美', done: '过关', comboEnd: '连击结束', timeout: '连击 · 时间到' },
  };
  const SPARK = ['#a8742a', '#c9a45c', '#2f4e86', '#3f7a5a']; // 研学风格的少量火花
  const TEST = /[?&]test\b/.test(location.search);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const now = () => performance.now();
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const textOf = (p) => p.filter((x) => typeof x === 'string').join('');

  // ───────────────────────── 题目校验（声明式规则，返回 {valid, errors[]}）
  const ITEM_RULES = [
    [(it) => typeof it.id === 'string' && it.id.length > 0, () => '缺少字符串 id'],
    [(it, ctx) => ctx.chapters.has(it.chapter), (it) => `章节「${it.chapter}」不在 chapters 列表里`],
    [(it) => typeof it.q === 'string' && it.q.length > 0, () => '缺少题干 q'],
    [(it) => Array.isArray(it.b) && it.b.length > 0 && it.b.every((x) => typeof x === 'string' && x.length > 0), () => '答案 b 必须是非空字符串数组'],
    [(it) => Array.isArray(it.p) && it.p.every((x) => typeof x === 'string' || Number.isInteger(x)), () => '题面 p 只能由字符串和整数空位组成'],
    [(it) => { const s = it.p.filter(Number.isInteger); return s.length === it.b.length && s.every((v, k) => v === k); },
      (it) => `空位应按 0…${it.b.length - 1} 从左到右各出现一次，实际是 [${it.p.filter(Number.isInteger).join(',')}]`],
    [(it) => it.d == null || (Array.isArray(it.d) && it.d.every((x) => typeof x === 'string')), () => '干扰项 d 必须是字符串数组'],
    [(it) => new Set(it.b).size === it.b.length, () => '同一题里有重复答案，按词卡判定会出错'],
  ];
  function validateItem(it, ctx) {
    if (!it || typeof it !== 'object') return { valid: false, errors: ['题目不是对象'] };
    const errors = [];
    for (const [ok, msg] of ITEM_RULES) {
      let pass = false;
      try { pass = ok(it, ctx); } catch (e) { pass = false; }
      if (!pass) { errors.push(`${it.id || '(无 id)'}：${msg(it)}`); break; }
    }
    return { valid: errors.length === 0, errors };
  }

  // ───────────────────────── 本机记录
  // v2：计数器从「外储（美元）」换成「跨境收付（人民币）」，best.L 的单位变了，旧纪录不沿用；静音拆成「声音 / 背景音乐」两项
  const blankDB = () => ({ v: 2, items: {}, review: [], best: { score: 0, combo: 0, L: 0 }, plays: 0, skin: 'scholar', sound: true, bgm: false, calm: null });
  function loadDB() {
    const d = blankDB();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object') return d;
    if (raw.items && typeof raw.items === 'object') d.items = raw.items;
    if (Array.isArray(raw.review)) d.review = raw.review.filter((x) => typeof x === 'string');
    if (raw.best && typeof raw.best === 'object') for (const k of ['score', 'combo', 'L']) if (Number.isFinite(raw.best[k])) d.best[k] = raw.best[k];
    if (raw.v !== 2) d.best.L = 0;
    if (Number.isFinite(raw.plays)) d.plays = raw.plays;
    d.skin = raw.skin === 'arcade' ? 'arcade' : 'scholar';
    d.sound = raw.v === 2 ? raw.sound !== false : raw.mute !== true;
    d.bgm = raw.bgm === true;
    d.calm = typeof raw.calm === 'boolean' ? raw.calm : null;
    return d;
  }
  let DB = loadDB();
  function saveDB() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { /* 隐私模式等：照玩，只是不留记录 */ } }
  // 题目 id 是文本哈希，原文一改 id 就变：丢掉已经不存在的记录
  function pruneDB(ids) {
    for (const k of Object.keys(DB.items)) if (!ids.has(k)) delete DB.items[k];
    DB.review = DB.review.filter((k) => ids.has(k));
  }
  const isMastered = (id) => !!(DB.items[id] && DB.items[id].last === 1);
  const attempts = (id) => (DB.items[id] && DB.items[id].n) || 0;
  function record(id, clean) {
    const r = DB.items[id] || (DB.items[id] = { n: 0, c: 0, last: 0 });
    r.n++; if (clean) r.c++; r.last = clean ? 1 : 0; r.at = Date.now();
    DB.review = DB.review.filter((k) => k !== id);
    if (!clean) { DB.review.push(id); if (DB.review.length > REVIEW_MAX) DB.review.splice(0, DB.review.length - REVIEW_MAX); }
    saveDB();
  }

  // ───────────────────────── 跨境收付（演出用数值，和得分无关）
  // 内部存常用对数 L，显示 10^L 元。基本题按完成进度走一条曲线，连击给倍率；加时赛接着往上爬，封顶 52.3 万亿元。
  // 早先用的是「外储」，但外储一章的总纲恰恰是「不是攒下的钱，是向美元体系交的贡」，拿它当奖励正好奖励了要纠正的直觉。
  const basicCurve = (f) => 5.8 * Math.pow(clamp(f, 0, 1), 1.15);
  const extraCurve = (n) => 5.8 + 2.65 * (1 - Math.exp(-n / 6));
  const comboMult = (c) => 1 + Math.min(1, Math.max(0, c) / 20);
  function fmtMoney(L) {
    if (L >= L_MAX - 1e-9) return '¥52.3万亿';
    const v = Math.pow(10, L);
    if (v < 1e4) return '¥' + Math.round(v);
    const [unit, div] = v >= 1e12 ? ['万亿', 1e12] : v >= 1e8 ? ['亿', 1e8] : ['万', 1e4];
    const x = v / div;
    return '¥' + (x < 10 ? String(Math.floor(x * 10) / 10) : String(Math.floor(x))) + unit;
  }
  const fmtMult = (c) => (c >= 20 ? '×2 MAX' : '×' + comboMult(c).toFixed(2).replace(/0$/, ''));

  // ───────────────────────── 粒子层
  const PAPER = ['#ff7ab6', '#3b6bff', '#ffd23f', '#3fdcb0', '#a77bff', '#ffffff'];
  const INK = '#1b1d4d';
  class FX {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.parts = []; this.motion = 1; this.max = 360; this.dirty = false; }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr; this.c.width = Math.round(innerWidth * dpr); this.c.height = Math.round(innerHeight * dpr);
    }
    n(k) { return Math.max(1, Math.round(k * this.motion)); }
    add(p) { if (this.parts.length >= this.max) this.parts.splice(0, 16); p.age = 0; this.parts.push(p); }
    burst(x, y, { count = 18, speed = 380, kinds = ['confetti'], spread = Math.PI * 2, angle = -Math.PI / 2, up = 0, size = 1, colors = null } = {}) {
      for (let i = 0, n = this.n(count); i < n; i++) {
        const kind = pickOne(kinds), a = angle + (Math.random() - 0.5) * spread, v = speed * rand(0.35, 1);
        const p = { kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, rot: rand(0, 6.28), vr: rand(-10, 10), flip: rand(0, 6.28), vf: rand(6, 14),
          color: pickOne(colors || PAPER), size: size * rand(0.7, 1.3), life: rand(1.2, 2.2), g: 900, drag: 0.8 };
        if (kind === 'star') { p.life = rand(0.7, 1.3); p.g = 420; p.drag = 1.6; p.color = pickOne(colors || ['#ffd23f', '#ffffff', '#ff9ccc', '#8fb4ff']); }
        if (kind === 'spark') { p.life = rand(0.3, 0.6); p.g = 200; p.drag = 2.4; p.color = pickOne(colors || ['#ffffff', '#ffe98a', '#ffd23f']); }
        if (kind === 'coin') { p.life = rand(1.4, 2.2); p.g = 1200; p.drag = 0.3; }
        this.add(p);
      }
    }
    ring(x, y, { color = '#ffffff', radius = 80, width = 7, life = 0.45 } = {}) { this.add({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 0, color, radius, width, life }); }
    text(x, y, str, { color = '#ffffff', size = 20, life = 1, vy = -80 } = {}) { this.add({ kind: 'text', x, y, vx: 0, vy, g: 0, drag: 1.2, str, color, size, life }); }
    rain(n) {
      for (let i = 0, k = this.n(n); i < k; i++) {
        this.add({ kind: 'coin', x: rand(0, innerWidth), y: rand(-80, -10), vx: rand(-40, 40), vy: rand(0, 120), g: 900, drag: 0.2, rot: 0, vr: 0,
          flip: rand(0, 6.28), vf: rand(5, 10), size: rand(0.8, 1.3), life: rand(1.6, 2.4), color: '#ffd23f' });
      }
    }
    fireworks(n) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const x = rand(innerWidth * 0.15, innerWidth * 0.85), y = rand(innerHeight * 0.12, innerHeight * 0.4);
          this.burst(x, y, { count: 34, speed: 420, kinds: ['star', 'spark', 'confetti'], up: 40 });
          this.ring(x, y, { color: pickOne(PAPER), radius: 110 });
        }, i * 220);
      }
    }
    step(dt) {
      const g = this.g;
      if (!this.parts.length) { if (this.dirty) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; } return; }
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const keep = [];
      for (const p of this.parts) {
        p.age += dt; if (p.age >= p.life) continue;
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt; p.flip += (p.vf || 0) * dt;
        const t = p.age / p.life;
        g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        drawPart(g, p, t);
        keep.push(p);
      }
      g.globalAlpha = 1; this.parts = keep; this.dirty = true;
    }
  }
  function starPath(g, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath();
  }
  function drawPart(g, p, t) {
    const s = p.size || 1;
    switch (p.kind) {
      case 'confetti':
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.flip));
        g.fillStyle = p.color; g.fillRect(-5 * s, -3 * s, 10 * s, 6 * s); g.restore(); break;
      case 'star':
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); starPath(g, 8 * s);
        g.fillStyle = p.color; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); g.restore(); break;
      case 'spark':
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        g.lineWidth = 2.5; g.strokeStyle = p.color; g.lineCap = 'round'; g.stroke(); break;
      case 'coin':
        g.save(); g.translate(p.x, p.y); g.scale(Math.max(0.15, Math.abs(Math.cos(p.flip))), 1);
        g.beginPath(); g.arc(0, 0, 10 * s, 0, Math.PI * 2); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
        g.fillStyle = INK; g.font = `900 ${Math.round(12 * s)}px "Dela Gothic One",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', 0, 1);
        g.restore(); break;
      case 'ring': {
        const e = 1 - Math.pow(1 - t, 3);
        g.beginPath(); g.arc(p.x, p.y, p.radius * (0.3 + 0.7 * e), 0, Math.PI * 2);
        g.lineWidth = p.width * (1 - t); g.strokeStyle = p.color; g.stroke(); break;
      }
      case 'text':
        g.font = `400 ${p.size}px "Dela Gothic One","ZCOOL QingKe HuangYou","Noto Sans SC",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = INK; g.strokeText(p.str, p.x, p.y); g.fillStyle = p.color; g.fillText(p.str, p.x, p.y); break;
      default: break;
    }
  }

  // ───────────────────────── 背景：漂浮的币种符号（l1+）、旋转光芒（l3+）
  class Backdrop {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.level = 0; this.rot = 0; this.syms = []; this.motion = 1; this.dirty = false; }
    resize() { const dpr = Math.min(2, window.devicePixelRatio || 1); this.dpr = dpr; this.c.width = Math.round(innerWidth * dpr); this.c.height = Math.round(innerHeight * dpr); }
    setLevel(lv) {
      this.level = lv;
      const want = lv >= 1 ? 4 + lv * 4 : 0;
      while (this.syms.length < want) this.syms.push(this.sym(true));
      this.syms.length = Math.min(this.syms.length, want);
    }
    sym(init) {
      return { ch: pickOne(['¥', '¥', '$', '€', '£', '金']), x: rand(0, innerWidth), y: init ? rand(0, innerHeight) : innerHeight + 40, v: rand(14, 40),
        r: rand(-0.4, 0.4), vr: rand(-0.3, 0.3), s: rand(20, 40), c: pickOne(['#3b6bff', '#ff7ab6', '#ffd23f', '#3fdcb0', '#a77bff']) };
    }
    step(dt) {
      const g = this.g;
      if (!this.level) { if (this.dirty) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); this.dirty = false; } return; }
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.c.width, this.c.height); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.dirty = true;
      const W = innerWidth, H = innerHeight;
      if (this.level >= 3) {
        this.rot += dt * (0.06 + 0.03 * this.level) * this.motion;
        const cx = W / 2, cy = H * 0.45, R = Math.hypot(W, H), n = 18, alpha = [0, 0, 0, 0.07, 0.1, 0.14, 0.18][this.level];
        for (let i = 0; i < n; i++) {
          const a0 = this.rot + (i * 2 * Math.PI) / n;
          g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a0 + Math.PI / n); g.closePath();
          g.fillStyle = this.level >= 6 ? `hsla(${(i * 40 + this.rot * 60) % 360},90%,62%,${alpha})` : i % 2 ? `rgba(59,107,255,${alpha})` : `rgba(255,122,182,${alpha})`;
          g.fill();
        }
      }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const s of this.syms) {
        s.y -= s.v * dt * this.motion; s.r += s.vr * dt * this.motion;
        if (s.y < -50) Object.assign(s, this.sym(false));
        g.save(); g.translate(s.x, s.y); g.rotate(s.r); g.globalAlpha = 0.3;
        g.font = `400 ${s.s}px "Dela Gothic One","ZCOOL QingKe HuangYou",sans-serif`; g.lineWidth = 4; g.strokeStyle = INK; g.strokeText(s.ch, 0, 0);
        g.fillStyle = s.c; g.fillText(s.ch, 0, 0); g.restore();
      }
      g.globalAlpha = 1;
    }
  }

  // ───────────────────────── 声音：全部 Web Audio 现场合成，没有音频文件
  const PENTA = [0, 2, 4, 7, 9];
  const PROG = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]; // C – Am – F – G（MIDI）
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  class Sound {
    constructor() { this.ctx = null; this.muted = false; this.level = 0; this.timer = null; this.bpm = 112; }
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended' && !this.held) this.ctx.resume().catch(() => {}); return true; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.bgm = c.createGain(); this.bgm.gain.value = 0.5; this.bgm.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const ch = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      return true;
    }
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02); }
    hold(on) { this.held = on; if (!this.ctx) return; (on ? this.ctx.suspend() : this.ctx.resume()).catch(() => {}); }
    tone(f, t, dur, { type = 'triangle', gain = 0.3, attack = 0.004, glide = 0, bus = this.sfx, lp = 0 } = {}) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (lp) { const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = lp; o.connect(flt); node = flt; }
      node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    }
    noise(t, dur, { gain = 0.2, type = 'highpass', freq = 6000, q = 0.7, bus = this.sfx, sweep = 0 } = {}) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
    }
    ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }
    correct(combo) {
      if (!this.ok()) return; const t = this.ctx.currentTime, i = Math.max(0, combo - 1);
      const m = 72 + PENTA[i % 5] + 12 * (Math.floor(i / 5) % 3);
      this.tone(hz(m), t, 0.2, { gain: 0.28 }); this.tone(hz(m + 12), t, 0.12, { type: 'sine', gain: 0.1 });
      if (combo >= 10) this.noise(t, 0.12, { gain: 0.05, freq: 8000 });
    }
    wrong() {
      if (!this.ok()) return; const t = this.ctx.currentTime;
      this.tone(330, t, 0.24, { type: 'sine', gain: 0.32, glide: 170 }); this.tone(262, t + 0.09, 0.22, { type: 'sine', gain: 0.22, glide: 140 });
      this.bgm.gain.cancelScheduledValues(t); this.bgm.gain.setTargetAtTime(0.16, t, 0.02); this.bgm.gain.setTargetAtTime(0.5, t + 0.35, 0.2);
    }
    drop() { if (!this.ok()) return; const t = this.ctx.currentTime; this.tone(523, t, 0.18, { type: 'sine', gain: 0.14, glide: 330 }); }
    complete(clean) {
      if (!this.ok()) return; const t = this.ctx.currentTime;
      [72, 76, 79, 84].forEach((m, k) => this.tone(hz(m), t + k * 0.06, 0.32, { gain: 0.2 }));
      if (clean) { this.tone(hz(91), t + 0.26, 0.5, { type: 'sine', gain: 0.1 }); this.noise(t + 0.2, 0.4, { gain: 0.06, freq: 9000 }); }
    }
    fanfare() {
      if (!this.ok()) return; const t = this.ctx.currentTime;
      [[67, 71, 74], [72, 76, 79]].forEach((ch, k) => ch.forEach((m) => this.tone(hz(m), t + k * 0.16, k ? 0.6 : 0.16, { type: 'sawtooth', gain: 0.09, lp: 2600 })));
      this.noise(t, 0.5, { gain: 0.1, type: 'bandpass', freq: 1500, sweep: 6000 });
    }
    chime() {
      if (!this.ok()) return; const t = this.ctx.currentTime;
      [79, 84, 88].forEach((m, k) => this.tone(hz(m), t + k * 0.08, 0.45, { type: 'sine', gain: 0.12 }));
    }
    whoosh() { if (!this.ok()) return; this.noise(this.ctx.currentTime, 0.35, { gain: 0.08, type: 'bandpass', freq: 600, sweep: 4000, q: 1.2 }); }
    tick() { if (!this.ok()) return; this.tone(1568, this.ctx.currentTime, 0.05, { type: 'square', gain: 0.05 }); }
    timeUp() { if (!this.ok()) return; const t = this.ctx.currentTime; [76, 72, 67].forEach((m, k) => this.tone(hz(m), t + k * 0.12, 0.3, { type: 'square', gain: 0.07, lp: 2000 })); }
    jingle() {
      if (!this.ok()) return; const t = this.ctx.currentTime;
      [67, 72, 76, 79, 84, 79, 84].forEach((m, k) => this.tone(hz(m), t + k * 0.09, k === 6 ? 0.7 : 0.16, { gain: 0.2 }));
    }
    startBgm() {
      if (!this.ctx || this.timer) return;
      this.step = 0; this.nextT = this.ctx.currentTime + 0.08;
      this.timer = setInterval(() => this.schedule(), 25);
    }
    stopBgm() { clearInterval(this.timer); this.timer = null; }
    schedule() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const spb = 60 / (this.level >= 6 ? 120 : this.bpm) / 4;
      if (this.nextT < this.ctx.currentTime - 0.2) this.nextT = this.ctx.currentTime + 0.02;
      while (this.nextT < this.ctx.currentTime + 0.12) { this.play16(this.step, this.nextT); this.nextT += spb; this.step = (this.step + 1) % 64; }
    }
    // 底层和弦常驻；kick（l2）→ 反拍镲（l3）→ 贝斯（l4）→ 拍手 + 和弦切分（l5）→ 琶音（l6）
    play16(s, t) {
      const lv = this.level, i = s % 16, chord = PROG[Math.floor(s / 16) % 4], b = this.bgm;
      if (i === 0) chord.forEach((m) => this.tone(hz(m + 12), t, 1.9, { type: 'sine', gain: 0.045, attack: 0.08, bus: b }));
      if (lv >= 1 && (i === 6 || i === 14)) this.tone(hz(chord[2] + 24), t, 0.12, { gain: 0.05, bus: b });
      if (lv >= 2 && i % 4 === 0) { this.tone(150, t, 0.22, { type: 'sine', gain: 0.55, glide: 45, bus: b }); }
      if (lv >= 3 && i % 4 === 2) this.noise(t, 0.05, { gain: 0.07, freq: 7500, bus: b });
      if (lv >= 4 && i % 2 === 0) this.tone(hz(chord[0] - 12 + (i % 8 === 6 ? 7 : 0)), t, 0.16, { type: 'sawtooth', gain: 0.1, lp: 520, bus: b });
      if (lv >= 5) {
        if (i === 4 || i === 12) this.noise(t, 0.12, { gain: 0.16, type: 'bandpass', freq: 1400, q: 0.9, bus: b });
        if (i === 3 || i === 11) chord.forEach((m) => this.tone(hz(m + 12), t, 0.1, { type: 'square', gain: 0.025, lp: 2400, bus: b }));
      }
      if (lv >= 6) this.tone(hz(chord[i % 3] + 24 + (i % 6 >= 3 ? 12 : 0)), t, 0.09, { type: 'square', gain: 0.03, lp: 3200, bus: b });
    }
  }

  // ───────────────────────── 状态
  const fx = new FX($('#fx'));
  const bg = new Backdrop($('#bg'));
  const sound = new Sound();
  const S = {
    items: [], byId: new Map(), chapters: [], chapterById: new Map(), ready: false,
    screen: 'title', mode: 'mix', chapter: null, queue: [], qi: 0, item: null,
    words: [], used: new Set(), slot: 0, slotMiss: 0, itemMiss: 0,
    ok: 0, ng: 0, combo: 0, maxCombo: 0, L: 0, lv: 0,
    deadline: 0, window: 1, phase: 'basic', t0: 0, target: 0, basicMs: 0,
    extraEnd: 0, extraSolved: 0, extraPts: 0, extraQueue: [], finished: false,
    log: [], busy: false, waitNext: false, autoAt: 0, paused: false, pauseAt: 0, pauseTotal: 0, autoPaused: false, run: 0,
    lastTick: -1, prevBest: null, firstRate: 0, canExtra: false,
  };
  let slotEls = [], bankBtns = [];

  const el = {
    pips: $('#pips'), clock: $('#clock'), clockBox: $('#clock-box'), clockLabel: $('#clock-label'),
    ok: $('#ok'), okTotal: $('#ok-total'), ng: $('#ng'), combo: $('#combo'), comboBox: $('#combo-box'), comboMult: $('#combo-mult'), comboBar: $('#combo-bar'),
    reserve: $('#reserve'), reserveBox: $('#reserve-box'), cardWrap: $('#card-wrap'), card: $('#card'),
    chapter: $('#q-chapter'), kind: $('#q-kind'), from: $('#q-from'), qno: $('#qno'), title: $('#q-title'), tip: $('#q-tip'),
    passageWrap: $('#passage-wrap'), passage: $('#passage'), memo: $('#memo'), step: $('#step'), stamp: $('#stamp'), bank: $('#bank'),
    cutins: $('#cutins'), flash: $('#flash'), quitModal: $('#quit-modal'),
  };

  // ───────────────────────── 设置
  const calm = () => (DB.calm == null ? !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) : DB.calm);
  const arcade = () => DB.skin === 'arcade';
  const W = () => WORDS[DB.skin] || WORDS.scholar;
  function settingValue(key) {
    if (key === 'skin') return DB.skin;
    if (key === 'sound') return DB.sound ? 'on' : 'off';
    if (key === 'bgm') return DB.bgm ? 'on' : 'off';
    if (key === 'motion') return calm() ? 'calm' : 'full';
    return '';
  }
  function applySettings() {
    const body = document.body;
    body.classList.toggle('skin-scholar', !arcade());
    body.classList.toggle('skin-arcade', arcade());
    sound.setMuted(!DB.sound);
    for (const b of $$('.mute-btn')) { b.setAttribute('aria-pressed', String(!DB.sound)); b.setAttribute('aria-label', DB.sound ? '关闭声音' : '打开声音'); }
    for (const g of $$('.seg[data-set]')) for (const b of g.querySelectorAll('button[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === settingValue(g.dataset.set)));
    for (const n of $$('[data-w]')) n.textContent = W()[n.dataset.w] || '';
    const c = calm();
    body.classList.toggle('calm', c);
    fx.motion = c ? 0.25 : 1; bg.motion = c ? 0.2 : 1;
    if (!arcade()) bg.setLevel(0);
  }

  // ───────────────────────── 标题页
  function renderTitle() {
    $('#best-score').textContent = DB.best.score ? DB.best.score : '—';
    $('#best-combo').textContent = DB.best.combo || 0;
    $('#best-res').textContent = DB.best.L ? fmtMoney(DB.best.L) : '—';
    const rc = DB.review.length;
    $('#start-review').hidden = !rc; $('#review-count').textContent = rc;
    if (!S.ready) return;
    const total = S.items.length;
    $('#facts').textContent = `${total} 题 · ${S.items.reduce((n, it) => n + it.b.length, 0)} 个空 · 已掌握 ${S.items.filter((it) => isMastered(it.id)).length}`;
    $('#start-mix').disabled = false;
    $('#start-sub').textContent = `四章混合 · ${Math.min(BASIC_N, total)} 题 · 没掌握的优先`;
    $('#chapters').innerHTML = S.chapters.map((ch) => {
      const list = S.items.filter((it) => it.chapter === ch.id), m = list.filter((it) => isMastered(it.id)).length;
      return `<button type="button" class="ch-card${m === list.length && list.length ? ' all' : ''}" data-ch="${esc(ch.id)}" style="--c:${CHAPTER_COLORS[DB.skin][ch.id] || '#a77bff'}">
        <span class="ch-name">${esc(ch.label)}</span>
        <span class="ch-meta">考频 ${esc(ch.freq || '—')} · ${esc(ch.gameTitle || '')}</span>
        <span class="ch-bar"><i style="width:${list.length ? (m / list.length) * 100 : 0}%"></i></span>
        <span class="ch-num"><span>已掌握</span><b>${m}/${list.length}</b></span>
      </button>`;
    }).join('');
  }

  function show(screen) {
    S.screen = screen;
    $('#screen-title').classList.toggle('is-active', screen === 'title');
    $('#screen-play').classList.toggle('is-active', screen === 'play');
    $('#screen-result').classList.toggle('is-active', screen === 'result');
    document.body.classList.toggle('in-game', screen !== 'title');
    if (screen !== 'play') { cutQ.length = 0; el.cutins.textContent = ''; } // 对局里排队的提示条不带到结算页
    if (screen === 'title') { setLevel(0); renderTitle(); window.scrollTo(0, 0); }
  }

  // ───────────────────────── 开局
  function pickMix() {
    // 没掌握的优先，其次做得少的；打乱后排序，同档随机
    const ranked = shuffle(S.items).sort((a, b) => (isMastered(a.id) - isMastered(b.id)) || (attempts(a.id) - attempts(b.id)));
    return shuffle(ranked.slice(0, Math.min(BASIC_N, ranked.length)));
  }
  function buildQueue(mode, chapterId) {
    if (mode === 'review') return DB.review.slice(-REVIEW_N).reverse().map((id) => S.byId.get(id)).filter(Boolean);
    if (mode === 'chapter') return shuffle(S.items.filter((it) => it.chapter === chapterId));
    return pickMix();
  }
  function startRun(mode, chapterId) {
    if (!S.ready) return;
    const queue = buildQueue(mode, chapterId);
    if (!queue.length) { renderTitle(); return; }
    sound.ensure();
    S.run++;
    Object.assign(S, {
      mode, chapter: chapterId || null, queue, qi: 0, phase: 'basic', ok: 0, ng: 0, combo: 0, maxCombo: 0, L: 0,
      log: [], extraSolved: 0, extraPts: 0, extraQueue: [], extraEnd: 0, finished: false, t0: 0, basicMs: 0,
      busy: true, waitNext: false, autoAt: 0, paused: false, autoPaused: false, item: null,
      prevBest: { ...DB.best },
    });
    S.target = Math.ceil(queue.reduce((t, it) => t + 10 + 6 * it.b.length, 0) / 10) * 10000;
    setLevel(0);
    show('play');
    el.clockLabel.textContent = `目标 ${fmtClock(S.target)}`; el.clock.textContent = '0:00'; el.clockBox.classList.remove('hurry');
    el.bank.innerHTML = ''; el.passage.textContent = ''; el.title.textContent = ''; el.tip.hidden = true; el.memo.hidden = true; el.step.textContent = '';
    el.chapter.textContent = mode === 'chapter' ? (S.chapterById.get(chapterId) || {}).label || '' : mode === 'review' ? '错题复习' : '四章混合';
    el.from.textContent = ''; el.qno.textContent = '';
    renderPips(); updateHud();
    const intro = mode === 'review' ? `错题复习 · ${queue.length} 题` : `${queue.length} 题 · 目标 ${fmtClock(S.target)}`;
    if (DB.bgm) sound.startBgm();
    if (arcade()) {
      cutin('READY', intro);
      later(() => { cutin('GO!', '', 'pink'); }, 700);
      later(() => { S.t0 = now(); loadItem(queue[0]); }, 1150);
    } else {
      cutin('开始', intro);
      later(() => { S.t0 = now(); loadItem(queue[0]); }, 500);
    }
  }
  // 只在本局对局里、且不在暂停中走的定时器：暂停多久就顺延多久；换了一局（S.run 变了）就作废
  function later(fn, ms) {
    const due = now() + ms, base = S.pauseTotal, token = S.run;
    const run = () => {
      if (S.screen !== 'play' || S.run !== token) return;
      if (S.paused) { setTimeout(run, 120); return; }
      const left = due + (S.pauseTotal - base) - now();
      if (left > 8) { setTimeout(run, left); return; }
      fn();
    };
    setTimeout(run, ms);
  }

  function loadItem(it) {
    if (S.screen !== 'play' || !it) return;
    S.item = it; S.slot = 0; S.slotMiss = 0; S.itemMiss = 0; S.waitNext = false; S.autoAt = 0;
    S.words = shuffle([...new Set([...it.b, ...(it.d || [])])]);
    S.used = new Set();
    const ch = S.chapterById.get(it.chapter) || {};
    el.chapter.textContent = ch.label || '';
    el.kind.hidden = it.kind !== 'order';
    el.from.textContent = it.from || '';
    el.qno.textContent = S.phase === 'basic' ? `第${S.qi + 1}题` : `加时${S.extraSolved + 1}`;
    el.title.textContent = it.q;
    el.tip.hidden = !it.hint; el.tip.textContent = it.hint || '';
    const slotHTML = (x) => {
      const w = clamp(it.b[x].length * 1.05 + 0.9, 2.6, 9);
      return `<span class="slot" data-i="${x}" style="--w:${w.toFixed(2)}em" aria-label="第 ${x + 1} 空"><span class="slot-t"></span></span>`;
    };
    // 排序题一步一行（编号 + 空位），长步骤在空位里折行，不会把编号和空位拆到两行
    el.passage.innerHTML = it.kind === 'order'
      ? `<ol class="steps">${it.b.map((_, k) => `<li><span class="step-n">${CIRCLED[k] || k + 1}</span>${slotHTML(k)}</li>`).join('')}</ol>`
      : it.p.map((x) => (typeof x === 'string' ? esc(x).replace(/\n/g, '<br>') : slotHTML(x))).join('');
    slotEls = [...el.passage.querySelectorAll('.slot')];
    el.memo.hidden = true; el.memo.innerHTML = '';
    el.stamp.className = 'stamp'; el.stamp.textContent = '';
    el.passageWrap.scrollTop = 0;
    el.card.classList.remove('enter'); void el.card.offsetWidth; el.card.classList.add('enter');
    renderBank();
    markCurrent();
    renderPips();
    S.busy = false;
    armCombo();
  }
  function renderBank() {
    el.bank.classList.toggle('two', S.words.some((w) => w.length > 7));
    el.bank.innerHTML = S.words.map((w, i) => {
      const k = KEYS[i];
      return `<button type="button" class="word${w.length > 13 ? ' xlong' : ''}" data-i="${i}" aria-label="${k ? `词卡 ${k}：` : ''}${esc(w)}">${k ? `<b class="k" aria-hidden="true">${k}</b>` : ''}<span>${esc(w)}</span></button>`;
    }).join('');
    bankBtns = [...el.bank.children];
  }
  function markCurrent() {
    slotEls.forEach((s, k) => s.classList.toggle('cur', k === S.slot));
    for (const b of bankBtns) b.classList.remove('hint');
    const cur = slotEls[S.slot];
    el.step.innerHTML = `第 <b>${S.slot + 1}</b> 空 · 共 <b>${S.item.b.length}</b> 空`;
    if (cur) {
      // 让当前空位露在可视区里（长题在小屏上要滚动）
      const wr = el.passageWrap.getBoundingClientRect(), r = cur.getBoundingClientRect();
      if (r.bottom > wr.bottom - 8 || r.top < wr.top) el.passageWrap.scrollTop += r.top - wr.top - wr.height / 3;
    }
  }
  // 连击时限：第一个空要先读题，按全文长度放宽；之后按两个空之间的文字量
  function windowFor(slot) {
    const p = S.item.p;
    const read = 30 * S.item.b[slot].length; // 词卡也要读：排序题的步骤动辄十几个字
    if (slot === 0) return clamp(5000 + 45 * (textOf(p).length + S.item.q.length) + read, 6000, 12000);
    let on = false, chars = 0;
    for (const x of p) { if (x === slot - 1) on = true; else if (x === slot) break; else if (on && typeof x === 'string') chars += x.length; }
    return clamp(4000 + 45 * chars + read, 4000, 8000);
  }
  function armCombo() { S.window = windowFor(S.slot); S.deadline = now() + S.window; }

  // ───────────────────────── 作答
  function choose(i) {
    if (S.screen !== 'play' || S.busy || S.paused || S.waitNext || !S.item) return;
    const w = S.words[i];
    if (w == null || S.used.has(i)) return;
    sound.ensure();
    if (w === S.item.b[S.slot]) good(i); else bad(i);
  }
  function good(i) {
    const btn = bankBtns[i], slotEl = slotEls[S.slot], it = S.item;
    S.used.add(i); btn.classList.add('used'); btn.disabled = true; btn.classList.remove('hint', 'nope');
    clearTimeout(S.nopeTimer);
    slotEl.classList.remove('cur', 'nope'); slotEl.querySelector('.slot-t').textContent = it.b[S.slot];
    slotEl.classList.add('done'); slotEl.classList.remove('pop'); void slotEl.offsetWidth; slotEl.classList.add('pop');
    S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
    const m = it.b.length, s = S.slot + 1;
    const base = S.phase === 'basic'
      ? basicCurve((S.qi + s / m) / S.queue.length) - basicCurve((S.qi + (s - 1) / m) / S.queue.length)
      : (extraCurve(S.extraSolved + 1) - extraCurve(S.extraSolved)) / m;
    const prevL = S.L;
    S.L = Math.min(L_MAX, S.L + Math.max(0.004, base) * comboMult(S.combo));
    // 演出：街机每填一格都放；研学只靠空位本身的动画，特效留给一题做完与里程碑
    if (arcade()) {
      const r = slotEl.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, lv = S.lv;
      fx.burst(x, y, { count: 8 + lv * 5, speed: 260 + lv * 40, kinds: lv >= 2 ? ['confetti', 'star', 'spark'] : ['confetti', 'spark'] });
      fx.ring(x, y, { color: '#ffd23f', radius: 46 + lv * 8 });
      if (S.combo >= 2) fx.text(x, y - 26, String(S.combo), { color: S.combo >= 20 ? '#ffd23f' : '#ff7ab6', size: 18 + Math.min(16, S.combo / 3) });
      if (lv >= 5) fx.rain(2 + lv);
      if (lv >= 4 && !calm()) { el.cardWrap.classList.remove('kick'); void el.cardWrap.offsetWidth; el.cardWrap.classList.add('kick'); }
    }
    bump(el.reserveBox);
    sound.correct(S.combo);
    for (const [a, label] of MILESTONES) if (prevL < a && S.L >= a) milestone(`跨境收付突破 ${label}`);
    if (prevL < L_MAX && S.L >= L_MAX) milestone('追平 52.3 万亿元', '2023 年全年银行代客人民币跨境收付（含资本项目）', 'gold');
    if (COMBO_MARKS.includes(S.combo) || (S.combo > 100 && S.combo % 50 === 0)) comboParty();
    updateLevel(); updateHud();
    S.slot++; S.slotMiss = 0;
    if (S.slot >= m) completeItem(); else { markCurrent(); armCombo(); }
  }
  function bad(i) {
    const btn = bankBtns[i], slotEl = slotEls[S.slot];
    S.ng++; S.slotMiss++; S.itemMiss++;
    if (S.combo >= 5) floatNote(`${S.combo} ${W().comboEnd}`);
    S.combo = 0;
    btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope');
    const t = slotEl.querySelector('.slot-t');
    slotEl.classList.remove('nope'); void slotEl.offsetWidth; slotEl.classList.add('nope'); t.textContent = S.words[i];
    clearTimeout(S.nopeTimer);
    S.nopeTimer = setTimeout(() => { if (!slotEl.classList.contains('done')) { t.textContent = ''; slotEl.classList.remove('nope'); } btn.classList.remove('nope'); }, 650);
    if (S.slotMiss >= 2) { const k = S.words.indexOf(S.item.b[S.slot]); if (bankBtns[k]) bankBtns[k].classList.add('hint'); }
    bump(el.ng.parentElement);
    sound.wrong();
    updateHud();
  }
  function completeItem() {
    const it = S.item, clean = S.itemMiss === 0;
    S.busy = true; S.waitNext = true;
    S.log.push({ it, clean, misses: S.itemMiss, phase: S.phase });
    record(it.id, clean);
    if (S.phase === 'basic') S.ok++; else { S.extraPts += 10 + 5 * S.extraSolved; S.extraSolved++; }
    renderPips(); updateHud();
    for (const s of slotEls) s.classList.remove('cur');
    el.step.innerHTML = clean ? `${W().clean} · 记为<b>已掌握</b>` : `${W().ng} <b>${S.itemMiss}</b> 次 · 已放进错题复习`;
    el.stamp.textContent = clean ? W().clean : W().done;
    el.stamp.className = 'stamp' + (clean ? ' clean' : ''); void el.stamp.offsetWidth; el.stamp.classList.add('show');
    const r = el.card.getBoundingClientRect();
    if (arcade()) {
      fx.burst(r.left + r.width / 2, r.top + r.height * 0.4, clean
        ? { count: 30 + S.lv * 6, speed: 540, kinds: ['star', 'confetti', 'spark'], up: 80 }
        : { count: 14, speed: 420, kinds: ['confetti'], up: 60 });
    } else if (clean) {
      fx.burst(r.left + r.width / 2, r.top + r.height * 0.35, { count: 12, speed: 260, kinds: ['spark', 'star'], up: 40, size: 0.8, colors: SPARK });
    }
    sound.complete(clean);
    if (it.s) {
      el.memo.innerHTML = `<b>记忆</b>${esc(it.s)}`; el.memo.hidden = false;
      // 记忆点放得下就滚到底；比可视区还高时，把它的开头对齐到顶部，从头读
      requestAnimationFrame(() => {
        const wrap = el.passageWrap, top = el.memo.offsetTop - wrap.offsetTop - 6;
        wrap.scrollTop = el.memo.offsetHeight + 12 > wrap.clientHeight ? top : wrap.scrollHeight;
      });
    }
    // 一次全对就自动下一题；出过错的停下来，让人把记忆点读完
    const last = S.phase === 'basic' && S.qi + 1 >= S.queue.length;
    const auto = S.phase === 'extra' ? (clean ? 700 : 1600) : clean ? 1500 : 0;
    el.bank.innerHTML = `<button type="button" class="big-btn next-btn" id="next-btn">${last ? '看成绩 ›' : auto ? '下一题 ›' : '看完了 · 下一题 ›'}<small>Enter / 空格</small><i class="auto"></i></button>`;
    bankBtns = [];
    if (auto) {
      S.autoAt = now() + auto;
      const bar = el.bank.querySelector('.auto'); bar.style.setProperty('--ms', `${auto}ms`);
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('run')));
    } else S.autoAt = 0;
  }
  function goNext() {
    if (!S.waitNext || S.paused) return;
    S.waitNext = false; S.autoAt = 0;
    if (S.phase === 'basic') {
      S.qi++;
      if (S.qi >= S.queue.length) { finishBasic(); return; }
      loadItem(S.queue[S.qi]);
    } else if (!S.finished) loadItem(nextExtraItem());
  }

  // ───────────────────────── 演出小件
  function bump(node) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  function floatNote(text) { if (!arcade()) return; const r = el.comboBox.getBoundingClientRect(); fx.text(r.left + r.width / 2, r.bottom + 14, text, { color: '#a77bff', size: 16, vy: 30, life: 1.1 }); }
  const cutQ = []; let cutBusy = false;
  function cutin(text, sub, tone) { cutQ.push({ text, sub, tone }); if (!cutBusy) runCut(); }
  function runCut() {
    const c = cutQ.shift();
    if (!c) { cutBusy = false; return; }
    cutBusy = true;
    const d = document.createElement('div');
    d.className = 'cut' + (c.tone ? ' ' + c.tone : '');
    d.innerHTML = `<b>${esc(c.text)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}`;
    el.cutins.appendChild(d); if (arcade()) sound.whoosh();
    const [life, gap] = arcade() ? [1200, 650] : [1500, 1100]; // 研学的提示条停得久一点，也不叠在一起
    setTimeout(() => d.remove(), life);
    setTimeout(runCut, gap);
  }
  function flash() { if (calm() || !arcade()) return; el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); }
  function milestone(text, sub, tone) {
    cutin(text, sub || '', tone || 'gold');
    if (arcade()) { fx.fireworks(3); flash(); sound.fanfare(); } else { sparkle(); sound.chime(); }
  }
  function sparkle() {
    const r = el.reserveBox.getBoundingClientRect();
    fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 10, speed: 200, kinds: ['spark', 'star'], size: 0.8, colors: SPARK });
  }
  function comboParty() {
    cutin(arcade() ? `${S.combo} 连击！` : `${S.combo} 连击`, `收付增速 ${fmtMult(S.combo)}`, 'pink');
    if (arcade()) { fx.fireworks(2); sound.fanfare(); } else sound.chime();
  }
  function setLevel(lv) {
    S.lv = lv;
    for (let i = 1; i <= 6; i++) document.body.classList.toggle('l' + i, lv >= i);
    bg.setLevel(arcade() ? lv : 0); sound.level = lv;
  }
  function updateLevel() {
    let lv = 0; for (const a of LEVEL_AT) if (S.L >= a) lv++;
    if (lv > S.lv) setLevel(lv); // 一局之内只升不降
  }
  function renderFlags() {
    const colors = ['#ff7ab6', '#3b6bff', '#ffd23f', '#3fdcb0', '#a77bff'];
    let svg = '';
    for (let k = 0; k < 12; k++) {
      // 绳子是 M0 3 Q200 26 400 3 的二次贝塞尔，正中最低点 y = 14.5
      const x = 16 + k * 33, y = 3 + 11.5 * (1 - Math.pow((x - 200) / 200, 2));
      svg += `<path d="M${x - 9} ${y.toFixed(1)}L${x + 9} ${y.toFixed(1)}L${x} ${(y + 16).toFixed(1)}Z" fill="${colors[k % 5]}" stroke="#1b1d4d" stroke-width="2" stroke-linejoin="round"/>`;
    }
    $('#flags').innerHTML = svg;
  }

  // ───────────────────────── HUD
  function renderPips() {
    if (S.phase === 'extra') { el.pips.innerHTML = `<span class="extra-tag">加时赛 +<b>${S.extraPts}</b></span>`; return; }
    el.pips.innerHTML = S.queue.map((_, k) => {
      const l = S.log[k];
      return `<i class="${l ? (l.clean ? 'ok' : 'miss') : k === S.qi && S.item ? 'cur' : ''}"></i>`;
    }).join('');
  }
  function updateHud() {
    el.ok.textContent = S.phase === 'basic' ? S.ok : S.extraSolved;
    el.okTotal.textContent = S.phase === 'basic' ? `/${S.queue.length}` : '题';
    el.ng.textContent = S.ng;
    el.combo.textContent = S.combo;
    el.comboBox.classList.toggle('on', S.combo >= 2);
    el.comboBox.classList.toggle('max', S.combo >= 20);
    el.comboMult.textContent = S.combo >= 2 ? fmtMult(S.combo) : '';
    el.reserve.textContent = fmtMoney(S.L);
  }
  function tickPlay(t) {
    if (!S.busy && !S.waitNext && S.combo > 0 && t > S.deadline) {
      if (S.combo >= 5) floatNote(`${S.combo} ${W().timeout}`);
      S.combo = 0; updateHud(); sound.drop();
    }
    const left = S.combo > 0 ? (S.busy || S.waitNext ? 1 : clamp((S.deadline - t) / S.window, 0, 1)) : 0;
    el.comboBar.style.transform = `scaleX(${left.toFixed(3)})`;
    el.comboBox.classList.toggle('low', S.combo > 0 && left < 0.3);
    if (S.phase === 'basic') el.clock.textContent = S.t0 ? fmtClock(t - S.t0) : '0:00';
    else if (S.extraEnd) {
      const rem = S.extraEnd - t;
      el.clock.textContent = fmtClock(rem + 999);
      el.clockBox.classList.toggle('hurry', rem < 10000);
      const sec = Math.ceil(rem / 1000);
      if (rem < 10000 && rem > 0 && sec !== S.lastTick) { S.lastTick = sec; sound.tick(); }
      if (rem <= 0 && !S.finished) timeUp();
    }
    if (S.waitNext && S.autoAt && t >= S.autoAt) goNext();
  }

  // ───────────────────────── 结束 / 加时
  // 「新纪录」和开局前的纪录比：基本结算、加时结算各判一次，不会因为先写进 DB 就漏标
  function newBest(score) {
    DB.best.score = Math.max(DB.best.score, score);
    DB.best.combo = Math.max(DB.best.combo, S.maxCombo);
    DB.best.L = Math.max(DB.best.L, S.L);
    saveDB();
    return { score: score > S.prevBest.score, combo: S.maxCombo > S.prevBest.combo, L: S.L > S.prevBest.L + 1e-9 };
  }
  function finishBasic() {
    S.busy = true; S.basicMs = now() - S.t0;
    const basic = S.log.filter((l) => l.phase === 'basic');
    S.firstRate = basic.filter((l) => l.clean).length / Math.max(1, basic.length);
    S.canExtra = S.mode !== 'review' && S.firstRate >= EXTRA_GATE - 1e-9;
    DB.plays++;
    const nb = newBest(100);
    sound.stopBgm(); sound.jingle();
    showResult('basic', nb);
  }
  function startExtra() {
    S.run++;
    Object.assign(S, { phase: 'extra', combo: 0, extraSolved: 0, extraPts: 0, finished: false, busy: true, waitNext: false, lastTick: -1, item: null });
    const done = new Set(S.queue.map((it) => it.id));
    S.extraQueue = shuffle(S.items.filter((it) => !done.has(it.id)));
    show('play');
    el.clockLabel.textContent = '加时'; el.clockBox.classList.remove('hurry');
    el.bank.innerHTML = ''; el.memo.hidden = true;
    renderPips(); updateHud();
    S.extraEnd = now() + EXTRA_MS + EXTRA_INTRO_MS;
    cutin('加时赛', '90 秒 · 每多做一题，加分多 5', 'pink');
    if (DB.bgm) sound.startBgm();
    later(() => loadItem(nextExtraItem()), EXTRA_INTRO_MS);
  }
  function nextExtraItem() {
    if (!S.extraQueue.length) S.extraQueue = shuffle(S.items);
    return S.extraQueue.pop();
  }
  function timeUp() {
    S.finished = true; S.busy = true; S.waitNext = false; S.autoAt = 0;
    cutin('时间到', `加时 ${S.extraSolved} 题 · +${S.extraPts}`, 'gold'); sound.timeUp();
    later(finishExtra, 1300);
  }
  function finishExtra() {
    const nb = newBest(100 + S.extraPts);
    sound.stopBgm(); sound.jingle();
    showResult('final', nb);
  }
  function quitRun() {
    el.quitModal.hidden = true; resume(); sound.stopBgm(); S.busy = true; S.waitNext = false; S.run++;
    show('title');
  }

  // ───────────────────────── 结算页
  function sentenceHTML(it) {
    if (it.kind === 'order') return `<ol class="steps">${it.b.map((b, k) => `<li><span class="step-n">${CIRCLED[k] || k + 1}</span><mark>${esc(b)}</mark></li>`).join('')}</ol>`;
    return it.p.map((x) => (typeof x === 'string' ? esc(x).replace(/\n/g, '<br>') : `<mark>${esc(it.b[x])}</mark>`)).join('');
  }
  function showResult(kind, nb) {
    show('result');
    const final = kind === 'final', score = final ? 100 + S.extraPts : 100;
    const basic = S.log.filter((l) => l.phase === 'basic'), clean = basic.filter((l) => l.clean).length;
    const modeLabel = S.mode === 'chapter' ? `单章通关 · ${(S.chapterById.get(S.chapter) || {}).label || ''}` : S.mode === 'review' ? '错题复习' : '四章混合';
    $('#r-mode').textContent = modeLabel;
    $('#r-score').textContent = score;
    $('#r-break').textContent = final ? `基本 100 + 加时 ${S.extraSolved} 题 ${S.extraPts}` : '全部做完 · 基本分 100';
    const badge = (on) => (on ? '<span class="new">新纪录</span>' : '');
    $('#r-stats').innerHTML = `
      <div><small>用时</small><b>${fmtClock(S.basicMs)}</b><i>目标 ${fmtClock(S.target)}${S.basicMs <= S.target ? ' · 达成' : ''}</i></div>
      <div><small>一次全对</small><b>${clean}/${basic.length}</b><i>${Math.round(S.firstRate * 100)}%</i></div>
      <div>${badge(nb.combo)}<small>最长连击</small><b>${S.maxCombo}</b><i>${W().ng} ${S.ng} 次</i></div>
      <div>${badge(nb.L)}<small>跨境收付</small><b>${fmtMoney(S.L)}</b><i>${final ? '含加时赛' : '基本题'}</i></div>`;
    const oldBadge = $('#r-score-box .new'); if (oldBadge) oldBadge.remove();
    if (nb.score) $('#r-score-box').insertAdjacentHTML('beforeend', '<span class="new">新纪录</span>');
    const ex = $('#r-extra');
    if (!final && S.canExtra) ex.innerHTML = `<button type="button" class="big-btn" id="r-go-extra">加时赛 · 90 秒<small>一次全对率 ${Math.round(S.firstRate * 100)}% 达标，跨境收付接着涨</small></button>`;
    else if (!final && S.mode === 'review') ex.innerHTML = '<span>错题复习不设加时赛，一次做对的题已移出错题本</span>';
    else if (!final) ex.innerHTML = `<span>一次全对率 ${Math.round(S.firstRate * 100)}%，到 80% 就能解锁 90 秒加时赛</span>`;
    else ex.innerHTML = '';
    const rows = S.log.slice().sort((a, b) => (a.clean - b.clean));
    $('#r-list').innerHTML = rows.map((l) => {
      const it = l.it, ch = S.chapterById.get(it.chapter) || {};
      return `<li class="r-item ${l.clean ? 'clean' : 'miss'}">
        <div class="r-row"><span class="tag">${esc(ch.label || '')}</span>${l.phase === 'extra' ? '<span>加时</span>' : ''}${it.link ? `<a class="r-link" href="${esc(it.link)}">原文 ›</a>` : ''}<span class="mark">${l.clean ? `✓ ${W().clean}` : `✗ ${W().ng} ${l.misses}`}</span></div>
        <p class="r-q">${esc(it.q)}</p>
        <div class="r-sent">${sentenceHTML(it)}</div>
        ${it.s ? `<p class="r-memo">记忆：${esc(it.s)}</p>` : ''}
        ${it.w ? `<details><summary>解析</summary><p>${esc(it.w)}</p></details>` : ''}
      </li>`;
    }).join('');
    $('#r-scroll').scrollTop = 0;
    if (!final && S.canExtra && arcade()) fx.fireworks(2);
  }

  // ───────────────────────── 暂停（确认框、切到后台）
  function pause() { if (S.paused) return; S.paused = true; S.pauseAt = now(); sound.hold(true); }
  function resume() {
    if (!S.paused) return;
    const d = now() - S.pauseAt;
    S.paused = false; S.pauseTotal += d;
    S.deadline += d; if (S.t0) S.t0 += d; if (S.extraEnd) S.extraEnd += d; if (S.autoAt) S.autoAt += d;
    sound.hold(false);
  }

  // ───────────────────────── 主循环
  let lastFrame = now();
  function frame() {
    const t = now(), dt = Math.min(0.05, (t - lastFrame) / 1000);
    lastFrame = t;
    if (!S.paused) {
      if (S.screen === 'play') tickPlay(t);
      fx.step(dt); bg.step(dt);
    }
    requestAnimationFrame(frame);
  }

  // ───────────────────────── 事件
  function bind() {
    $('#start-mix').addEventListener('click', () => startRun('mix'));
    $('#start-review').addEventListener('click', () => startRun('review'));
    $('#chapters').addEventListener('click', (e) => { const b = e.target.closest('.ch-card'); if (b) startRun('chapter', b.dataset.ch); });
    for (const b of $$('.mute-btn')) b.addEventListener('click', () => { DB.sound = !DB.sound; saveDB(); if (DB.sound) sound.ensure(); applySettings(); });
    for (const g of $$('.seg[data-set]')) g.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const v = b.dataset.v, key = g.dataset.set;
      if (key === 'skin') DB.skin = v === 'arcade' ? 'arcade' : 'scholar';
      else if (key === 'sound') { DB.sound = v === 'on'; if (DB.sound) sound.ensure(); }
      else if (key === 'bgm') DB.bgm = v === 'on';
      else if (key === 'motion') DB.calm = v === 'calm';
      saveDB(); applySettings(); renderTitle();
    });
    el.bank.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'next-btn') goNext(); else choose(Number(b.dataset.i));
    });
    $('#quit').addEventListener('click', () => { pause(); el.quitModal.hidden = false; $('#quit-no').focus(); });
    $('#quit-no').addEventListener('click', () => { el.quitModal.hidden = true; resume(); });
    $('#quit-yes').addEventListener('click', quitRun);
    $('#r-again').addEventListener('click', () => {
      const mode = S.mode === 'review' && !DB.review.length ? 'mix' : S.mode;
      startRun(mode, S.chapter);
    });
    $('#r-home').addEventListener('click', () => show('title'));
    $('#r-extra').addEventListener('click', (e) => { if (e.target.closest('#r-go-extra')) startExtra(); });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!el.quitModal.hidden) { if (e.key === 'Escape') { el.quitModal.hidden = true; resume(); } return; }
      if (S.screen !== 'play') return;
      if (e.key === 'Escape') { e.preventDefault(); $('#quit').click(); return; }
      if (S.waitNext && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goNext(); return; }
      const k = KEYS.indexOf(e.key);
      if (k >= 0) { e.preventDefault(); choose(k); }
    });
    document.addEventListener('visibilitychange', () => {
      if (S.screen !== 'play') return;
      if (document.hidden) { if (!S.paused) { pause(); S.autoPaused = true; } }
      else if (S.autoPaused && el.quitModal.hidden) { S.autoPaused = false; resume(); }
    });
    window.addEventListener('resize', () => { fx.resize(); bg.resize(); });
  }

  async function init() {
    fx.resize(); bg.resize(); renderFlags(); applySettings(); bind(); renderTitle();
    requestAnimationFrame(frame);
    let data;
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      $('#start-sub').textContent = '题库没加载出来';
      const p = document.createElement('section');
      p.className = 'panel load-err';
      p.innerHTML = `<h2>题库加载失败</h2>没能读取 <code>${esc(DATA_URL)}</code>（${esc(e.message)}）。本地预览请用静态服务器打开仓库根目录（例如 <code>python3 -m http.server</code>），不要直接双击 HTML。`;
      $('#start-mix').after(p);
      return;
    }
    const chapters = Array.isArray(data && data.chapters) ? data.chapters.filter((c) => c && typeof c.id === 'string') : [];
    const ctx = { chapters: new Set(chapters.map((c) => c.id)) };
    const problems = [];
    S.items = (Array.isArray(data && data.items) ? data.items : []).filter((it) => { const v = validateItem(it, ctx); problems.push(...v.errors); return v.valid; });
    if (problems.length) console.warn(`[填空连击] 跳过 ${problems.length} 道有问题的题：\n${problems.join('\n')}`);
    S.chapters = chapters.filter((c) => S.items.some((it) => it.chapter === c.id));
    S.chapterById = new Map(chapters.map((c) => [c.id, c]));
    S.byId = new Map(S.items.map((it) => [it.id, it]));
    pruneDB(new Set(S.byId.keys())); saveDB();
    S.ready = S.items.length > 0;
    renderTitle();
    if (!S.ready) $('#start-sub').textContent = '题库是空的';
  }

  if (TEST) window.__cc = { S, get DB() { return DB; }, get bgmRunning() { return !!sound.timer; }, choose, goNext, startRun, startExtra, timeUp, loadItem };
  init();
})();
