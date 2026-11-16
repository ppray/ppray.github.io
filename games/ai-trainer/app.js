/**
 * 人工智能训练师（三级／高级）全真模拟考试 · 刷题与实操采分点挖空连击
 * 严格对齐原卷 24 道实操大题（01卷 1~8、09卷 1~8、07卷 1~8）及 200 道理论考题
 * 支持全本地记忆功能：刷新页面/切换标签页无缝回到上次答题位置，完整记录答题历史与错题本
 * 参考 games/cloze-combo 交互架构与视觉手感
 */
(() => {
  'use strict';

  // --- 1. Web Audio Synthesizer ---
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem('aiTrainer_muted') === 'true';
    }
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('aiTrainer_muted', this.muted);
      return !this.muted;
    }
    beep(freq, duration = 0.1, type = 'sine', gainVal = 0.15) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    }
    playCorrect() {
      // Ascending pleasant chord
      this.beep(523.25, 0.08, 'triangle', 0.18);
      setTimeout(() => this.beep(659.25, 0.08, 'triangle', 0.18), 50);
      setTimeout(() => this.beep(783.99, 0.12, 'sine', 0.2), 100);
    }
    playWrong() {
      // Soft muted buzz
      this.beep(220, 0.12, 'sawtooth', 0.12);
      setTimeout(() => this.beep(175, 0.18, 'sawtooth', 0.12), 80);
    }
    playCombo(combo) {
      // Arpeggio chime
      const base = 440 + Math.min(combo * 15, 300);
      [0, 4, 7, 12].forEach((interval, i) => {
        setTimeout(() => {
          this.beep(base * Math.pow(2, interval / 12), 0.15, 'sine', 0.22);
        }, i * 60);
      });
    }
    playWin() {
      // Victory fanfare
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => this.beep(f, 0.25, 'triangle', 0.25), i * 90);
      });
    }
  }

  const sfx = new SoundFX();

  // --- 2. Application State & Local Storage Recovery ---
  const savedClozeHistory = JSON.parse(localStorage.getItem('aiTrainer_clozeHistory') || '{}');
  const savedTheoryHistory = JSON.parse(localStorage.getItem('aiTrainer_theoryHistory') || '{}');

  const initialMode = (() => {
    const hash = (window.location && window.location.hash ? window.location.hash : '').replace('#', '');
    if (hash === 'theory' || hash === 'cloze' || hash === 'memorize') return hash;
    return localStorage.getItem('aiTrainer_mode') || 'cloze';
  })();

  const savedPassed = new Set(JSON.parse(localStorage.getItem('aiTrainer_passed') || '[]'));
  const savedMistakes = new Set(JSON.parse(localStorage.getItem('aiTrainer_mistakes') || '[]'));

  // Auto-heal / reconcile stats from theory history so nothing is ever out of sync
  Object.entries(savedTheoryHistory).forEach(([id, rec]) => {
    if (rec && rec.answered) {
      if (rec.isCorrect) {
        savedPassed.add(id);
      } else if (!savedPassed.has(id)) {
        savedMistakes.add(id);
      }
    }
  });

  const state = {
    practice: {
      qNum: parseInt(localStorage.getItem('aiTrainer_practice_q') || '1', 10),
      partNum: parseInt(localStorage.getItem('aiTrainer_practice_p') || '1', 10),
      tier: localStorage.getItem('aiTrainer_practice_tier') || 'brief'
    },
    mock: {
      timeLeft: 180 * 60,
      timerId: null,
      isRunning: false
    },
    bank: null,
    mode: initialMode, // 'cloze' | 'theory' | 'memorize'
    dirViewMode: initialMode === 'theory' ? 'theory' : 'outline',
    cloze: {
      filter: localStorage.getItem('aiTrainer_clozeFilter') || 'all', // 'all' | '01' | '09' | '07' | 'mistakes'
      list: [],
      index: 0,
      activeBlank: 0,
      filled: {}, // blankIdx -> { text, status: 'correct'|'revealed' }
      chips: [],
      mistakeSession: {},
      lastItemId: localStorage.getItem('aiTrainer_clozeItemId') || null
    },
    theory: {
      filter: localStorage.getItem('aiTrainer_theoryFilter') || 'all',
      list: [],
      index: 0,
      answered: false,
      selected: null,
      isRandom: localStorage.getItem('aiTrainer_theoryRandom') === 'true',
      autoNext: localStorage.getItem('aiTrainer_theoryAutoNext') !== 'false',
      autoNextTimer: null,
      lastNum: localStorage.getItem('aiTrainer_theoryNum') || null,
      mistakeSession: {}, // track questions answered during current mistake practice session
      lastNumByFilter: JSON.parse(localStorage.getItem('aiTrainer_theoryLastNumByFilter') || '{}')
    },
    history: {
      cloze: savedClozeHistory,   // itemId -> { filled: { [blankIdx]: { text, status } }, isCompleted: boolean }
      theory: savedTheoryHistory  // itemId -> { answered: boolean, selected: string, isCorrect: boolean, timestamp: number }
    },
    stats: {
      combo: 0,
      maxCombo: parseInt(localStorage.getItem('aiTrainer_maxCombo') || '0', 10),
      correctAttempts: parseInt(localStorage.getItem('aiTrainer_correctAttempts') || '0', 10),
      totalAttempts: parseInt(localStorage.getItem('aiTrainer_totalAttempts') || '0', 10),
      passedItems: savedPassed,
      mistakeItems: savedMistakes
    }
  };

  // Helper to persist all learning progress and history to browser localStorage
  function saveHistory() {
    try {
      localStorage.setItem('aiTrainer_mode', state.mode);
      localStorage.setItem('aiTrainer_clozeFilter', state.cloze.filter);
      if (state.cloze.list && state.cloze.list[state.cloze.index]) {
        state.cloze.lastItemId = state.cloze.list[state.cloze.index].id;
        localStorage.setItem('aiTrainer_clozeItemId', state.cloze.lastItemId);
      }
      localStorage.setItem('aiTrainer_clozeHistory', JSON.stringify(state.history.cloze));

      localStorage.setItem('aiTrainer_theoryFilter', state.theory.filter);
      if (state.theory.list && state.theory.list[state.theory.index]) {
        const num = state.theory.list[state.theory.index].num;
        state.theory.lastNum = num;
        localStorage.setItem('aiTrainer_theoryNum', num);
        state.theory.lastNumByFilter[state.theory.filter] = num;
        localStorage.setItem('aiTrainer_theoryLastNumByFilter', JSON.stringify(state.theory.lastNumByFilter));
      }
      localStorage.setItem('aiTrainer_theoryHistory', JSON.stringify(state.history.theory));

      localStorage.setItem('aiTrainer_maxCombo', state.stats.maxCombo);
      localStorage.setItem('aiTrainer_correctAttempts', state.stats.correctAttempts);
      localStorage.setItem('aiTrainer_totalAttempts', state.stats.totalAttempts);
      localStorage.setItem('aiTrainer_passed', JSON.stringify([...state.stats.passedItems]));
      localStorage.setItem('aiTrainer_mistakes', JSON.stringify([...state.stats.mistakeItems]));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  // --- 3. DOM Elements ---
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const btnSound = $('#btn-sound');
  const btnReset = $('#btn-reset');
  const modeTabs = $$('.mode-tab');
  const chapterScroll = $('#chapter-filters');

  const btnOpenDir = $('#btn-open-dir');
  const btnOpenTheoryDir = $('#btn-open-theory-dir');
  const dirModal = $('#dir-modal');
  const btnCloseDir = $('#btn-close-dir');
  const dirBody = $('#dir-body');
  const dirModalTitle = $('#dir-modal-title');
  const dirModalSubtitle = $('#dir-modal-subtitle');

  const viewCloze = $('#view-cloze');
  const viewTheory = $('#view-theory');
  const viewMemorize = $('#view-memorize');

  const statCombo = $('#stat-combo');
  const statMaxCombo = $('#stat-max-combo');
  const statAccuracy = $('#stat-accuracy');
  const statProgress = $('#stat-progress');
  const toastEl = $('#toast');

  let toastTimer = null;
  function showToast(msg, duration = 2000) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function updateHUD() {
    statCombo.textContent = state.stats.combo;
    statMaxCombo.textContent = state.stats.maxCombo;
    
    if (state.stats.totalAttempts > 0) {
      const acc = Math.round((state.stats.correctAttempts / state.stats.totalAttempts) * 100);
      statAccuracy.textContent = acc + '%';
    } else {
      statAccuracy.textContent = '100%';
    }

    const passedCount = state.stats.passedItems.size;
    const mistakeCount = state.stats.mistakeItems.size;

    const clozeAnswered = Object.keys(state.history.cloze).length;
    const theoryAnswered = Object.keys(state.history.theory).length;
    const totalAnswered = clozeAnswered + theoryAnswered;

    statProgress.textContent = `${totalAnswered} 已练 (${passedCount} 掌握) / ${mistakeCount} 错题`;

    saveHistory();
  }

  // --- 4. Render Chapters Filters ---
  function renderChapterFilters() {
    chapterScroll.innerHTML = '';
    let chapters = [];
    let currentFilter = 'all';

    if (state.mode === 'cloze' || state.mode === 'memorize') {
      chapters = state.bank.practicalChapters || [
        { id: 'all', name: '全部实操考卷 (24 大题)' },
        { id: '01', name: '01 卷 · 自动化营销模型 (8 题)' },
        { id: '09', name: '09 卷 · 验证码识别模型 (8 题)' },
        { id: '07', name: '07 卷 · 吸烟检测模型 (8 题)' }
      ];
      currentFilter = state.cloze.filter;
    } else {
      chapters = state.bank.theoryChapters || [];
      currentFilter = state.theory.filter;
    }

    chapters.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'ch-chip' + (ch.id === currentFilter ? ' active' : '');
      btn.textContent = ch.name;
      btn.addEventListener('click', () => {
        if (state.mode === 'cloze' || state.mode === 'memorize') {
          state.cloze.filter = ch.id;
          applyClozeFilter({ targetId: ch.id === 'all' ? state.cloze.lastItemId : null });
          if (state.mode === 'memorize') renderMemorizeView();
        } else {
          state.theory.filter = ch.id;
          applyTheoryFilter({ targetNum: state.theory.lastNumByFilter[ch.id] || (ch.id === 'all' ? state.theory.lastNum : null) });
        }
        renderChapterFilters();
        saveHistory();
      });
      chapterScroll.appendChild(btn);
    });

    // Add Mistake-only filter chip
    const isPracticalMode = state.mode === 'cloze' || state.mode === 'memorize';
    const currentMistakeCount = isPracticalMode
      ? state.bank.practical.filter(it => state.stats.mistakeItems.has(it.id)).length
      : state.bank.theory.filter(it => state.stats.mistakeItems.has(it.id)).length;

    const mistakeChip = document.createElement('button');
    mistakeChip.className = 'ch-chip' + (currentFilter === 'mistakes' ? ' active' : '');
    mistakeChip.textContent = `⭐ 错题专项 (${currentMistakeCount})`;
    mistakeChip.addEventListener('click', () => {
      if (isPracticalMode) {
        state.cloze.filter = 'mistakes';
        applyClozeFilter();
        if (state.mode === 'memorize') renderMemorizeView();
      } else {
        state.theory.filter = 'mistakes';
        applyTheoryFilter({ targetNum: null });
      }
      renderChapterFilters();
      saveHistory();
    });
    chapterScroll.appendChild(mistakeChip);
  }

  // --- 5. Cloze Mode Logic (24 Big Practical Questions) ---
  function applyClozeFilter(options = {}) {
    const { keepIndex = false, targetId = null } = (typeof options === 'boolean' ? { keepIndex: options } : options);
    if (state.cloze.filter === 'all') {
      state.cloze.list = state.bank.practical;
    } else if (state.cloze.filter === 'mistakes') {
      state.cloze.mistakeSession = {};
      state.cloze.list = state.bank.practical.filter(it => state.stats.mistakeItems.has(it.id));
      if (state.cloze.list.length === 0) {
        showToast('暂无实操错题！已切回全部 24 大题');
        state.cloze.filter = 'all';
        state.cloze.list = state.bank.practical;
      }
    } else {
      state.cloze.list = state.bank.practical.filter(it => it.paperKey === state.cloze.filter || it.chapter === state.cloze.filter);
    }

    const restoreId = targetId || state.cloze.lastItemId;
    if (restoreId) {
      const foundIdx = state.cloze.list.findIndex(it => it.id === restoreId);
      if (foundIdx >= 0) {
        state.cloze.index = foundIdx;
      } else if (!keepIndex || state.cloze.index >= state.cloze.list.length) {
        state.cloze.index = 0;
      }
    } else if (!keepIndex || state.cloze.index >= state.cloze.list.length) {
      state.cloze.index = 0;
    }

    loadClozeItem();
  }

  function loadClozeItem() {
    if (!state.cloze.list || state.cloze.list.length === 0) return;
    const item = state.cloze.list[state.cloze.index];
    const isMistakeMode = state.cloze.filter === 'mistakes';

    // In mistake practice mode, practical questions should be answerable
    const sessionRecord = state.cloze.mistakeSession ? state.cloze.mistakeSession[item.id] : null;
    const saved = state.history.cloze[item.id];

    if (isMistakeMode) {
      if (sessionRecord) {
        state.cloze.filled = { ...sessionRecord.filled };
        state.cloze.activeBlank = sessionRecord.activeBlank;
      } else {
        // Fresh interactive question for user to re-attempt!
        state.cloze.filled = {};
        state.cloze.activeBlank = 0;
      }
    } else {
      // Normal practice mode: restore saved answers
      if (saved && saved.filled) {
        state.cloze.filled = { ...saved.filled };
        // Move active blank to first unfilled slot
        let firstUnfilled = 0;
        let hasUnfilled = false;
        for (let i = 0; i < item.b.length; i++) {
          if (!state.cloze.filled[i]) {
            firstUnfilled = i;
            hasUnfilled = true;
            break;
          }
        }
        state.cloze.activeBlank = hasUnfilled ? firstUnfilled : 0;
      } else {
        state.cloze.filled = {};
        state.cloze.activeBlank = 0;
      }
    }

    $('#cloze-title').textContent = item.title || item.q;
    $('#cloze-tag-ch').textContent = `${item.tag} · ${item.paperName || item.chapter}`;
    $('#cloze-tag-score').textContent = `${item.b.length} 处采分点挖空`;
    $('#cloze-index-badge').textContent = `第 ${item.index || state.cloze.index + 1} 题 / 共 ${state.cloze.list.length} 题`;

    const tagMistake = $('#cloze-tag-mistake');
    if (tagMistake) {
      tagMistake.style.display = state.stats.mistakeItems.has(item.id) ? 'inline-flex' : 'none';
    }

    const descEl = $('#cloze-desc');
    const promptText = item.prompt || item.desc;
    if (promptText) {
      descEl.textContent = promptText;
      descEl.style.display = 'block';
    } else {
      descEl.style.display = 'none';
    }

    renderClozeBody(item);
    renderChipsForActiveBlank(item);
    saveHistory();
  }

  function renderClozeBody(item) {
    const bodyEl = $('#cloze-body');
    bodyEl.innerHTML = '';

    item.p.forEach(part => {
      if (typeof part === 'string') {
        const textNode = document.createTextNode(part);
        bodyEl.appendChild(textNode);
      } else if (typeof part === 'number') {
        const blankIdx = part;
        const span = document.createElement('span');
        span.className = 'cloze-blank';
        span.dataset.blank = blankIdx;

        const filledInfo = state.cloze.filled[blankIdx];
        if (filledInfo) {
          span.classList.add(filledInfo.status);
          span.textContent = filledInfo.text;
        } else {
          span.textContent = `[ 空 ${blankIdx + 1} ]`;
          if (blankIdx === state.cloze.activeBlank) {
            span.classList.add('active');
          }
        }

        span.addEventListener('click', () => {
          if (!state.cloze.filled[blankIdx]) {
            state.cloze.activeBlank = blankIdx;
            updateActiveBlankHighlight();
            renderChipsForActiveBlank(item);
          }
        });

        bodyEl.appendChild(span);
      }
    });
  }

  function updateActiveBlankHighlight() {
    $$('.cloze-blank').forEach(el => {
      const idx = parseInt(el.dataset.blank, 10);
      if (idx === state.cloze.activeBlank && !state.cloze.filled[idx]) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('active');
      }
    });
    $('#cloze-blank-hint').textContent = `正在作答：空位 ${state.cloze.activeBlank + 1} / ${state.cloze.list[state.cloze.index].b.length}`;
  }

  function renderChipsForActiveBlank(item) {
    const chipsGrid = $('#cloze-chips');
    chipsGrid.innerHTML = '';

    // If all blanks filled in this item
    const isAllFilled = item.b.every((_, idx) => !!state.cloze.filled[idx]);
    if (isAllFilled) {
      chipsGrid.innerHTML = `
        <div style="width:100%; text-align:center; padding:16px; font-weight:800; color:#0b7a5a; font-size:16px;">
          🎉 本题 ${item.b.length} 处采分点全部攻克！
          <div style="margin-top:10px; display:flex; justify-content:center; gap:12px;">
            <button id="btn-done-redo" class="btn" style="padding:8px 16px;">🔄 清空重做本题</button>
            <button id="btn-done-next" class="btn btn-primary" style="padding:8px 20px;">进入下一题 ▶</button>
          </div>
        </div>`;
      const nextBtn = $('#btn-done-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => $('#btn-cloze-next').click());
      }
      const redoBtn = $('#btn-done-redo');
      if (redoBtn) {
        redoBtn.addEventListener('click', () => $('#btn-cloze-redo').click());
      }
      return;
    }

    const currentAns = item.b[state.cloze.activeBlank];
    if (!currentAns) return;

    // Build candidate pool: correct answer + 3 distractors
    const candidates = [currentAns];
    if (item.d && item.d.length > 0) {
      candidates.push(...item.d.slice(0, 3));
    } else {
      const pool = state.bank.practical.map(p => p.b).flat().filter(a => a !== currentAns);
      const shuffledPool = pool.sort(() => Math.random() - 0.5);
      candidates.push(...shuffledPool.slice(0, 3));
    }

    // Deduplicate
    const uniquePool = Array.from(new Set(candidates));
    while (uniquePool.length < 4) {
      const fallback = state.bank.practical.map(p => p.b).flat().find(a => !uniquePool.includes(a));
      if (fallback) uniquePool.push(fallback);
      else break;
    }

    // Shuffle options
    const shuffled = uniquePool.sort(() => Math.random() - 0.5);
    state.cloze.chips = shuffled;

    shuffled.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.innerHTML = `<span class="chip-key">${i + 1}</span> <span>${text}</span>`;
      btn.addEventListener('click', () => handleChipChoice(text, item));
      chipsGrid.appendChild(btn);
    });

    $('#cloze-blank-hint').textContent = `正在作答：空位 ${state.cloze.activeBlank + 1} / ${item.b.length}`;
  }

  function handleChipChoice(chosenText, item) {
    const correctAns = item.b[state.cloze.activeBlank];
    state.stats.totalAttempts++;

    if (chosenText === correctAns) {
      // Correct!
      state.stats.correctAttempts++;
      state.stats.combo++;
      if (state.stats.combo > state.stats.maxCombo) {
        state.stats.maxCombo = state.stats.combo;
      }

      sfx.playCorrect();

      if (state.stats.combo > 0 && state.stats.combo % 5 === 0) {
        sfx.playCombo(state.stats.combo);
        showToast(`🔥 ${state.stats.combo} 连击！作答行云流水！`);
      }

      // Mark filled
      state.cloze.filled[state.cloze.activeBlank] = {
        text: correctAns,
        status: 'correct'
      };

      if (state.cloze.filter === 'mistakes') {
        if (!state.cloze.mistakeSession) state.cloze.mistakeSession = {};
        state.cloze.mistakeSession[item.id] = {
          filled: { ...state.cloze.filled },
          activeBlank: state.cloze.activeBlank
        };
      }

      // Check if all filled
      const allDone = item.b.every((_, idx) => !!state.cloze.filled[idx]);
      state.history.cloze[item.id] = {
        filled: { ...state.cloze.filled },
        isCompleted: allDone,
        lastUpdated: Date.now()
      };

      if (allDone) {
        state.stats.passedItems.add(item.id);
        const wasMistake = state.stats.mistakeItems.has(item.id);
        state.stats.mistakeItems.delete(item.id);
        if (state.cloze.mistakeSession) {
          delete state.cloze.mistakeSession[item.id];
        }
        const tagMistake = $('#cloze-tag-mistake');
        if (tagMistake) tagMistake.style.display = 'none';
        renderChapterFilters();
        sfx.playWin();
        if (state.cloze.filter === 'mistakes' && wasMistake) {
          showToast('🎉 恭喜攻克实操错题！已从错题本移出～');
        } else {
          showToast('🏆 完美通关！本题要点已完全掌握！');
        }
      } else {
        // Advance to next unfilled blank
        for (let i = 0; i < item.b.length; i++) {
          if (!state.cloze.filled[i]) {
            state.cloze.activeBlank = i;
            break;
          }
        }
      }

      renderClozeBody(item);
      renderChipsForActiveBlank(item);
      updateHUD();
      saveHistory();
    } else {
      // Wrong!
      sfx.playWrong();
      state.stats.combo = 0;
      state.stats.mistakeItems.add(item.id);
      const tagMistake = $('#cloze-tag-mistake');
      if (tagMistake) tagMistake.style.display = 'inline-flex';
      renderChapterFilters();
      showToast('❌ 选错了，连击中断！仔细阅读题干语境～');
      updateHUD();
      saveHistory();
    }
  }

  // --- 6. 试题大纲与答题卡抽屉 ---
  function renderDirectoryModal() {
    if (!dirBody) return;
    dirBody.innerHTML = '';

    if (!state.dirViewMode) state.dirViewMode = state.mode === 'theory' ? 'theory' : 'outline';

    const tabTheory = $('#dir-tab-theory');
    const tabOutline = $('#dir-tab-outline');
    const tabPapers = $('#dir-tab-papers');
    if (tabTheory) tabTheory.classList.toggle('active', state.dirViewMode === 'theory');
    if (tabOutline) tabOutline.classList.toggle('active', state.dirViewMode === 'outline');
    if (tabPapers) tabPapers.classList.toggle('active', state.dirViewMode === 'papers');

    if (dirModalTitle && dirModalSubtitle) {
      if (state.dirViewMode === 'theory') {
        dirModalTitle.textContent = '理论知识考核 200 题答题卡与做题历史';
        dirModalSubtitle.textContent = '按考纲 5 大章节完整收录 200 题，直观查看掌握与错题情况，点击直接跳转答题';
      } else {
        dirModalTitle.textContent = '实操技能考核 24 大题大纲目录（01 & 09 & 07卷）';
        dirModalSubtitle.textContent = '收录全部 24 道实操大题，点击任意题目卡片直接开启挖空闯关';
      }
    }

    if (state.dirViewMode === 'theory') {
      renderTheorySheetInModal();
      return;
    }

    const currentItem = state.cloze.list[state.cloze.index];

    function createItemButton(it) {
      const btn = document.createElement('button');
      const isActive = currentItem && currentItem.id === it.id;
      const isPassed = state.stats.passedItems.has(it.id);
      const isMistake = state.stats.mistakeItems.has(it.id);
      const savedCloze = state.history.cloze[it.id];
      const doneBlanks = savedCloze && savedCloze.filled ? Object.keys(savedCloze.filled).length : 0;

      let statusText = `🎯 ${it.b.length} 采分点`;
      if (isPassed) {
        statusText = '✅ 已掌握';
      } else if (isMistake) {
        statusText = '⚠️ 错题待攻克';
      } else if (doneBlanks > 0) {
        statusText = `✏️ 已填 ${doneBlanks}/${it.b.length}`;
      }

      btn.className = 'dir-item-btn' + (isActive ? ' active' : '') + (isMistake ? ' dir-item-mistake' : '');
      const numPrefix = String(it.index).padStart(2, '0');
      btn.innerHTML = `
        <div class="dir-item-top">
          <span class="dir-item-tag">#${numPrefix} · ${it.tag}</span>
          <span class="dir-item-count">${statusText}</span>
        </div>
        <div class="dir-item-name">${it.title.replace(/^(\d{2}题\d+[:：]\s*)/, '')}</div>
      `;

      btn.addEventListener('click', () => {
        if (state.mode !== 'cloze') {
          switchMode('cloze');
        }
        state.cloze.filter = 'all';
        state.cloze.list = state.bank.practical;
        const foundIdx = state.bank.practical.findIndex(x => x.id === it.id);
        state.cloze.index = foundIdx >= 0 ? foundIdx : 0;
        renderChapterFilters();
        loadClozeItem();
        closeDirectoryModal();
        showToast(`已跳转至第 ${numPrefix} 题：${it.title}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      return btn;
    }

    if (state.dirViewMode === 'outline') {
      const groupEl = document.createElement('div');
      groupEl.innerHTML = `
        <div class="dir-group-title" style="justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>📋</span>
            <span>考纲 01&09&07 连续 24 大题完整对照清单（共 24 题）</span>
          </div>
          <span style="font-size:12px; color:var(--ink-2); font-weight:700;">对齐考试标准顺序</span>
        </div>`;

      const gridEl = document.createElement('div');
      gridEl.className = 'dir-grid';

      state.bank.practical.forEach(it => {
        gridEl.appendChild(createItemButton(it));
      });

      groupEl.appendChild(gridEl);
      dirBody.appendChild(groupEl);
    } else {
      const papers = [
        { key: '01', title: '01 卷 · 自动化营销模型业务（共 8 大题）' },
        { key: '09', title: '09 卷 · 验证码识别模型与 RPA（共 8 大题）' },
        { key: '07', title: '07 卷 · 自然场景吸烟检测模型（共 8 大题）' }
      ];

      papers.forEach(p => {
        const groupEl = document.createElement('div');
        groupEl.innerHTML = `<div class="dir-group-title"><span>📘</span> <span>${p.title}</span></div>`;

        const gridEl = document.createElement('div');
        gridEl.className = 'dir-grid';

        const items = state.bank.practical.filter(it => it.paperKey === p.key);
        items.forEach(it => {
          gridEl.appendChild(createItemButton(it));
        });

        groupEl.appendChild(gridEl);
        dirBody.appendChild(groupEl);
      });
    }
  }

  function renderTheorySheetInModal() {
    const totalCount = state.bank.theory.length;
    let answeredCount = 0;
    let correctCount = 0;
    let mistakeCount = 0;

    state.bank.theory.forEach(q => {
      const rec = state.history.theory[q.id];
      if (rec && rec.answered) {
        answeredCount++;
        if (rec.isCorrect) correctCount++;
        else mistakeCount++;
      } else if (state.stats.mistakeItems.has(q.id)) {
        mistakeCount++;
      }
    });

    const acc = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 100;

    const summaryCard = document.createElement('div');
    summaryCard.className = 'theory-sheet-summary';
    summaryCard.innerHTML = `
      <div class="theory-sheet-stats">
        📊 理论真题做题总览：共 <b>${totalCount}</b> 题 · 已答 <b>${answeredCount}</b> 题 (答对 <span style="color:#10b981; font-weight:900;">${correctCount}</span> · 错题 <span style="color:#ef4444; font-weight:900;">${mistakeCount}</span>) · 正确率 <b>${acc}%</b>
      </div>
      <div class="theory-sheet-legend">
        <div class="theory-legend-item"><span class="theory-legend-dot passed"></span> <span>已答对</span></div>
        <div class="theory-legend-item"><span class="theory-legend-dot mistake"></span> <span>曾答错/错题</span></div>
        <div class="theory-legend-item"><span class="theory-legend-dot current"></span> <span>当前定位</span></div>
        <div class="theory-legend-item"><span class="theory-legend-dot unanswered"></span> <span>未作答</span></div>
      </div>
    `;
    dirBody.appendChild(summaryCard);

    const chapters = (state.bank.theoryChapters || []).filter(c => c.id !== 'all');
    const currentQ = state.theory.list && state.theory.list[state.theory.index];

    chapters.forEach(ch => {
      const qs = state.bank.theory.filter(q => q.chapter === ch.id);
      if (qs.length === 0) return;

      const groupEl = document.createElement('div');
      groupEl.className = 'theory-sheet-group';

      const chAnswered = qs.filter(q => state.history.theory[q.id]?.answered).length;
      groupEl.innerHTML = `
        <div class="theory-sheet-group-title">
          <span>📚 ${ch.name}</span>
          <span style="font-size:12px; color:var(--ink-2); font-weight:700;">进度：${chAnswered} / ${qs.length}</span>
        </div>
      `;

      const gridEl = document.createElement('div');
      gridEl.className = 'theory-sheet-grid';

      qs.forEach(q => {
        const btn = document.createElement('button');
        const rec = state.history.theory[q.id];
        const isCurrent = currentQ && currentQ.id === q.id;
        const isMistake = state.stats.mistakeItems.has(q.id) || (rec && rec.answered && !rec.isCorrect);
        const isPassed = rec && rec.answered && rec.isCorrect;

        let btnClass = 'theory-sheet-btn';
        if (isPassed) btnClass += ' passed';
        else if (isMistake) btnClass += ' mistake';
        if (isCurrent) btnClass += ' current';

        btn.className = btnClass;
        btn.textContent = q.num;
        btn.title = `题号 ${q.num}：${q.q.slice(0, 35)}...`;

        btn.addEventListener('click', () => {
          if (state.mode !== 'theory') {
            switchMode('theory');
          }
          const foundIdxInCurrent = state.theory.list.findIndex(x => x.id === q.id);
          if (foundIdxInCurrent >= 0) {
            state.theory.index = foundIdxInCurrent;
          } else {
            state.theory.filter = 'all';
            applyTheoryFilter({ targetNum: q.num });
            renderChapterFilters();
          }
          loadTheoryQuestion();
          closeDirectoryModal();
          showToast(`已跳转至理论题号 ${q.num}`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        gridEl.appendChild(btn);
      });

      groupEl.appendChild(gridEl);
      dirBody.appendChild(groupEl);
    });
  }

  function openDirectoryModal() {
    if (!dirModal) return;
    renderDirectoryModal();
    dirModal.style.display = 'flex';
  }

  function closeDirectoryModal() {
    if (dirModal) dirModal.style.display = 'none';
  }

  // --- 7. Theory Quiz Logic (200 Questions) ---
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function updateShuffleBtnUI() {
    const btn = $('#btn-theory-shuffle');
    const reshuffleBtn = $('#btn-theory-reshuffle');
    if (!btn) return;
    if (state.theory.isRandom) {
      btn.innerHTML = '🔀 随机出题：<b>开</b>';
      btn.classList.add('btn-toggle-on');
      if (reshuffleBtn) reshuffleBtn.style.display = 'inline-flex';
    } else {
      btn.innerHTML = '➡️ 题号顺序：<b>开</b>';
      btn.classList.remove('btn-toggle-on');
      if (reshuffleBtn) reshuffleBtn.style.display = 'none';
    }
  }

  function updateAutoNextBtnUI() {
    const btn = $('#btn-theory-autonext');
    if (!btn) return;
    if (state.theory.autoNext) {
      btn.innerHTML = '⏱️ 自动切题：<b>开</b>';
      btn.classList.add('btn-toggle-on');
    } else {
      btn.innerHTML = '⏱️ 自动切题：<b>关</b>';
      btn.classList.remove('btn-toggle-on');
    }
  }

  function clearTheoryAutoNext() {
    if (state.theory.autoNextTimer) {
      clearTimeout(state.theory.autoNextTimer);
      state.theory.autoNextTimer = null;
    }
    restoreNextButtonText();
  }

  function restoreNextButtonText() {
    const nextBtn = $('#btn-theory-next');
    if (nextBtn) {
      nextBtn.innerHTML = '下一题 (空格/Enter) ▶';
      nextBtn.classList.remove('btn-countdown');
    }
  }

  function updateTheoryMistakeUI(item) {
    if (!item) return;
    const tagMistake = $('#theory-tag-mistake');
    const btnFav = $('#btn-theory-fav');
    const isMistake = state.stats.mistakeItems.has(item.id);
    if (tagMistake) {
      tagMistake.style.display = isMistake ? 'inline-flex' : 'none';
    }
    if (btnFav) {
      if (isMistake) {
        btnFav.innerHTML = '★ 已在错题本 (点击移出)';
        btnFav.classList.add('btn-fav-active');
      } else {
        btnFav.innerHTML = '⭐ 错题收藏';
        btnFav.classList.remove('btn-fav-active');
      }
    }
  }

  function applyTheoryFilter(options = {}) {
    const { keepIndex = false, targetNum = null } = (typeof options === 'boolean' ? { keepIndex: options } : options);
    let sourceList = [];
    if (state.theory.filter === 'all') {
      sourceList = [...state.bank.theory];
    } else if (state.theory.filter === 'mistakes') {
      state.theory.mistakeSession = {};
      sourceList = state.bank.theory.filter(t => state.stats.mistakeItems.has(t.id));
      if (sourceList.length === 0) {
        showToast('暂无理论错题！已切回全部题目');
        state.theory.filter = 'all';
        sourceList = [...state.bank.theory];
      }
    } else {
      sourceList = state.bank.theory.filter(t => t.chapter === state.theory.filter);
    }

    if (state.theory.isRandom) {
      state.theory.list = shuffleArray(sourceList);
    } else {
      state.theory.list = sourceList.sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10));
    }

    const restoreNum = targetNum || state.theory.lastNumByFilter[state.theory.filter] || (state.theory.filter === 'all' ? state.theory.lastNum : null);
    if (restoreNum) {
      const foundIdx = state.theory.list.findIndex(t => t.num === restoreNum);
      if (foundIdx >= 0) {
        state.theory.index = foundIdx;
      } else if (!keepIndex || state.theory.index >= state.theory.list.length) {
        state.theory.index = 0;
      }
    } else if (!keepIndex || state.theory.index >= state.theory.list.length) {
      state.theory.index = 0;
    }

    loadTheoryQuestion();
    updateShuffleBtnUI();
    updateAutoNextBtnUI();
  }

  function loadTheoryQuestion() {
    clearTheoryAutoNext();
    updateAutoNextBtnUI();
    updateShuffleBtnUI();
    if (!state.theory.list || state.theory.list.length === 0) return;
    const item = state.theory.list[state.theory.index];
    const isMistakeMode = state.theory.filter === 'mistakes';

    // In mistake practice mode, questions should be ANSWERABLE / INTERACTIVE!
    // Unless the user already answered it during this specific mistake practice session.
    const sessionRecord = state.theory.mistakeSession ? state.theory.mistakeSession[item.id] : null;
    const saved = state.history.theory[item.id];

    if (isMistakeMode) {
      if (sessionRecord && sessionRecord.answered) {
        state.theory.answered = true;
        state.theory.selected = sessionRecord.selected;
      } else {
        // Fresh interactive question for user to re-attempt!
        state.theory.answered = false;
        state.theory.selected = null;
      }
    } else {
      // Normal practice mode: check history
      if (saved && saved.answered) {
        state.theory.answered = true;
        state.theory.selected = saved.selected;
      } else {
        state.theory.answered = false;
        state.theory.selected = null;
      }
    }

    $('#theory-title').textContent = item.q;
    $('#theory-tag-ch').textContent = item.chapter || '理论知识';
    $('#theory-tag-type').textContent = item.type === 'judge' ? '判断题' : (item.type === 'multi' ? '多选题' : '单选题');
    $('#theory-tag-num').textContent = `题号 ${item.num}`;
    $('#theory-index-badge').textContent = `${state.theory.index + 1} / ${state.theory.list.length}`;
    updateTheoryMistakeUI(item);

    // Options
    const optBox = $('#theory-options');
    optBox.innerHTML = '';

    const opts = item.options.length > 0 ? item.options : ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'];
    opts.forEach((optText, i) => {
      const btn = document.createElement('button');
      btn.className = 'theory-opt-btn';
      const keyMatch = optText.match(/^([A-D√×对错])/);
      const key = keyMatch ? keyMatch[1] : String.fromCharCode(65 + i);

      btn.innerHTML = `<span class="theory-opt-key">${key}</span> <span>${optText}</span>`;

      // If answered previously, display correct / wrong indicator
      if (state.theory.answered) {
        const isSelected = key === state.theory.selected;
        const recordIsCorrect = isMistakeMode ? sessionRecord?.isCorrect : saved?.isCorrect;
        if (key === item.answer || item.answer.includes(key)) {
          btn.classList.add('correct');
        } else if (isSelected && !recordIsCorrect) {
          btn.classList.add('wrong');
        }
      }

      btn.addEventListener('click', () => handleTheoryChoice(key, item, btn));
      optBox.appendChild(btn);
    });

    // Show analysis if answered
    if (state.theory.answered) {
      $('#theory-ans-text').textContent = item.answer;
      $('#theory-analysis-text').innerHTML = item.analysis || '暂无详细考点解析。';
      $('#theory-analysis').style.display = 'flex';
    } else {
      $('#theory-analysis').style.display = 'none';
    }

    saveHistory();
  }

  function handleTheoryChoice(chosenKey, item, clickedBtn) {
    if (state.theory.answered) return;
    state.theory.answered = true;
    state.theory.selected = chosenKey;
    state.stats.totalAttempts++;

    const isMatch = chosenKey.trim() === item.answer.trim() || item.answer.includes(chosenKey);
    const isMistakeMode = state.theory.filter === 'mistakes';

    // Record session if in mistake mode
    if (!state.theory.mistakeSession) state.theory.mistakeSession = {};
    state.theory.mistakeSession[item.id] = {
      answered: true,
      selected: chosenKey,
      isCorrect: isMatch,
      timestamp: Date.now()
    };

    // Save history
    state.history.theory[item.id] = {
      answered: true,
      selected: chosenKey,
      isCorrect: isMatch,
      timestamp: Date.now()
    };

    const allBtns = $$('.theory-opt-btn');
    allBtns.forEach(btn => {
      const key = btn.querySelector('.theory-opt-key').textContent.trim();
      if (key === item.answer || item.answer.includes(key)) {
        btn.classList.add('correct');
      }
    });

    if (isMatch) {
      state.stats.correctAttempts++;
      state.stats.combo++;
      if (state.stats.combo > state.stats.maxCombo) {
        state.stats.maxCombo = state.stats.combo;
      }
      state.stats.passedItems.add(item.id);

      const wasMistake = state.stats.mistakeItems.has(item.id);
      state.stats.mistakeItems.delete(item.id);
      sfx.playCorrect();
      if (state.stats.combo > 0 && state.stats.combo % 5 === 0) {
        sfx.playCombo(state.stats.combo);
      }

      if (isMistakeMode && wasMistake) {
        showToast('🎉 恭喜攻克错题！已从错题本移出～');
      }

      // 答对等 1 秒自动跳转下一道题
      if (state.theory.autoNext) {
        clearTheoryAutoNext();
        const nextBtn = $('#btn-theory-next');
        if (nextBtn) {
          nextBtn.innerHTML = '⏱️ 1秒后自动切题... ▶';
          nextBtn.classList.add('btn-countdown');
        }
        state.theory.autoNextTimer = setTimeout(() => {
          state.theory.autoNextTimer = null;
          if (state.mode === 'theory') {
            if (state.theory.index < state.theory.list.length - 1) {
              state.theory.index++;
              loadTheoryQuestion();
            } else {
              showToast('🎉 已刷完本模块全部题目！');
              restoreNextButtonText();
            }
          }
        }, 1000);
      }
    } else {
      clickedBtn.classList.add('wrong');
      state.stats.combo = 0;
      state.stats.mistakeItems.add(item.id);
      sfx.playWrong();
      clearTheoryAutoNext();
    }

    // Show analysis
    $('#theory-ans-text').textContent = item.answer;
    $('#theory-analysis-text').innerHTML = item.analysis || '暂无详细考点解析。';
    $('#theory-analysis').style.display = 'flex';

    updateTheoryMistakeUI(item);
    renderChapterFilters();
    updateHUD();
    saveHistory();
  }

  // --- 8. Memorize Mode Logic ---
  function renderMemorizeView() {
    const list = $('#memorize-list');
    list.innerHTML = '';

    let items = state.bank.practical;
    if (state.cloze.filter !== 'all' && state.cloze.filter !== 'mistakes') {
      items = state.bank.practical.filter(it => it.paperKey === state.cloze.filter || it.chapter === state.cloze.filter);
    } else if (state.cloze.filter === 'mistakes') {
      items = state.bank.practical.filter(it => state.stats.mistakeItems.has(it.id));
    }

    if (items.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--ink-2); font-weight:800;">暂无匹配实操题目</div>';
      return;
    }

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      const isMistake = state.stats.mistakeItems.has(item.id);
      const isPassed = state.stats.passedItems.has(item.id);
      let statusTag = '';
      if (isMistake) {
        statusTag = '<span class="tag tag-mistake">⚠️ 错题待攻克</span>';
      } else if (isPassed) {
        statusTag = '<span class="tag tag-type" style="background:var(--mint-soft);color:#065f46;">✅ 已掌握</span>';
      }

      card.className = 'memorize-card' + (isMistake ? ' is-mistake' : '');

      let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="tag tag-ch">${item.tag || item.paperName}</span>
          <span class="tag tag-score">${item.b.length} 处采分要点</span>
          ${statusTag}
        </div>
        <span style="font-size:12px; font-weight:800; color:var(--ink-2);">${idx + 1} / ${items.length}</span>
      </div>
      <h3 style="font-size:18px; font-weight:900; color:var(--ink); margin-bottom:12px;">${item.title || item.q}</h3>`;

      const promptText = item.prompt || item.desc;
      if (promptText) {
        html += `<div style="font-size:13px; color:var(--ink-2); background:#faf8f2; padding:10px 14px; border-radius:10px; border:1.5px solid rgba(27,29,77,0.1); margin-bottom:14px; white-space:pre-line;">${promptText}</div>`;
      }

      let contentHtml = '';
      item.p.forEach(part => {
        if (typeof part === 'string') {
          contentHtml += part.replace(/\n/g, '<br>');
        } else if (typeof part === 'number') {
          const ans = item.b[part] || '';
          contentHtml += `<span class="highlight-answer">${ans}</span>`;
        }
      });

      html += `<div class="memorize-text" style="font-size:15px; line-height:2.2; font-weight:600;">${contentHtml}</div>`;
      card.innerHTML = html;
      list.appendChild(card);
    });
  }

  // --- 9. Event Listeners & Controls ---
  // Mode Switch
  function switchMode(newMode) {
    clearTheoryAutoNext();
    modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === newMode));
    state.mode = newMode;
    try {
      history.replaceState(null, '', '#' + newMode);
    } catch(e) {}
    saveHistory();

    viewCloze.style.display = state.mode === 'cloze' ? 'flex' : 'none';
    if (viewPractice) viewPractice.style.display = state.mode === 'practice' ? 'flex' : 'none';
    viewTheory.style.display = state.mode === 'theory' ? 'flex' : 'none';
    viewMemorize.style.display = state.mode === 'memorize' ? 'flex' : 'none';

    renderChapterFilters();
    if (state.mode === 'cloze') {
      loadClozeItem();
    } else if (state.mode === 'practice') {
      loadPracticeQuestion(state.practice.qNum, state.practice.partNum);
    } else if (state.mode === 'theory') {
      loadTheoryQuestion();
    } else if (state.mode === 'memorize') {
      renderMemorizeView();
    }
    if (window.AI_TRAINER_TUTOR && window.AI_TRAINER_TUTOR.updateContext) {
      window.AI_TRAINER_TUTOR.updateContext();
    }
  }

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchMode(tab.dataset.mode);
    });
  });

  // Directory Modal Triggers
  if (btnOpenDir) {
    btnOpenDir.addEventListener('click', () => {
      state.dirViewMode = 'outline';
      openDirectoryModal();
    });
  }
  if (btnOpenTheoryDir) {
    btnOpenTheoryDir.addEventListener('click', () => {
      state.dirViewMode = 'theory';
      openDirectoryModal();
    });
  }
  if (btnCloseDir) {
    btnCloseDir.addEventListener('click', closeDirectoryModal);
  }
  if (dirModal) {
    dirModal.addEventListener('click', e => {
      if (e.target === dirModal) closeDirectoryModal();
    });
  }

  // Directory View Mode Switch Tabs
  const tabTheory = $('#dir-tab-theory');
  const tabOutline = $('#dir-tab-outline');
  const tabPapers = $('#dir-tab-papers');
  if (tabTheory) {
    tabTheory.addEventListener('click', () => {
      state.dirViewMode = 'theory';
      renderDirectoryModal();
    });
  }
  if (tabOutline) {
    tabOutline.addEventListener('click', () => {
      state.dirViewMode = 'outline';
      renderDirectoryModal();
    });
  }
  if (tabPapers) {
    tabPapers.addEventListener('click', () => {
      state.dirViewMode = 'papers';
      renderDirectoryModal();
    });
  }

  // Sound Toggle
  btnSound.addEventListener('click', () => {
    const isUnmuted = sfx.toggleMute();
    btnSound.textContent = isUnmuted ? '🔊' : '🔇';
    showToast(isUnmuted ? '音效已开启' : '音效已静音');
  });
  if (sfx.muted) btnSound.textContent = '🔇';

  // Reset Progress & All History
  btnReset.addEventListener('click', () => {
    if (confirm('确定要清空做题历史、作答进度与错题记录吗？')) {
      state.stats.combo = 0;
      state.stats.maxCombo = 0;
      state.stats.correctAttempts = 0;
      state.stats.totalAttempts = 0;
      state.stats.passedItems.clear();
      state.stats.mistakeItems.clear();
      state.history.cloze = {};
      state.history.theory = {};
      state.cloze.filled = {};
      state.cloze.activeBlank = 0;
      state.cloze.index = 0;
      state.cloze.mistakeSession = {};
      state.theory.index = 0;
      state.theory.answered = false;
      state.theory.selected = null;
      state.theory.mistakeSession = {};
      state.theory.lastNumByFilter = {};

      [
        'aiTrainer_maxCombo',
        'aiTrainer_correctAttempts',
        'aiTrainer_totalAttempts',
        'aiTrainer_passed',
        'aiTrainer_mistakes',
        'aiTrainer_clozeHistory',
        'aiTrainer_theoryHistory',
        'aiTrainer_clozeItemId',
        'aiTrainer_theoryNum',
        'aiTrainer_theoryLastNumByFilter'
      ].forEach(k => localStorage.removeItem(k));

      updateHUD();
      if (state.mode === 'cloze') loadClozeItem();
      else if (state.mode === 'theory') loadTheoryQuestion();
      else if (state.mode === 'memorize') renderMemorizeView();
      showToast('全部历史记录与做题进度已重置！');
    }
  });

  // Cloze Controls
  $('#btn-cloze-prev').addEventListener('click', () => {
    if (state.cloze.index > 0) {
      state.cloze.index--;
      loadClozeItem();
    } else {
      showToast('已经是本试卷第一题了！');
    }
  });
  $('#btn-cloze-next').addEventListener('click', () => {
    if (state.cloze.index < state.cloze.list.length - 1) {
      state.cloze.index++;
      loadClozeItem();
    } else {
      showToast('已经是本试卷最后一题了！');
    }
  });
  $('#btn-cloze-redo').addEventListener('click', () => {
    const item = state.cloze.list[state.cloze.index];
    if (item) {
      delete state.history.cloze[item.id];
      if (state.cloze.mistakeSession) {
        delete state.cloze.mistakeSession[item.id];
      }
      state.cloze.filled = {};
      state.cloze.activeBlank = 0;
      saveHistory();
      loadClozeItem();
      showToast('已重置本题作答状态，可重新练习');
    }
  });
  $('#btn-cloze-reveal').addEventListener('click', () => {
    const item = state.cloze.list[state.cloze.index];
    item.b.forEach((ans, idx) => {
      state.cloze.filled[idx] = { text: ans, status: 'revealed' };
    });
    state.history.cloze[item.id] = {
      filled: { ...state.cloze.filled },
      isCompleted: true,
      lastUpdated: Date.now()
    };
    renderClozeBody(item);
    renderChipsForActiveBlank(item);
    saveHistory();
    showToast('本题采分点已全部揭晓');
  });
  $('#btn-cloze-hint').addEventListener('click', () => {
    const item = state.cloze.list[state.cloze.index];
    const ans = item.b[state.cloze.activeBlank];
    if (ans) {
      const hintPrefix = ans.slice(0, 4);
      showToast(`提示：当前空以【${hintPrefix}...】开头`);
    }
  });

  // Theory Controls
  $('#btn-theory-prev').addEventListener('click', () => {
    clearTheoryAutoNext();
    if (state.theory.index > 0) {
      state.theory.index--;
      loadTheoryQuestion();
    } else {
      showToast('已经是第一题了！');
    }
  });
  $('#btn-theory-next').addEventListener('click', () => {
    clearTheoryAutoNext();
    if (state.theory.index < state.theory.list.length - 1) {
      state.theory.index++;
      loadTheoryQuestion();
    } else {
      showToast('已经是最后一题了！');
    }
  });
  $('#btn-theory-show-ans').addEventListener('click', () => {
    clearTheoryAutoNext();
    const item = state.theory.list[state.theory.index];
    $('#theory-ans-text').textContent = item.answer;
    $('#theory-analysis-text').innerHTML = item.analysis || '暂无解析。';
    $('#theory-analysis').style.display = 'flex';
  });
  $('#btn-theory-fav').addEventListener('click', () => {
    const item = state.theory.list[state.theory.index];
    if (state.stats.mistakeItems.has(item.id)) {
      state.stats.mistakeItems.delete(item.id);
      showToast('已从错题本移出');
    } else {
      state.stats.mistakeItems.add(item.id);
      showToast('已加入错题本！');
    }
    updateTheoryMistakeUI(item);
    renderChapterFilters();
    updateHUD();
    saveHistory();
  });

  const btnTheoryRedo = $('#btn-theory-redo');
  if (btnTheoryRedo) {
    btnTheoryRedo.addEventListener('click', () => {
      clearTheoryAutoNext();
      const item = state.theory.list[state.theory.index];
      if (!item) return;

      // Clear answered state for this question
      state.theory.answered = false;
      state.theory.selected = null;
      if (state.theory.mistakeSession) {
        delete state.theory.mistakeSession[item.id];
      }
      delete state.history.theory[item.id];

      // Re-render options
      const optBox = $('#theory-options');
      optBox.innerHTML = '';
      const opts = item.options.length > 0 ? item.options : ['A. 选项A', 'B. 选项B', 'C. 选项C', 'D. 选项D'];
      opts.forEach((optText, i) => {
        const btn = document.createElement('button');
        btn.className = 'theory-opt-btn';
        const keyMatch = optText.match(/^([A-D√×对错])/);
        const key = keyMatch ? keyMatch[1] : String.fromCharCode(65 + i);
        btn.innerHTML = `<span class="theory-opt-key">${key}</span> <span>${optText}</span>`;
        btn.addEventListener('click', () => handleTheoryChoice(key, item, btn));
        optBox.appendChild(btn);
      });

      $('#theory-analysis').style.display = 'none';
      saveHistory();
      showToast('🔄 已清空本题作答状态，请重新作答');
    });
  }

  const btnTheoryAutoNext = $('#btn-theory-autonext');
  if (btnTheoryAutoNext) {
    btnTheoryAutoNext.addEventListener('click', () => {
      state.theory.autoNext = !state.theory.autoNext;
      localStorage.setItem('aiTrainer_theoryAutoNext', state.theory.autoNext);
      updateAutoNextBtnUI();
      if (!state.theory.autoNext) {
        clearTheoryAutoNext();
      }
      showToast(state.theory.autoNext ? '⏱️ 已开启：答对 1 秒后自动切题' : '⏱️ 已关闭自动切题，可手动点击下一题');
    });
  }

  const btnTheoryShuffle = $('#btn-theory-shuffle');
  if (btnTheoryShuffle) {
    btnTheoryShuffle.addEventListener('click', () => {
      state.theory.isRandom = !state.theory.isRandom;
      localStorage.setItem('aiTrainer_theoryRandom', state.theory.isRandom);
      applyTheoryFilter();
      showToast(state.theory.isRandom ? '🔀 已开启随机出题（全题库乱序）' : '📋 已切换为顺序刷题（按 001~200 题号）');
    });
  }

  const btnTheoryReshuffle = $('#btn-theory-reshuffle');
  if (btnTheoryReshuffle) {
    btnTheoryReshuffle.addEventListener('click', () => {
      applyTheoryFilter();
      showToast('🎲 题目已重新随机打乱！');
    });
  }

  // Keyboard Shortcuts (1~6 for chips/options, Space for next, Esc for modal)
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      closeDirectoryModal();
      return;
    }

    if (e.key >= '1' && e.key <= '6') {
      const num = parseInt(e.key, 10);
      if (state.mode === 'cloze') {
        const item = state.cloze.list[state.cloze.index];
        if (state.cloze.chips && state.cloze.chips[num - 1]) {
          handleChipChoice(state.cloze.chips[num - 1], item);
        }
      } else if (state.mode === 'theory') {
        const btns = $$('.theory-opt-btn');
        if (btns[num - 1]) btns[num - 1].click();
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (state.mode === 'theory' && state.theory.answered) {
        e.preventDefault();
        $('#btn-theory-next').click();
      }
    } else if (e.key === 'ArrowRight') {
      if (state.mode === 'cloze') $('#btn-cloze-next').click();
      else if (state.mode === 'theory') $('#btn-theory-next').click();
    } else if (e.key === 'ArrowLeft') {
      if (state.mode === 'cloze') $('#btn-cloze-prev').click();
      else if (state.mode === 'theory') $('#btn-theory-prev').click();
    }
  });

  // Automatically persist progress when user switches browser tab or closes page
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveHistory();
    } else if (document.visibilityState === 'visible') {
      updateHUD();
    }
  });

  window.addEventListener('beforeunload', () => {
    saveHistory();
  });

  // 题库按飞书原文更新后，同一题的空位数量或答案可能变化。已存的 filled[idx].text
  // 总是当时的正确答案，与当前 item.b[idx] 对不上就丢弃，避免旧答案挂到别的空上。
  function pruneStaleClozeHistory() {
    const byId = new Map((state.bank.practical || []).map(it => [it.id, it]));
    let changed = false;
    Object.keys(state.history.cloze).forEach(id => {
      const rec = state.history.cloze[id];
      const item = byId.get(id);
      if (!item || !rec || !rec.filled) {
        delete state.history.cloze[id];
        changed = true;
        return;
      }
      Object.keys(rec.filled).forEach(idx => {
        const f = rec.filled[idx];
        if (!f || item.b[idx] !== f.text) {
          delete rec.filled[idx];
          changed = true;
        }
      });
      const allDone = item.b.every((_, i) => !!rec.filled[i]);
      if (rec.isCompleted && !allDone) {
        rec.isCompleted = false;
        changed = true;
      }
    });
    if (changed) saveHistory();
  }

  // --- 10. Load Bank Data & Restore Session ---
  async function init() {
    try {
      if (window.AI_TRAINER_BANK) {
        state.bank = window.AI_TRAINER_BANK;
      } else {
        const resp = await fetch('bank.json');
        state.bank = await resp.json();
      }
      console.log('Loaded AI Trainer Bank:', state.bank.meta);
      pruneStaleClozeHistory();

      // Determine initial mode (URL hash > localStorage > 'cloze')
      const hash = (window.location && window.location.hash ? window.location.hash : '').replace('#', '');
      const initialMode = (hash === 'theory' || hash === 'cloze' || hash === 'memorize')
        ? hash
        : (localStorage.getItem('aiTrainer_mode') || 'cloze');

      // 1. Restore Cloze state & question position
      applyClozeFilter({ keepIndex: true, targetId: state.cloze.lastItemId });

      // 2. Restore Theory state & question position
      applyTheoryFilter({ keepIndex: true, targetNum: state.theory.lastNum });

      // 3. Switch to initial mode and display views
      switchMode(initialMode);

      updateHUD();
    } catch (e) {
      console.error('Failed to load bank:', e);
      showToast('题库加载失败，请刷新重试');
    }
  }


  // ==========================================================
  // Practical Practice Mode (✍️ 逐题精讲与实战自测)
  // ==========================================================

  function getPracticeQuestions() {
    return (window.AI_TRAINER_LESSONS && window.AI_TRAINER_LESSONS.paper09Questions) || [];
  }

  function getDraftKey(qNum, partNum) {
    return `aiTrainer_draft_09_q${qNum}_p${partNum}`;
  }

  function getChecksKey(qNum, partNum) {
    return `aiTrainer_checks_09_q${qNum}_p${partNum}`;
  }

  function loadPracticeQuestion(qNum, partNum) {
    const questions = getPracticeQuestions();
    if (!questions.length) return;

    qNum = Math.max(1, Math.min(qNum || 1, questions.length));
    const qData = questions[qNum - 1];
    state.practice.qNum = qNum;
    localStorage.setItem('aiTrainer_practice_q', qNum);

    if (practiceQSelect) practiceQSelect.value = String(qNum);
    if (practiceTitle) practiceTitle.textContent = `09题${qNum}：${qData.title}`;
    if (practiceTagScore) practiceTagScore.textContent = `满分 ${qData.points} 分`;
    if (practiceTagTarget) practiceTagTarget.textContent = `及格目标 ${qData.targetPoints} 分`;
    if (practiceTagStyle) practiceTagStyle.textContent = qData.docType || '实操大题';

    if (practiceRhymeText) practiceRhymeText.textContent = qData.rhyme || '先定骨架，再按小标题逐条展开。';
    if (practiceRhymeSub) practiceRhymeSub.textContent = qData.rhymeExplanation || qData.strategy || '小标题背下来，内容去卷面找词。';

    // Context & materials
    if (practiceContextContent) {
      let html = '';
      if (qData.context && qData.context.length) {
        html += qData.context.map(p => `<p>${escapeHTML(p)}</p>`).join('');
      }
      if (qData.materials && qData.materials.length) {
        html += '<div style="margin-top:10px; padding:10px; background:#fff; border:1px solid var(--border); border-radius:8px;">' +
                qData.materials.map(m => `<div style="font-size:13px; font-weight:700; color:var(--ink-2);">${m}</div>`).join('') +
                '</div>';
      }
      practiceContextContent.innerHTML = html;
    }

    // Subparts Tabs
    const parts = qData.parts || [];
    partNum = Math.max(1, Math.min(partNum || 1, parts.length));
    state.practice.partNum = partNum;
    localStorage.setItem('aiTrainer_practice_p', partNum);

    if (practicePartsTabs) {
      practicePartsTabs.innerHTML = parts.map(p => {
        const isActive = p.partNumber === partNum;
        return `<button class="part-nav-btn ${isActive ? 'active' : ''}" data-part="${p.partNumber}">
          第（${p.partNumber}）问 · ${p.points}分
        </button>`;
      }).join('');

      practicePartsTabs.querySelectorAll('.part-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          loadPracticeQuestion(qNum, parseInt(btn.dataset.part, 10));
        });
      });
    }

    // Render active part
    const activePart = parts[partNum - 1] || parts[0];
    renderPracticePart(qData, activePart);

    if (window.AI_TRAINER_TUTOR && window.AI_TRAINER_TUTOR.updateContext) {
      window.AI_TRAINER_TUTOR.updateContext();
    }
  }

  function renderPracticePart(qData, part) {
    if (!part) return;

    if (practicePartPrompt) {
      practicePartPrompt.textContent = part.prompt.join(' ');
    }

    // Textarea draft recovery
    const draftKey = getDraftKey(qData.number, part.partNumber);
    const savedDraft = localStorage.getItem(draftKey) || '';
    if (practiceTextarea) {
      practiceTextarea.value = savedDraft;
      updatePracticeWordCount();
    }

    // Checkpoints Checklist
    renderPracticeCheckpoints(qData.number, part);

    // Code Line-by-line guide and confusion matrix for Q4
    if (practiceCodeGuideBox) {
      if (qData.number === 4) {
        practiceCodeGuideBox.style.display = 'block';
        renderQ4CodeGuide(part);
      } else {
        practiceCodeGuideBox.style.display = 'none';
        practiceCodeGuideBox.innerHTML = '';
      }
    }

    // 3-tier answers
    renderPracticeTierAnswer(part);

    // Traps and lecture
    renderPracticeTraps(qData, part);
  }

  function updatePracticeWordCount() {
    if (!practiceTextarea || !practiceWordCount) return;
    const len = practiceTextarea.value.trim().length;
    practiceWordCount.textContent = `${len} 字`;
  }

  function renderPracticeCheckpoints(qNum, part) {
    if (!practiceCheckpointsList) return;
    const checksKey = getChecksKey(qNum, part.partNumber);
    const checkedMap = JSON.parse(localStorage.getItem(checksKey) || '{}');
    const checkpoints = part.checkpoints || [];

    if (!checkpoints.length) {
      practiceCheckpointsList.innerHTML = '<div style="font-size:12.5px; color:var(--ink-2);">暂无细分采分点自测项</div>';
      if (practiceCheckScore) practiceCheckScore.textContent = '';
      return;
    }

    practiceCheckpointsList.innerHTML = checkpoints.map((item, idx) => {
      const isChecked = Boolean(checkedMap[idx]);
      return `<label class="checkpoint-item ${isChecked ? 'checked' : ''}">
        <input type="checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''}>
        <span>${item}</span>
      </label>`;
    }).join('');

    const countChecked = Object.values(checkedMap).filter(Boolean).length;
    if (practiceCheckScore) {
      practiceCheckScore.textContent = `已掌握 ${countChecked} / ${checkpoints.length} 项（自测得分：${Math.round((countChecked / checkpoints.length) * part.points)} / ${part.points} 分）`;
    }

    practiceCheckpointsList.querySelectorAll('input[type="checkbox"]').forEach(box => {
      box.addEventListener('change', () => {
        const idx = box.dataset.idx;
        checkedMap[idx] = box.checked;
        localStorage.setItem(checksKey, JSON.stringify(checkedMap));
        box.closest('.checkpoint-item').classList.toggle('checked', box.checked);
        const curCount = Object.values(checkedMap).filter(Boolean).length;
        practiceCheckScore.textContent = `已掌握 ${curCount} / ${checkpoints.length} 项（自测得分：${Math.round((curCount / checkpoints.length) * part.points)} / ${part.points} 分）`;
        sfx.beep(520, 0.05, 'triangle', 0.1);
      });
    });
  }

  function renderPracticeTierAnswer(part) {
    if (!practiceTierContent) return;
    const currentTier = state.practice.tier || 'brief';

    let content = '';
    if (currentTier === 'brief') {
      content = part.baodiBrief || '暂无极简保底版，请参考练习版或官方答案。';
    } else if (currentTier === 'practice') {
      content = part.baodiPractice || '暂无练习版。';
    } else {
      content = (part.standardAnswer && part.standardAnswer.join('\n\n')) || '暂无官方参考答案。';
    }

    practiceTierContent.textContent = content;

    practiceTierBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === currentTier);
    });
  }

  function renderPracticeTraps(qData, part) {
    if (!practiceTrapsContent) return;
    let html = '';

    // Traps
    if (qData.traps && qData.traps.length) {
      html += '<div style="margin-bottom:8px;">' +
              qData.traps.map(t => `<div class="trap-item">⚠️ ${escapeHTML(t)}</div>`).join('') +
              '</div>';
    }

    // Lecture
    if (part.lecture) {
      html += `<div class="lecture-item">
        <div style="font-weight:900; color:#b8492c; margin-bottom:4px;">🎙️ 名师逐字精讲（第 ${part.pages || ''} 页）：</div>
        <div>${escapeHTML(part.lecture)}</div>
      </div>`;
    }

    practiceTrapsContent.innerHTML = html || '<div style="font-size:13px; color:var(--ink-2);">本问暂无特别避坑提示</div>';
  }

  function renderQ4CodeGuide(part) {
    if (!practiceCodeGuideBox) return;
    let html = '';

    // If confusion matrix part
    if (part.partNumber === 3) {
      html += `<div style="background:#fff; border:2px solid var(--border); border-radius:10px; padding:12px; margin-bottom:12px;">
        <div style="font-weight:900; font-size:14px; color:#1e1e38; margin-bottom:6px;">🧮 混淆矩阵与四大评估指标全览：</div>
        <table class="tactics-table" style="margin-bottom:8px;">
          <thead>
            <tr><th>真实情况 \ 预测结果</th><th>预测有效 (Positive=1)</th><th>预测无效 (Negative=0)</th><th>合计</th></tr>
          </thead>
          <tbody>
            <tr><td><b>实际有效 (1)</b></td><td style="color:#16a34a; font-weight:800;">TP = 80</td><td style="color:#dc2626;">FN = 20</td><td>100</td></tr>
            <tr><td><b>实际无效 (0)</b></td><td style="color:#dc2626;">FP = 20</td><td style="color:#16a34a; font-weight:800;">TN = 80</td><td>100</td></tr>
          </tbody>
        </table>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
          <div style="background:#f0fdf4; border:1px solid #86efac; padding:8px 10px; border-radius:6px; font-size:13px;">
            <b>准确率 (Accuracy)</b>：(80+80)/200 = <b>80%</b>
          </div>
          <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:8px 10px; border-radius:6px; font-size:13px;">
            <b>精确率 (Precision)</b>：80/(80+20) = <b>80%</b>
          </div>
          <div style="background:#fefce8; border:1px solid #fef08a; padding:8px 10px; border-radius:6px; font-size:13px;">
            <b>召回率 (Recall)</b>：80/(80+20) = <b>80%</b>
          </div>
          <div style="background:#faf5ff; border:1px solid #e9d5ff; padding:8px 10px; border-radius:6px; font-size:13px;">
            <b>F1-Score</b>：2×0.8×0.8/(0.8+0.8) = <b>80%</b>
          </div>
        </div>
      </div>`;
    }

    // If python code guide
    if (part.notebookGuides && part.notebookGuides.length) {
      html += `<div style="background:#f8fafc; border:1.5px solid var(--border); border-radius:10px; padding:12px;">
        <div style="font-weight:900; font-size:14px; color:#1e1e38; margin-bottom:6px;">🐍 零基础 Python 代码逐行拆解与注释：</div>
        <ol style="margin:0; padding-left:22px; font-size:13px; line-height:1.7; color:var(--ink);">
          ${part.notebookGuides.map(g => `<li>${escapeHTML(g)}</li>`).join('')}
        </ol>
      </div>`;
    }

    practiceCodeGuideBox.innerHTML = html;
  }

  // Bind practice events
  if (practiceQSelect) {
    practiceQSelect.addEventListener('change', () => {
      loadPracticeQuestion(parseInt(practiceQSelect.value, 10), 1);
    });
  }

  if (practiceTextarea) {
    practiceTextarea.addEventListener('input', () => {
      updatePracticeWordCount();
      const qNum = state.practice.qNum;
      const partNum = state.practice.partNum;
      const key = getDraftKey(qNum, partNum);
      localStorage.setItem(key, practiceTextarea.value);
      if (practiceAutosaveTip) {
        practiceAutosaveTip.textContent = '💾 实时已保存';
      }
    });
  }

  if (btnPracticeClearDraft) {
    btnPracticeClearDraft.addEventListener('click', () => {
      if (!confirm('确定清空当前小问的答题草稿吗？')) return;
      if (practiceTextarea) practiceTextarea.value = '';
      const key = getDraftKey(state.practice.qNum, state.practice.partNum);
      localStorage.removeItem(key);
      updatePracticeWordCount();
      showToast('草稿已清空');
    });
  }

  if (practiceTierBtns) {
    practiceTierBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        state.practice.tier = btn.dataset.tier;
        localStorage.setItem('aiTrainer_practice_tier', state.practice.tier);
        const questions = getPracticeQuestions();
        const qData = questions[state.practice.qNum - 1];
        if (qData) {
          const part = qData.parts[state.practice.partNum - 1];
          renderPracticeTierAnswer(part);
        }
      });
    });
  }

  if (btnPracticePrevQ) {
    btnPracticePrevQ.addEventListener('click', () => {
      loadPracticeQuestion(state.practice.qNum - 1, 1);
    });
  }
  if (btnPracticeNextQ) {
    btnPracticeNextQ.addEventListener('click', () => {
      loadPracticeQuestion(state.practice.qNum + 1, 1);
    });
  }
  if (btnPracticePrevP) {
    btnPracticePrevP.addEventListener('click', () => {
      loadPracticeQuestion(state.practice.qNum, state.practice.partNum - 1);
    });
  }
  if (btnPracticeNextP) {
    btnPracticeNextP.addEventListener('click', () => {
      const questions = getPracticeQuestions();
      const qData = questions[state.practice.qNum - 1];
      if (qData && state.practice.partNum < qData.parts.length) {
        loadPracticeQuestion(state.practice.qNum, state.practice.partNum + 1);
      } else {
        loadPracticeQuestion(state.practice.qNum + 1, 1);
      }
    });
  }

  // Ask AI Tutor buttons
  if (btnPracticeAskAi && window.AI_TRAINER_TUTOR) {
    btnPracticeAskAi.addEventListener('click', () => {
      const q = state.practice.qNum;
      const p = state.practice.partNum;
      window.AI_TRAINER_TUTOR.openTutorWithPrompt(`老师好！请用零基础大白话为我深度解析【第 ${q} 题 第（${p}）问】的答题骨架与采分要点。`);
    });
  }

  if (btnPracticeGradeAi && window.AI_TRAINER_TUTOR) {
    btnPracticeGradeAi.addEventListener('click', () => {
      const draft = practiceTextarea ? practiceTextarea.value.trim() : '';
      const q = state.practice.qNum;
      const p = state.practice.partNum;
      if (!draft) {
        showToast('请先在草稿框输入您的作答内容，再请求 AI 批改！');
        return;
      }
      window.AI_TRAINER_TUTOR.openTutorWithPrompt(`老师好，这是我针对【实操 09 卷 第 ${q} 题 第（${p}）问】写的回答草稿：\n\n${draft}\n\n请按照官方采分点为我批改：指出现存得分点、遗漏要点，并给出极简保底修改建议！`);
    });
  }

  if (btnClozeAskAi && window.AI_TRAINER_TUTOR) {
    btnClozeAskAi.addEventListener('click', () => {
      const item = state.cloze.currentItem;
      window.AI_TRAINER_TUTOR.openTutorWithPrompt(`请为我解析实操考点【${item ? item.title : '实操大题'}】的核心采分公式与记忆技巧。`);
    });
  }

  if (btnTheoryAskAi && window.AI_TRAINER_TUTOR) {
    btnTheoryAskAi.addEventListener('click', () => {
      const q = state.theory.currentQuestion;
      window.AI_TRAINER_TUTOR.openTutorWithPrompt(`请为我大白话解析理论题【${q ? q.q : '当前题目'}】的考点，为什么选 ${q ? q.ans : ''}？`);
    });
  }

  // ==========================================================
  // Tactics Modal (🗺️ 考点战术工具箱)
  // ==========================================================

  function renderTacticsModal(tab) {
    if (!tacticsBody) return;
    const L = window.AI_TRAINER_LESSONS;
    if (!L || !L.tactics) {
      tacticsBody.innerHTML = '<p>战术数据加载中...</p>';
      return;
    }

    const T = L.tactics;
    document.querySelectorAll('#tactics-modal .dir-nav-tabs .btn').forEach(btn => {
      btn.classList.toggle('active', btn.id === `tactics-tab-${tab}`);
    });

    let html = '';
    if (tab === 'plan') {
      html += `
        <div style="background:#fff8ec; border:2px solid var(--yellow); border-radius:10px; padding:12px 16px; margin-bottom:16px;">
          <div style="font-weight:900; font-size:15px; color:#b8492c; margin-bottom:4px;">🎯 73 分及格稳过策略（满分 100 分 · 及格线 60 分 · 容错余量 13 分）</div>
          <div style="font-size:13px; color:var(--ink-2); line-height:1.6;">
            考场上不需要追求满分！每题设定“保底目标分”，把字数控制在极简保底版 2,900 字内，严格按小标题展开，轻松拿下 73 分安全过关。
          </div>
        </div>
        <table class="tactics-table">
          <thead>
            <tr><th>题号</th><th>考核工作内容</th><th>总分</th><th>目标分</th><th>建议用时</th><th>文体类型</th><th>核心打法与骨架</th></tr>
          </thead>
          <tbody>
            ${T.passingPlan.map(p => `
              <tr>
                <td><b>第 ${p.q} 题</b></td>
                <td>${p.title}</td>
                <td>${p.points} 分</td>
                <td style="color:#10b981; font-weight:900;">${p.target} 分</td>
                <td>${p.minutes} 分钟</td>
                <td><span class="badge-pill">${p.style}</span></td>
                <td style="font-size:12.5px;">${p.strategy}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-top:14px;">
          ${T.reassurances.map(r => `
            <div style="background:#fff; border:1.5px solid var(--border); border-radius:8px; padding:10px 12px;">
              <div style="font-weight:900; color:#3b6bff; margin-bottom:4px;">🛡️ ${r.title}</div>
              <div style="font-size:12.5px; color:var(--ink-2); line-height:1.6;">${r.desc}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tab === 'order') {
      html += `
        <div style="background:#eff6ff; border:2px solid #bfdbfe; border-radius:10px; padding:12px 16px; margin-bottom:16px;">
          <div style="font-weight:900; font-size:15px; color:#1d4ed8; margin-bottom:4px;">🧭 考场做题黄金排布（180 分钟按把握做，不按题号做！）</div>
          <div style="font-size:13px; color:var(--ink-2); line-height:1.6;">
            开场先圈卷 8 分钟，接着直奔题 6（照手册直接抄拿下 16 分），再做题 4 前三问（代码填空白捡 8 分），信心大增！
          </div>
        </div>
        <table class="tactics-table">
          <thead>
            <tr><th>做题次序</th><th>考场阶段 / 题号</th><th>建议用时</th><th>重点任务与得分战术</th></tr>
          </thead>
          <tbody>
            ${T.examOrder.map(o => `
              <tr>
                <td><span class="badge-pill" style="background:#ffd23f; color:#000;">步骤 ${o.step}</span></td>
                <td><b>${o.q}</b></td>
                <td>${o.time}</td>
                <td>${o.focus}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (tab === 'rhymes') {
      html += `
        <div style="margin-bottom:12px; font-weight:800; color:var(--ink);">⚡ 三级实操 8 大考核题型零基础秒记口诀：</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${T.passingPlan.map(p => {
            const qData = L.paper09Questions[p.q - 1];
            return `
              <div class="rhyme-banner" style="margin-bottom:0;">
                <div class="rhyme-icon">第${p.q}题</div>
                <div class="rhyme-content">
                  <div class="rhyme-text">${qData ? qData.rhyme : ''}</div>
                  <div class="rhyme-sub">${qData ? qData.rhymeExplanation : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'facts') {
      const facts = (L.quickFacts && L.quickFacts['09']) || [];
      html += `
        <div style="margin-bottom:12px; font-weight:800; color:var(--ink);">🔢 考场全卷必背核心数字与判断规范速查：</div>
        <table class="tactics-table">
          <thead>
            <tr><th>必背核心数字 / 规范</th><th>在题中的使用场景</th><th>对应考查小问</th></tr>
          </thead>
          <tbody>
            ${facts.map(([id, val, desc]) => `
              <tr>
                <td style="color:#b8492c; font-weight:900; font-size:15px;">${val}</td>
                <td>${desc}</td>
                <td><span class="badge-pill">第 ${id[1]} 题第(${id[4]})问</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (tab === 'math') {
      const cm = T.confusionMatrix || { TP: 80, FP: 20, FN: 20, TN: 80 };
      html += `
        <div style="background:#fff; border:2px solid var(--border); border-radius:10px; padding:16px;">
          <div style="font-weight:900; font-size:16px; color:#1e1e38; margin-bottom:10px;">🧮 题 4 算法评估混淆矩阵与四大公式计算器</div>
          <table class="tactics-table" style="max-width:540px; margin-bottom:14px;">
            <thead>
              <tr><th>真实 \ 预测</th><th>预测有效 (1)</th><th>预测无效 (0)</th></tr>
            </thead>
            <tbody>
              <tr><td>实际有效 (1)</td><td style="color:#10b981; font-weight:900;">TP = ${cm.TP}</td><td style="color:#ef4444;">FN = ${cm.FN}</td></tr>
              <tr><td>实际无效 (0)</td><td style="color:#ef4444;">FP = ${cm.FP}</td><td style="color:#10b981; font-weight:900;">TN = ${cm.TN}</td></tr>
            </tbody>
          </table>
          <div style="font-size:13.5px; line-height:1.8; color:var(--ink);">
            <p>1. <b>准确率 (Accuracy)</b> = (TP+TN)/(全部样本) = (80+80)/200 = <b style="color:#10b981;">80%</b></p>
            <p>2. <b>精确率 (Precision)</b> = TP/(TP+FP) = 80/(80+20) = <b style="color:#10b981;">80%</b></p>
            <p>3. <b>召回率 (Recall)</b> = TP/(TP+FN) = 80/(80+20) = <b style="color:#10b981;">80%</b></p>
            <p>4. <b>F1-Score</b> = 2×Precision×Recall / (Precision+Recall) = 2×0.8×0.8 / 1.6 = <b style="color:#10b981;">80%</b></p>
          </div>
        </div>
      `;
    }

    tacticsBody.innerHTML = html;
  }

  if (btnTactics && tacticsModal) {
    btnTactics.addEventListener('click', () => {
      tacticsModal.style.display = 'flex';
      renderTacticsModal('plan');
    });
  }
  if (btnCloseTactics && tacticsModal) {
    btnCloseTactics.addEventListener('click', () => {
      tacticsModal.style.display = 'none';
    });
  }
  ['plan', 'order', 'rhymes', 'facts', 'math'].forEach(tabName => {
    const btn = document.getElementById(`tactics-tab-${tabName}`);
    if (btn) {
      btn.addEventListener('click', () => renderTacticsModal(tabName));
    }
  });

  // ==========================================================
  // Mock Exam Modal (⏱️ 180 分钟整卷全真模拟考场)
  // ==========================================================

  function initMockExam() {
    if (!mockBody || !mockJumpChips) return;
    const questions = getPracticeQuestions();
    const L = window.AI_TRAINER_LESSONS;
    const order = (L && L.tactics && L.tactics.examOrder) || [];

    // Jump chips
    mockJumpChips.innerHTML = order.map(o => `
      <button class="btn" style="font-size:11.5px; padding:3px 9px; white-space:nowrap;" onclick="document.getElementById('mock-card-${o.q.replace(/[^0-9]/g, '') || '1'}')?.scrollIntoView({behavior:'smooth'})">
        ${o.step}. ${o.q}
      </button>
    `).join('');

    // Question cards
    mockBody.innerHTML = questions.map(q => {
      return `
        <div class="mock-question-card" id="mock-card-${q.number}" style="background:#fff; border:2px solid var(--border); border-radius:12px; padding:16px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1.5px solid var(--border); padding-bottom:8px;">
            <div style="font-weight:900; font-size:16px; color:var(--ink);">第 ${q.number} 题：${q.title}（${q.points} 分）</div>
            <div style="font-size:12px; font-weight:800; color:#10b981;">目标保底：${q.targetPoints} 分</div>
          </div>
          <div style="font-size:13px; color:#b8492c; font-weight:800; margin-bottom:8px;">💡 口诀：${q.rhyme}</div>
          ${q.parts.map(p => {
            const draftKey = getDraftKey(q.number, p.partNumber);
            const draft = localStorage.getItem(draftKey) || '';
            return `
              <div style="margin-top:12px; padding:10px; background:#faf8f5; border-radius:8px; border:1px solid var(--border);">
                <div style="font-weight:800; font-size:14px; margin-bottom:6px;">第（${p.partNumber}）问（${p.points} 分）：${p.prompt.join(' ')}</div>
                <textarea style="width:100%; min-height:90px; padding:8px; font-size:13.5px; border:1px solid var(--border); border-radius:6px; font-family:inherit;" placeholder="作答草稿…" oninput="localStorage.setItem('${draftKey}', this.value)">${draft}</textarea>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  function updateMockTimerUI() {
    if (!mockTimerDisplay) return;
    const m = Math.floor(state.mock.timeLeft / 60);
    const s = state.mock.timeLeft % 60;
    mockTimerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function toggleMockTimer() {
    if (state.mock.isRunning) {
      clearInterval(state.mock.timerId);
      state.mock.isRunning = false;
      if (btnMockTimerToggle) btnMockTimerToggle.textContent = '继续计时';
    } else {
      state.mock.isRunning = true;
      if (btnMockTimerToggle) btnMockTimerToggle.textContent = '暂停计时';
      state.mock.timerId = setInterval(() => {
        if (state.mock.timeLeft > 0) {
          state.mock.timeLeft--;
          updateMockTimerUI();
        } else {
          clearInterval(state.mock.timerId);
          state.mock.isRunning = false;
          alert('⏰ 180 分钟考试时间到！请停止作答，对照标准采分点核验得分。');
        }
      }, 1000);
    }
  }

  if (btnMock && mockModal) {
    btnMock.addEventListener('click', () => {
      mockModal.style.display = 'flex';
      initMockExam();
      if (!state.mock.isRunning && state.mock.timeLeft === 180 * 60) {
        toggleMockTimer();
      }
    });
  }
  if (btnCloseMock && mockModal) {
    btnCloseMock.addEventListener('click', () => {
      mockModal.style.display = 'none';
    });
  }
  if (btnMockTimerToggle) {
    btnMockTimerToggle.addEventListener('click', toggleMockTimer);
  }

  // Expose global controller
  window.AI_TRAINER_APP = {
    get currentPracticeQuestion() {
      const list = getPracticeQuestions();
      return list[state.practice.qNum - 1];
    },
    get currentPracticePart() {
      const q = this.currentPracticeQuestion;
      if (!q) return null;
      return q.parts[state.practice.partNum - 1];
    },
    get currentClozeItem() {
      return state.cloze.currentItem;
    },
    get currentTheoryItem() {
      return state.theory.currentQuestion;
    },
    getCurrentDraftText: () => {
      return practiceTextarea ? practiceTextarea.value : '';
    },
    showToast: showToast,
    switchMode: switchMode
  };

  init();
})();
