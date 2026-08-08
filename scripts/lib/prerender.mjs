/**
 * 客户端渲染页面的构建期预渲染内核（被 scripts/prerender-*.mjs 复用）。
 *
 * 背景：这类页面的正文写在 <script type="text/markdown" id="md-source"> 里，靠浏览器端
 * marked.js 渲染。Googlebot 之外的绝大多数抓取器（Baidu、GPTBot、ClaudeBot、
 * PerplexityBot…）不执行 JS，抓到的只有一个空壳，正文等于不存在。
 *
 * 做法：构建期把 md-source 渲染成静态 HTML 写回 #content，并打上 data-md-hash 指纹。
 *   - 指纹与 md-source 一致时，页面脚本直接复用这份静态 DOM（首屏更快、不依赖 CDN）；
 *   - 指纹对不上（改了正文没重跑本脚本），页面自动回退到实时渲染，读者不会看到旧内容。
 *
 * 关键约束：预处理逻辑不在本文件里重写，而是直接执行页面内 <script id="md-pipeline">
 * 的源码。页面改了预处理规则，这里跟着变，两边不会漂移。
 *
 * 写回 #content 的只能是 marked.parse 的产物，绝不能是页面脚本增强后的 DOM：
 * 增强逻辑（把 h3/h4 替换成 .question-item 卡片等）不是幂等的，对着已增强的 DOM
 * 再跑一次会找不到裸标题，卡片数直接归零。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js';

/** 与页面 <head> 里加载的 marked 保持同一版本；缓存到本地避免每次联网。 */
async function loadMarkedSource(cachePath) {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf8');
  const res = await fetch(MARKED_URL);
  if (!res.ok) throw new Error(`下载 marked 失败：HTTP ${res.status} ${MARKED_URL}`);
  const src = await res.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, src);
  return src;
}

/** 取出 <script id="..."> 与 </script> 之间的原始文本（与浏览器 textContent 一致）。 */
function extractScript(html, openTagPattern, label) {
  const open = html.match(openTagPattern);
  if (!open) throw new Error(`页面里找不到 ${label}`);
  const start = open.index + open[0].length;
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error(`${label} 缺少闭合 </script>`);
  return { text: html.slice(start, end), start, end };
}

/**
 * 「最后修改日期」：内容新鲜度是 AI 检索排序的重要信号，不能手工维护。
 * 工作区里这个文件有未提交改动 → 用今天；否则用它最后一次提交的日期
 * （CI 里检出是干净的，取到的就是触发本次运行的那次提交）。
 */
function modifiedDate(root, rel) {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', rel],
      { cwd: root, encoding: 'utf8' }).trim();
    if (!dirty) {
      const d = execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', rel],
        { cwd: root, encoding: 'utf8' }).trim();
      if (d) return d;
    }
  } catch { /* 非 git 环境时用今天 */ }
  return new Date().toISOString().slice(0, 10);
}

/**
 * 预渲染一个页面。
 *
 * @param {object} cfg
 * @param {string} cfg.root          仓库根绝对路径
 * @param {string} cfg.html          待处理页面（相对 root）
 * @param {string} cfg.mdOut         伴生 Markdown 输出路径（相对 root），llms.txt 指向它
 * @param {string} cfg.pipelineName  页面 md-pipeline 导出的全局名，如 MFIPE_PIPELINE
 * @param {boolean} cfg.checkOnly    只检查是否过期，不写文件（CI 用）
 * @returns {Promise<number>} 进程退出码
 */
export async function prerenderPage(cfg) {
  const { root, html: htmlRel, mdOut: mdOutRel, pipelineName, checkOnly } = cfg;
  const HTML = path.join(root, htmlRel);
  const MD_OUT = path.join(root, mdOutRel);
  const MARKED_CACHE = path.join(root, 'scripts/.cache/marked-12.min.js');

  const html = fs.readFileSync(HTML, 'utf8');

  // 1) 正文源码：浏览器会把 DOM 里的 CRLF 归一成 LF，这里同步处理，保证指纹两边一致
  const mdRaw = extractScript(html, /<script type="text\/markdown" id="md-source">/, 'md-source').text
    .replace(/\r\n/g, '\n');

  // 2) 页面自带的渲染管线：直接执行页面源码，而不是在这里复制一份正则
  const pipelineSrc = extractScript(html, /<script id="md-pipeline">/, 'md-pipeline 管线块').text;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(await loadMarkedSource(MARKED_CACHE), sandbox, { filename: 'marked.min.js' });
  vm.runInContext(pipelineSrc, sandbox, { filename: 'md-pipeline' });

  // 管线全局名按页面配置断言：名字写错要在这里响亮地失败，
  // 而不是悄悄用另一个页面的预处理规则渲染出一份错的静态正文。
  const PIPE = sandbox[pipelineName];
  const marked = sandbox.marked;
  if (!PIPE) throw new Error(`md-pipeline 未导出 ${pipelineName}`);
  for (const fn of ['preprocess', 'restoreSvg', 'hash']) {
    if (typeof PIPE[fn] !== 'function') throw new Error(`${pipelineName}.${fn} 不是函数`);
  }
  if (!marked || typeof marked.parse !== 'function') throw new Error('marked 加载失败');

  // 3) 渲染：与浏览器完全相同的三步——预处理 → marked.parse → 还原 SVG
  marked.setOptions({ gfm: true, breaks: false });
  const pre = PIPE.preprocess(mdRaw);
  const rendered = PIPE.restoreSvg(marked.parse(pre.md), pre.svgStore);
  const stamp = PIPE.hash(mdRaw);

  // 4) 写回 #content：已预渲染过就整块替换，首次运行则替换加载占位符
  const PRERENDERED = /<div id="content"[^>]*>[\s\S]*?<!--prerender:end--><\/div>/;
  const PLACEHOLDER = /<div id="content"[^>]*>[^\n]*<\/div>/;
  const target = PRERENDERED.test(html) ? PRERENDERED : PLACEHOLDER;
  if (!target.test(html)) throw new Error('定位不到 #content 容器，页面结构可能已改动');

  const current = html.match(target)[0];
  const fresh = current.includes(`data-md-hash="${stamp}"`);

  if (checkOnly) {
    if (fresh) {
      console.log(`✓ ${path.basename(htmlRel)} 预渲染副本是最新的（指纹 ${stamp}）`);
      return 0;
    }
    console.error(`✗ ${path.basename(htmlRel)} 预渲染副本已过期：md-source 变了但没重跑预渲染。`);
    console.error(`  修复：node ${cfg.fixCommand}`);
    return 1;
  }

  const block =
    `<div id="content" data-md-hash="${stamp}"><!--prerender:start-->\n` +
    rendered.trim() +
    `\n<!--prerender:end--></div>`;

  const modified = modifiedDate(root, htmlRel);
  const out = html
    .replace(target, () => block)
    .replace(/"dateModified": "\d{4}-\d{2}-\d{2}"/, `"dateModified": "${modified}"`)
    .replace(/(<meta property="article:modified_time" content=")\d{4}-\d{2}-\d{2}"/, `$1${modified}"`);

  fs.writeFileSync(HTML, out);

  // 5) 伴生 Markdown：给 LLM 抓取器一份零噪声的纯文本正文（llms.txt 指向它）
  fs.writeFileSync(MD_OUT, mdRaw.trim() + '\n');

  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`✓ 预渲染完成  ${path.basename(htmlRel)}  指纹 ${stamp}  dateModified ${modified}`);
  console.log(`  正文 ${kb(rendered.length)} 已写入 #content（原页面 ${kb(html.length)} → ${kb(fs.statSync(HTML).size)}）`);
  console.log(`  伴生 Markdown：${mdOutRel}（${kb(mdRaw.length)}）`);
  return 0;
}
