#!/usr/bin/env node
/**
 * 生成 sitemap.xml。
 *
 * 收录规则：只收「能独立当作落地页」的内容页，不把 118 个 HTML 全倒进去——
 * 人工智能训练师三级里的素材页/模拟界面是练习用的碎片，进 sitemap 只会稀释抓取预算。
 *   收录：根目录页面 + 国关复习/ 全部 + 各子目录 index + 指定看板页
 *   排除：素材碎片、嵌入用 widget、模拟考试界面
 *
 * lastmod 取 git 最后一次提交该文件的日期，没有 git 记录则用文件 mtime。
 *
 * 用法：node scripts/gen-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://ppray.github.io';

/** 目录下（含子目录）所有 html，相对仓库根的 posix 路径 */
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.claude', '.codex', '.loopx', '.github', 'scripts'].includes(entry.name)) continue;
      walk(rel, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(rel);
    }
  }
  return acc;
}

const EXCLUDE = [
  /^人工智能训练师三级\/人工智能训练师三级上网素材\//,
  /^人工智能训练师三级\/人工智能训练师三级考试平台模拟界面\//,
  /^人工智能训练师三级\/2025-AI-Trainer-practices\//,
  /^us-debt\/widget\.html$/,          // 供 iframe 嵌入，不是落地页
  /^国关复习题\//,
];

// 首页 > 栏目索引 > 复习正文 > 其他工具页
function priorityOf(rel) {
  if (rel === 'index.html') return '1.0';
  if (rel.endsWith('/index.html')) return '0.8';
  if (rel.startsWith('国关复习/')) return '0.9';
  return '0.6';
}

function lastmod(rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', rel],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    if (out) return out;
  } catch { /* 无 git 记录时回落到 mtime */ }
  return fs.statSync(path.join(ROOT, rel)).mtime.toISOString().slice(0, 10);
}

const pages = walk('')
  .filter((rel) => !EXCLUDE.some((re) => re.test(rel)))
  .sort();

// 复习笔记的 Markdown 伴生文件也收进来：AI 抓取器更愿意直接吃 .md
const extras = ['国关复习/翟东升《货币与金融的国际政治经济学》复习笔记.md']
  .filter((rel) => fs.existsSync(path.join(ROOT, rel)));

const urls = [...pages, ...extras].map((rel) => {
  // index.html 用目录形式收录，避免 /x/ 与 /x/index.html 两个 URL 抢同一份内容
  const canonicalRel = rel.replace(/(^|\/)index\.html$/, '$1');
  const loc = `${SITE}/${canonicalRel.split('/').map(encodeURIComponent).join('/')}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod(rel)}</lastmod>\n` +
    `    <priority>${priorityOf(rel)}</priority>\n  </url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 由 scripts/gen-sitemap.mjs 生成，请勿手工编辑 -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`✓ sitemap.xml 已生成：${urls.length} 条 URL（HTML ${pages.length} + 附件 ${extras.length}）`);
