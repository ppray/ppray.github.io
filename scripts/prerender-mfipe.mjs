#!/usr/bin/env node
/**
 * 预渲染《货币与金融的国际政治经济学》复习笔记，供搜索引擎与 AI 抓取器读取。
 * 通用逻辑在 scripts/lib/prerender.mjs，本文件只提供这一页的配置。
 *
 * 用法：
 *   node scripts/prerender-mfipe.mjs           # 渲染并写回 HTML + 同步伴生 .md
 *   node scripts/prerender-mfipe.mjs --check   # 只检查是否过期（CI 用），不写文件
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerenderPage } from './lib/prerender.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.exit(await prerenderPage({
  root: ROOT,
  html: '国关复习/翟东升《货币与金融的国际政治经济学》复习笔记.html',
  mdOut: '国关复习/翟东升《货币与金融的国际政治经济学》复习笔记.md',
  pipelineName: 'MFIPE_PIPELINE',
  checkOnly: process.argv.includes('--check'),
  fixCommand: 'scripts/prerender-mfipe.mjs',
}));
