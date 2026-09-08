/**
 * community.js — 读者共建组件（评论区 / 纠错 / 记忆口诀）
 *
 * 由 scripts/inject-community.mjs 注入到各内容页：
 *   <div id="community-root" data-theme="transparent_dark(可选)"></div>
 *   <script src="/community.js" defer></script>
 *
 * 数据落在 GitHub：
 *   - 评论区/口诀 → Discussions（giscus，映射 pathname，每页一条讨论）
 *   - 纠错 → 预填好的 Issue（labels=纠错）
 * 前提：仓库开启 Discussions 并安装 giscus App（https://github.com/apps/giscus）。
 */
(function () {
  'use strict';
  if (location.protocol === 'file:') return; // 本地 file:// 预览不注入
  var root = document.getElementById('community-root');
  if (!root || root.getAttribute('data-booted')) return;
  root.setAttribute('data-booted', '1');

  var REPO = 'ppray/ppray.github.io';
  var REPO_ID = 'R_kgDOOcFjEw';
  var CATEGORY = 'Announcements'; // 仅维护者可建讨论；改名后需同步这里的显示名
  var CATEGORY_ID = 'DIC_kwDOOcFjE84DFK3Q';
  var DISCUSSIONS_URL = 'https://github.com/' + REPO + '/discussions';

  var theme = root.getAttribute('data-theme') || 'light';
  var isDark = theme.indexOf('dark') !== -1 || theme === 'cobalt' || theme === 'purple_dark';

  function pageTitle() {
    var t = document.title || '';
    var seg = t.split(/[·|—–]/)[0].trim();
    return seg || t || location.pathname;
  }

  function getSelectionText() {
    try {
      return String(window.getSelection ? window.getSelection() : '').trim();
    } catch (e) { return ''; }
  }

  function issueUrl() {
    var sel = getSelectionText().slice(0, 300);
    var body = '页面标题：' + document.title + '\n' +
      '页面地址：' + location.origin + location.pathname + '\n' +
      '提交时间：' + new Date().toLocaleString('zh-CN') + '\n\n' +
      '问题描述（请补充具体位置和正确内容）：\n';
    if (sel) body += '\n---\n我在页面上选中的内容：\n> ' + sel.replace(/\n+/g, '\n> ') + '\n';
    return 'https://github.com/' + REPO + '/issues/new' +
      '?labels=' + encodeURIComponent('纠错') +
      '&title=' + encodeURIComponent('【纠错】' + pageTitle()) +
      '&body=' + encodeURIComponent(body);
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* 忽略：老环境复制失败不影响主流程 */ }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('community-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'community-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'community-toast community-toast--show' + (isDark ? ' community-toast--dark' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'community-toast' + (isDark ? ' community-toast--dark' : ''); }, 2600);
  }

  // ---------- 样式 ----------
  var css = [
    '#community-root{position:relative;z-index:1;max-width:920px;margin:28px auto 40px;padding:0 14px;',
    'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}',
    '@media print{#community-root{display:none!important}}',
    '.community-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;',
    'padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#334155;}',
    '.community-bar .community-title{font-weight:600;margin-right:auto;white-space:nowrap;}',
    '.c-btn{cursor:pointer;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;',
    'padding:4px 10px;font-size:13px;line-height:1.5;text-decoration:none;white-space:nowrap;}',
    '.c-btn:hover{border-color:#94a3b8;background:#f1f5f9;}',
    '.c-link{font-size:13px;color:#64748b;text-decoration:none;white-space:nowrap;}',
    '.c-link:hover{color:#334155;text-decoration:underline;}',
    '.community-giscus{margin-top:12px;}',
    '.community-note{margin-top:6px;font-size:12px;color:#94a3b8;}',
    '.community-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);',
    'background:#0f172a;color:#f1f5f9;padding:8px 16px;border-radius:8px;font-size:13px;',
    'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:2147483647;',
    'font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.community-toast--show{opacity:1;transform:translateX(-50%) translateY(0);}',
    // 深色主题（游戏页等）
    '.community-bar.community-dark{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#d6d3d1;}',
    '.community-dark .c-btn{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#e7e5e4;}',
    '.community-dark .c-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);}',
    '.community-dark .c-link{color:#a8a29e;}',
    '.community-dark .c-link:hover{color:#e7e5e4;}',
    '.community-toast--dark{background:#f5f5f4;color:#1c1917;}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- 结构 ----------
  var section = document.createElement('section');
  section.className = 'community-bar' + (isDark ? ' community-dark' : '');
  section.innerHTML =
    '<span class="community-title">📖 读者共建</span>' +
    '<button type="button" class="c-btn" id="community-report">✏️ 发现错误</button>' +
    '<button type="button" class="c-btn" id="community-mantra">💡 补充记忆口诀</button>' +
    '<a class="c-link" href="' + DISCUSSIONS_URL + '" target="_blank" rel="noopener">💬 全部讨论 ↗</a>';

  var giscusBox = document.createElement('div');
  giscusBox.className = 'community-giscus';

  var note = document.createElement('p');
  note.className = 'community-note';
  note.textContent = '评论与口诀存储于 GitHub Discussions；纠错会创建带页面信息的 Issue。';

  root.appendChild(section);
  root.appendChild(giscusBox);
  root.appendChild(note);

  // ---------- giscus 懒加载 ----------
  var giscusLoaded = false;
  function ensureGiscus() {
    if (giscusLoaded) return;
    giscusLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.setAttribute('data-repo', REPO);
    s.setAttribute('data-repo-id', REPO_ID);
    s.setAttribute('data-category', CATEGORY);
    s.setAttribute('data-category-id', CATEGORY_ID);
    s.setAttribute('data-mapping', 'pathname');
    s.setAttribute('data-strict', '0');
    s.setAttribute('data-reactions-enabled', '1');
    s.setAttribute('data-emit-metadata', '0');
    s.setAttribute('data-input-position', 'top');
    s.setAttribute('data-theme', theme);
    s.setAttribute('data-lang', 'zh-CN');
    s.setAttribute('data-loading', 'lazy');
    s.crossOrigin = 'anonymous';
    s.async = true;
    giscusBox.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        ensureGiscus();
        io.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    io.observe(giscusBox);
  } else {
    ensureGiscus();
  }

  // ---------- 按钮 ----------
  document.getElementById('community-report').addEventListener('click', function () {
    window.open(issueUrl(), '_blank', 'noopener');
  });
  document.getElementById('community-mantra').addEventListener('click', function () {
    var sel = getSelectionText();
    if (sel) {
      copyText(sel, function () {
        toast('已复制选中内容，粘贴到下方评论框即可分享你的口诀');
      });
    } else {
      toast('在页面里选中你的口诀文字，再点一次可自动复制');
    }
    ensureGiscus();
    giscusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
