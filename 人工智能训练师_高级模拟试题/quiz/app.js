/**
 * 人工智能训练师（三级／高级）全真模拟考试 · 刷题与实操采分点挖空连击
 * 严格对齐原卷 24 道实操大题（01卷 1~8、09卷 1~8、07卷 1~8）及 200 道理论考题
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

  // --- 2. Application State ---
  const state = {
    bank: null,
    mode: 'cloze', // 'cloze' | 'theory' | 'memorize'
    cloze: {
      filter: 'all', // 'all' | '01' | '09' | '07' | 'mistakes'
      list: [],
      index: 0,
      activeBlank: 0,
      filled: {}, // blankIdx -> { text, status: 'correct'|'revealed' }
      chips: []
    },
    theory: {
      filter: 'all',
      list: [],
      index: 0,
      answered: false,
      selected: null,
      isRandom: localStorage.getItem('aiTrainer_theoryRandom') === 'true'
    },
    stats: {
      combo: 0,
      maxCombo: parseInt(localStorage.getItem('aiTrainer_maxCombo') || '0', 10),
      correctAttempts: 0,
      totalAttempts: 0,
      passedItems: new Set(JSON.parse(localStorage.getItem('aiTrainer_passed') || '[]')),
      mistakeItems: new Set(JSON.parse(localStorage.getItem('aiTrainer_mistakes') || '[]'))
    }
  };

  // --- 3. DOM Elements ---
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const btnSound = $('#btn-sound');
  const btnReset = $('#btn-reset');
  const modeTabs = $$('.mode-tab');
  const chapterScroll = $('#chapter-filters');

  const btnOpenDir = $('#btn-open-dir');
  const dirModal = $('#dir-modal');
  const btnCloseDir = $('#btn-close-dir');
  const dirBody = $('#dir-body');

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
    statProgress.textContent = `${passedCount} 掌握 / ${mistakeCount} 错题`;

    // Save
    localStorage.setItem('aiTrainer_maxCombo', state.stats.maxCombo);
    localStorage.setItem('aiTrainer_passed', JSON.stringify([...state.stats.passedItems]));
    localStorage.setItem('aiTrainer_mistakes', JSON.stringify([...state.stats.mistakeItems]));
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
          applyClozeFilter();
          if (state.mode === 'memorize') renderMemorizeView();
        } else {
          state.theory.filter = ch.id;
          applyTheoryFilter();
        }
        renderChapterFilters();
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
        applyTheoryFilter();
      }
      renderChapterFilters();
    });
    chapterScroll.appendChild(mistakeChip);
  }

  // --- 5. Cloze Mode Logic (24 Big Practical Questions) ---
  function applyClozeFilter() {
    if (state.cloze.filter === 'all') {
      state.cloze.list = state.bank.practical;
    } else if (state.cloze.filter === 'mistakes') {
      state.cloze.list = state.bank.practical.filter(it => state.stats.mistakeItems.has(it.id));
      if (state.cloze.list.length === 0) {
        showToast('暂无实操错题！已切回全部 24 大题');
        state.cloze.filter = 'all';
        state.cloze.list = state.bank.practical;
      }
    } else {
      state.cloze.list = state.bank.practical.filter(it => it.paperKey === state.cloze.filter || it.chapter === state.cloze.filter);
    }
    state.cloze.index = 0;
    loadClozeItem();
  }

  function loadClozeItem() {
    if (!state.cloze.list || state.cloze.list.length === 0) return;
    const item = state.cloze.list[state.cloze.index];
    state.cloze.filled = {};
    state.cloze.activeBlank = 0;

    $('#cloze-title').textContent = item.title || item.q;
    $('#cloze-tag-ch').textContent = item.tag || item.paperName;
    $('#cloze-tag-score').textContent = `${item.b.length} 处采分点挖空`;
    $('#cloze-index-badge').textContent = `${state.cloze.index + 1} / ${state.cloze.list.length}`;

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
          <div style="margin-top:8px;">
            <button id="btn-done-next" class="btn btn-primary" style="padding:8px 20px;">进入下一题 ▶</button>
          </div>
        </div>`;
      const nextBtn = $('#btn-done-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => $('#btn-cloze-next').click());
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

      // Check if all filled
      const allDone = item.b.every((_, idx) => !!state.cloze.filled[idx]);
      if (allDone) {
        state.stats.passedItems.add(item.id);
        state.stats.mistakeItems.delete(item.id);
        sfx.playWin();
        showToast('🏆 完美通关！本题要点已完全掌握！');
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
    } else {
      // Wrong!
      sfx.playWrong();
      state.stats.combo = 0;
      state.stats.mistakeItems.add(item.id);
      showToast('❌ 选错了，连击中断！仔细阅读题干语境～');
      updateHUD();
    }
  }

  // --- 6. 24 大题目录导航抽屉 ---
  function renderDirectoryModal() {
    if (!dirBody) return;
    dirBody.innerHTML = '';

    const papers = [
      { key: '01', title: '01 卷 · 自动化营销模型业务（共 8 大题）' },
      { key: '09', title: '09 卷 · 验证码识别模型与 RPA（共 8 大题）' },
      { key: '07', title: '07 卷 · 自然场景吸烟检测模型（共 8 大题）' }
    ];

    const currentItem = state.cloze.list[state.cloze.index];

    papers.forEach(p => {
      const groupEl = document.createElement('div');
      groupEl.innerHTML = `<div class="dir-group-title"><span>📘</span> <span>${p.title}</span></div>`;

      const gridEl = document.createElement('div');
      gridEl.className = 'dir-grid';

      const items = state.bank.practical.filter(it => it.paperKey === p.key);
      items.forEach(it => {
        const btn = document.createElement('button');
        const isActive = currentItem && currentItem.id === it.id;
        const isPassed = state.stats.passedItems.has(it.id);
        const isMistake = state.stats.mistakeItems.has(it.id);

        btn.className = 'dir-item-btn' + (isActive ? ' active' : '');
        btn.innerHTML = `
          <div class="dir-item-top">
            <span class="dir-item-tag">${it.tag}</span>
            <span class="dir-item-count">
              ${isPassed ? '✅ 已掌握' : (isMistake ? '❌ 有错题' : `🎯 ${it.b.length} 采分点`)}
            </span>
          </div>
          <div class="dir-item-name">${it.title.replace(/^(\d{2}题\d+[:：]\s*)/, '')}</div>
        `;

        btn.addEventListener('click', () => {
          // Switch to cloze mode if not in cloze
          if (state.mode !== 'cloze') {
            const clozeTab = document.querySelector('.mode-tab[data-mode="cloze"]');
            if (clozeTab) clozeTab.click();
          }
          // Set filter to 'all' or paperKey
          state.cloze.filter = 'all';
          state.cloze.list = state.bank.practical;
          const foundIdx = state.cloze.list.findIndex(x => x.id === it.id);
          state.cloze.index = foundIdx >= 0 ? foundIdx : 0;
          renderChapterFilters();
          loadClozeItem();
          closeDirectoryModal();
          showToast(`已跳转至：${it.title}`);
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

  // --- 7. Theory Quiz Logic (200 Questions) ---
  function applyTheoryFilter(keepIndex = false) {
    let sourceList = [];
    if (state.theory.filter === 'all') {
      sourceList = [...state.bank.theory];
    } else if (state.theory.filter === 'mistakes') {
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

    if (!keepIndex) {
      state.theory.index = 0;
    } else {
      if (state.theory.index >= state.theory.list.length) {
        state.theory.index = 0;
      }
    }

    loadTheoryQuestion();
    updateShuffleBtnUI();
  }

  function loadTheoryQuestion() {
    if (!state.theory.list || state.theory.list.length === 0) return;
    const item = state.theory.list[state.theory.index];
    state.theory.answered = false;
    state.theory.selected = null;

    $('#theory-title').textContent = item.q;
    $('#theory-tag-ch').textContent = item.chapter || '理论知识';
    $('#theory-tag-type').textContent = item.type === 'judge' ? '判断题' : (item.type === 'multi' ? '多选题' : '单选题');
    $('#theory-tag-num').textContent = `题号 ${item.num}`;
    $('#theory-index-badge').textContent = `${state.theory.index + 1} / ${state.theory.list.length}`;

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
      btn.addEventListener('click', () => handleTheoryChoice(key, item, btn));
      optBox.appendChild(btn);
    });

    // Hide analysis
    $('#theory-analysis').style.display = 'none';
  }

  function handleTheoryChoice(chosenKey, item, clickedBtn) {
    if (state.theory.answered) return;
    state.theory.answered = true;
    state.theory.selected = chosenKey;
    state.stats.totalAttempts++;

    const isMatch = chosenKey.trim() === item.answer.trim() || item.answer.includes(chosenKey);

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
      state.stats.mistakeItems.delete(item.id);
      sfx.playCorrect();
      if (state.stats.combo > 0 && state.stats.combo % 5 === 0) {
        sfx.playCombo(state.stats.combo);
      }
    } else {
      clickedBtn.classList.add('wrong');
      state.stats.combo = 0;
      state.stats.mistakeItems.add(item.id);
      sfx.playWrong();
    }

    // Show analysis
    $('#theory-ans-text').textContent = item.answer;
    $('#theory-analysis-text').textContent = item.analysis || '暂无详细考点解析。';
    $('#theory-analysis').style.display = 'flex';

    updateHUD();
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
      card.className = 'memorize-card';

      let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="tag tag-ch">${item.tag || item.paperName}</span>
          <span class="tag tag-score">${item.b.length} 处采分要点</span>
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
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;

      viewCloze.style.display = state.mode === 'cloze' ? 'flex' : 'none';
      viewTheory.style.display = state.mode === 'theory' ? 'flex' : 'none';
      viewMemorize.style.display = state.mode === 'memorize' ? 'flex' : 'none';

      renderChapterFilters();
      if (state.mode === 'cloze') loadClozeItem();
      else if (state.mode === 'theory') loadTheoryQuestion();
      else if (state.mode === 'memorize') renderMemorizeView();
    });
  });

  // Directory Modal Triggers
  if (btnOpenDir) {
    btnOpenDir.addEventListener('click', openDirectoryModal);
  }
  if (btnCloseDir) {
    btnCloseDir.addEventListener('click', closeDirectoryModal);
  }
  if (dirModal) {
    dirModal.addEventListener('click', e => {
      if (e.target === dirModal) closeDirectoryModal();
    });
  }

  // Sound Toggle
  btnSound.addEventListener('click', () => {
    const isUnmuted = sfx.toggleMute();
    btnSound.textContent = isUnmuted ? '🔊' : '🔇';
    showToast(isUnmuted ? '音效已开启' : '音效已静音');
  });
  if (sfx.muted) btnSound.textContent = '🔇';

  // Reset Progress
  btnReset.addEventListener('click', () => {
    if (confirm('确定要清空做题进度与错题记录吗？')) {
      state.stats.combo = 0;
      state.stats.maxCombo = 0;
      state.stats.correctAttempts = 0;
      state.stats.totalAttempts = 0;
      state.stats.passedItems.clear();
      state.stats.mistakeItems.clear();
      updateHUD();
      showToast('做题记录已重置！');
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
    loadClozeItem();
    showToast('已重置本题状态');
  });
  $('#btn-cloze-reveal').addEventListener('click', () => {
    const item = state.cloze.list[state.cloze.index];
    item.b.forEach((ans, idx) => {
      state.cloze.filled[idx] = { text: ans, status: 'revealed' };
    });
    renderClozeBody(item);
    renderChipsForActiveBlank(item);
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
    if (state.theory.index > 0) {
      state.theory.index--;
      loadTheoryQuestion();
    } else {
      showToast('已经是第一题了！');
    }
  });
  $('#btn-theory-next').addEventListener('click', () => {
    if (state.theory.index < state.theory.list.length - 1) {
      state.theory.index++;
      loadTheoryQuestion();
    } else {
      showToast('已经是最后一题了！');
    }
  });
  $('#btn-theory-show-ans').addEventListener('click', () => {
    const item = state.theory.list[state.theory.index];
    $('#theory-ans-text').textContent = item.answer;
    $('#theory-analysis-text').textContent = item.analysis || '暂无解析。';
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
    updateHUD();
  });

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

  // --- 10. Load Bank Data ---
  async function init() {
    try {
      if (window.AI_TRAINER_BANK) {
        state.bank = window.AI_TRAINER_BANK;
      } else {
        const resp = await fetch('bank.json');
        state.bank = await resp.json();
      }
      console.log('Loaded AI Trainer Bank:', state.bank.meta);

      applyClozeFilter();
      applyTheoryFilter();
      renderChapterFilters();
      updateHUD();
    } catch (e) {
      console.error('Failed to load bank:', e);
      showToast('题库加载失败，请刷新重试');
    }
  }

  init();
})();
