#!/usr/bin/env node
/**
 * 向内容页注入「读者共建」组件（评论区 + 纠错/口诀入口）。
 *
 * - 幂等：已包含 community-root 的页面自动跳过，可反复运行。
 * - 游戏页（深色背景）自动加 data-theme="transparent_dark"。
 * - 插入点：优先放在不蒜子统计代码之前，否则放在 </body> 之前。
 *
 * 用法：node scripts/inject-community.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DARK_THEME = 'transparent_dark';

const rootPages = [
  '名词解释.html',
  '高频词分析.html',
  'mindmap.html',
  'podcast.html',
  'quiz-analysis.html',
  'quiz.html',
  'review_ppt.html',
];

const gamePages = readdirSync(join(ROOT, 'games'))
  .filter((d) => existsSync(join(ROOT, 'games', d, 'index.html')))
  .map((d) => `games/${d}/index.html`);

const grPages = readdirSync(join(ROOT, '国关复习'))
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => `国关复习/${f}`);

function snippet(theme) {
  const attr = theme ? ` data-theme="${theme}"` : '';
  return `<!-- 读者共建组件：评论区 + 纠错入口（由 scripts/inject-community.mjs 注入/维护） -->
<div id="community-root"${attr}></div>
<script src="/community.js" defer></script>
`;
}

function inject(relPath, theme) {
  const abs = join(ROOT, relPath);
  const html = readFileSync(abs, 'utf8');
  if (html.includes('community-root')) return 'skip';
  const snippetText = snippet(theme);
  const busuanzi = html.indexOf('<!-- 不蒜子');
  if (busuanzi !== -1) {
    writeFileSync(abs, html.slice(0, busuanzi) + snippetText + html.slice(busuanzi));
    return 'ok';
  }
  const end = html.lastIndexOf('</body>');
  if (end === -1) return 'fail';
  writeFileSync(abs, html.slice(0, end) + snippetText + html.slice(end));
  return 'ok';
}

let ok = 0, skip = 0; const failed = [];
const jobs = [
  ...rootPages.map((p) => [p, '']),
  ...gamePages.map((p) => [p, DARK_THEME]),
  ...grPages.map((p) => [p, '']),
];
for (const [path, theme] of jobs) {
  const r = inject(path, theme);
  if (r === 'ok') ok++;
  else if (r === 'skip') skip++;
  else failed.push(path);
}
console.log(`注入完成：新增 ${ok} 页，跳过 ${skip} 页（已注入），失败 ${failed.length} 页`);
if (failed.length) { console.log('失败列表：'); failed.forEach((f) => console.log('  ' + f)); process.exit(1); }
