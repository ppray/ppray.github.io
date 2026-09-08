/**
 * community.js — 读者共建组件（评论区 / 纠错 / 记忆口诀）
 *
 * 由 scripts/inject-community.mjs 注入到各内容页：
 *   <div id="community-root" data-theme="transparent_dark(可选)"></div>
 *   <script src="/community.js" defer></script>
 *
 * 交互形态：
 *   - 右下角悬浮「💬 讨论」按钮 → 侧边抽屉滑出 giscus 评论区，随时可用；
 *     若页面中有选中的文字，会先自动复制，方便粘贴进评论框引用。
 *   - 页面底部的「读者共建」栏保留为入口（纠错直开 Issue，口诀/评论区打开抽屉）。
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
    '#community-root{max-width:920px;margin:28px auto 40px;padding:0 14px;',
    'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}',
    '.community-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;',
    'padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#334155;}',
    '.community-bar .community-title{font-weight:600;margin-right:auto;white-space:nowrap;}',
    '.c-btn{cursor:pointer;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;',
    'padding:4px 10px;font-size:13px;line-height:1.5;text-decoration:none;white-space:nowrap;}',
    '.c-btn:hover{border-color:#94a3b8;background:#f1f5f9;}',
    '.c-link{font-size:13px;color:#64748b;text-decoration:none;white-space:nowrap;}',
    '.c-link:hover{color:#334155;text-decoration:underline;}',
    // 悬浮按钮
    '.community-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;cursor:pointer;',
    'display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;',
    'border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-size:14px;font-weight:600;',
    'box-shadow:0 4px 16px rgba(15,23,42,.16);transition:transform .2s,box-shadow .2s;',
    'font-family:inherit;}',
    '.community-fab:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(15,23,42,.22);}',
    // 侧边抽屉
    '.community-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.4);',
    'opacity:0;pointer-events:none;transition:opacity .25s;}',
    '.community-backdrop--open{opacity:1;pointer-events:auto;}',
    '.community-drawer{position:fixed;top:0;right:0;bottom:0;z-index:2147483002;width:min(430px,94vw);',
    'display:flex;flex-direction:column;background:#ffffff;border-left:1px solid #e2e8f0;',
    'box-shadow:-8px 0 32px rgba(15,23,42,.18);transform:translateX(105%);transition:transform .28s ease;',
    'font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.community-drawer--open{transform:translateX(0);}',
    '.community-drawer-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e2e8f0;}',
    '.community-drawer-title{font-weight:600;font-size:15px;color:#0f172a;white-space:nowrap;}',
    '.community-drawer-sub{font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}',
    '.community-drawer-close{margin-left:auto;flex:none;cursor:pointer;border:1px solid #cbd5e1;border-radius:8px;',
    'background:#fff;color:#334155;width:30px;height:30px;font-size:15px;line-height:1;}',
    '.community-drawer-close:hover{background:#f1f5f9;}',
    '.community-drawer-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 16px 20px;}',
    '.community-note{margin:10px 2px 0;font-size:12px;color:#94a3b8;}',
    // 深色主题（游戏页等）
    '.community-bar.community-dark{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#d6d3d1;}',
    '.community-dark .c-btn{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#e7e5e4;}',
    '.community-dark .c-btn:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.35);}',
    '.community-dark .c-link{color:#a8a29e;}',
    '.community-dark .c-link:hover{color:#e7e5e4;}',
    '.community-fab.community-dark{background:rgba(28,25,23,.94);border-color:rgba(255,255,255,.24);color:#e7e5e4;',
    'box-shadow:0 4px 16px rgba(0,0,0,.5);}',
    '.community-drawer.community-dark{background:#1c1917;border-left-color:rgba(255,255,255,.14);box-shadow:-8px 0 32px rgba(0,0,0,.6);}',
    '.community-drawer.community-dark .community-drawer-title{color:#e7e5e4;}',
    '.community-drawer.community-dark .community-drawer-sub{color:#a8a29e;}',
    '.community-drawer.community-dark .community-drawer-close{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:#e7e5e4;}',
    '.community-drawer.community-dark .community-drawer-close:hover{background:rgba(255,255,255,.16);}',
    '.community-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);',
    'background:#0f172a;color:#f1f5f9;padding:8px 16px;border-radius:8px;font-size:13px;',
    'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:2147483647;',
    'font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}',
    '.community-toast--show{opacity:1;transform:translateX(-50%) translateY(0);}',
    '.community-toast--dark{background:#f5f5f4;color:#1c1917;}',
    '@media print{#community-root,.community-fab,.community-drawer,.community-backdrop{display:none!important}}',
    '@media (prefers-reduced-motion: reduce){.community-drawer,.community-backdrop,.community-fab{transition:none}}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- 底部共建栏（入口之一） ----------
  var section = document.createElement('section');
  section.className = 'community-bar' + (isDark ? ' community-dark' : '');
  section.innerHTML =
    '<span class="community-title">📖 读者共建</span>' +
    '<button type="button" class="c-btn" id="community-report">✏️ 发现错误</button>' +
    '<button type="button" class="c-btn" id="community-mantra">💡 补充记忆口诀</button>' +
    '<button type="button" class="c-btn" id="community-open">💬 打开评论区</button>' +
    '<a class="c-link" href="' + DISCUSSIONS_URL + '" target="_blank" rel="noopener">全部讨论 ↗</a>';
  root.appendChild(section);

  // ---------- 悬浮按钮 + 侧边抽屉 ----------
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'community-fab' + (isDark ? ' community-dark' : '');
  fab.setAttribute('aria-label', '打开评论区');
  fab.innerHTML = '💬 讨论';

  var backdrop = document.createElement('div');
  backdrop.className = 'community-backdrop';

  var drawer = document.createElement('div');
  drawer.className = 'community-drawer' + (isDark ? ' community-dark' : '');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-label', '读者讨论');
  drawer.innerHTML =
    '<div class="community-drawer-head">' +
    '<span class="community-drawer-title">💬 读者讨论</span>' +
    '<span class="community-drawer-sub"></span>' +
    '<button type="button" class="community-drawer-close" aria-label="关闭">✕</button>' +
    '</div>' +
    '<div class="community-drawer-body"></div>';
  drawer.querySelector('.community-drawer-sub').textContent = pageTitle();
  var drawerBody = drawer.querySelector('.community-drawer-body');

  var giscusBox = document.createElement('div');
  giscusBox.className = 'community-giscus';
  drawerBody.appendChild(giscusBox);

  var note = document.createElement('p');
  note.className = 'community-note';
  note.textContent = '评论与口诀存储于 GitHub Discussions；纠错会创建带页面信息的 Issue。';
  drawerBody.appendChild(note);

  document.body.appendChild(fab);
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  // ---------- giscus（首次打开抽屉时加载） ----------
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
    s.crossOrigin = 'anonymous';
    s.async = true;
    giscusBox.appendChild(s);
  }

  var lastFocus = null;
  function openDrawer() {
    var sel = getSelectionText();
    if (sel) {
      copyText(sel, function () {
        toast('已复制选中内容，粘贴到评论框即可引用/分享');
      });
    }
    if (lastFocus === null) lastFocus = document.activeElement;
    backdrop.className = 'community-backdrop community-backdrop--open';
    drawer.className = 'community-drawer community-drawer--open' + (isDark ? ' community-dark' : '');
    ensureGiscus();
    var closeBtn = drawer.querySelector('.community-drawer-close');
    if (closeBtn) closeBtn.focus();
  }
  function closeDrawer() {
    backdrop.className = 'community-backdrop';
    drawer.className = 'community-drawer' + (isDark ? ' community-dark' : '');
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); lastFocus = null; }
  }

  // ---------- 事件 ----------
  document.getElementById('community-report').addEventListener('click', function () {
    window.open(issueUrl(), '_blank', 'noopener');
  });
  document.getElementById('community-mantra').addEventListener('click', openDrawer);
  document.getElementById('community-open').addEventListener('click', openDrawer);
  fab.addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);
  drawer.querySelector('.community-drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.className.indexOf('community-drawer--open') !== -1) closeDrawer();
  });
})();
