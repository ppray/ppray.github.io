// 《庙算》入口：挂载应用。所有依赖都在仓库内（vendor/htm-preact.js），国内读者无需访问 CDN。
import { html, render } from '../vendor/htm-preact.js';
import { App } from './app.js';

const root = document.getElementById('app');
try {
  render(html`<${App} />`, root);
} catch (e) {
  root.innerHTML = `<p style="padding:40px;color:#e0563d">加载失败：${e.message}</p>`;
  throw e;
}
