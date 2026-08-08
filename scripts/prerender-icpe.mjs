#!/usr/bin/env node
/**
 * 预渲染《国际与比较政治经济学研究》模拟卷答案，供搜索引擎与 AI 抓取器读取。
 * 通用逻辑在 scripts/lib/prerender.mjs，本文件只提供这一页的配置。
 *
 * 用法：
 *   node scripts/prerender-icpe.mjs           # 渲染并写回 HTML + 同步伴生 .md
 *   node scripts/prerender-icpe.mjs --check   # 只检查是否过期（CI 用），不写文件
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerenderPage } from './lib/prerender.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.exit(await prerenderPage({
  root: ROOT,
  html: '国关复习/《国际与比较政治经济学研究》模拟卷答案.html',
  mdOut: '国关复习/《国际与比较政治经济学研究》模拟卷答案.md',
  pipelineName: 'ICPE_PIPELINE',
  checkOnly: process.argv.includes('--check'),
  fixCommand: 'scripts/prerender-icpe.mjs',
}));
