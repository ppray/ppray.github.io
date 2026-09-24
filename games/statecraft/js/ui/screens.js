// 扉页 · 就职文书 · 规则
import { html, useState } from '../../vendor/htm-preact.js';
import { Guilloche } from './charts.js';
import { PHASES } from '../sim/defs.js';

export function Title({ hasSave, saveInfo, onNew, onContinue, onArchive, onHelp }) {
  return html`<main class="title-screen">
    <${Guilloche} />
    <div class="title-card">
      <div class="eyebrow">Statecraft · 执政模拟</div>
      <h1 class="title-word">庙算</h1>
      <div class="title-quote">夫未战而庙算胜者，得算多也<small>——《孙子 · 计篇》</small></div>
      <p class="title-sub">你是虚构国家「华胥」的首席执政官，要在一轮完整的美元潮汐里执政十二个季度。
        每一次拍板之前，都可以召对内阁——答对一道真题，就能看见每个选项两季之后的局面。</p>
      <div class="title-actions">
        <button class="btn primary" onClick=${onNew}>就任</button>
        ${hasSave ? html`<button class="btn brass" onClick=${onContinue}>继续执政 · ${saveInfo}</button>` : null}
        <button class="btn" onClick=${onArchive}>档案馆</button>
        <button class="btn ghost" onClick=${onHelp}>规则</button>
      </div>
      <div class="title-foot">题库来自全站：11 部纪年页游 · 翟东升《货币与金融的国际政治经济学》14 章 · 政治学 · IPE 模拟卷<br />
        <a href="../">← 研学游戏馆</a> · <a href="/">回首页</a></div>
    </div>
  </main>`;
}

export function Setup({ onStart, onBack }) {
  const [name, setName] = useState('华胥');
  const [mode, setMode] = useState('calm');
  const [seedMode, setSeedMode] = useState('random');
  const [stamped, setStamped] = useState(false);
  const today = new Date();
  const daily = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const go = () => {
    setStamped(true);
    const seed = seedMode === 'daily' ? Number(daily) : Math.floor(Math.random() * 2 ** 31);
    setTimeout(() => onStart({ name: (name || '华胥').slice(0, 6), mode, seed }), 700);
  };
  return html`<main class="setup">
    <article class="paper">
      <div class="doc-head"><span>就职文书 · 第 001 号</span><span class="classified">机要</span></div>
      <div class="dossier">
        <div>
          <h1 class="doc-title">首席执政官就职</h1>
          <p class="muted" style="margin:4px 0 0;font-size:13.5px">剧本「潮汐」：一轮美元周期里的十二个季度</p>
        </div>
        ${stamped ? html`<span class="seal stamp" style="width:84px;height:84px;font-size:40px">准</span>` : html`<span class="seal" style="opacity:.18">印</span>`}
      </div>
      <hr />
      <div class="field">
        <label for="nm">国号</label>
        <input id="nm" type="text" value=${name} maxlength="6" onInput=${e => setName(e.target.value)} />
        <span class="muted" style="font-size:12px;margin-left:10px">虚构国家；历史镜鉴与考点均取自真实国家</span>
      </div>
      <p style="font-size:14px;line-height:1.9;margin:0">人口一亿二千万的制造业出口国。二十年间靠「外贸 + 外资 + 外汇」三件套完成工业化，外储是国民的骄傲，也是悬在头顶的问号。你就任时，美联储把利率压在 0.25%，全球的钱正在涌向外围——
        <b>潮水总会退去。</b></p>
      <ul class="brief-list" style="margin-top:12px">
        <li>美元潮汐四步：${Object.values(PHASES).map(p => p.label).join(' → ')}。加息会在第 5–7 季度之间到来。</li>
        <li>五大利益集团决定你的合法性：出口商、金融资本、产业工人、储户与中产、地方与国企。</li>
        <li>合法性跌破 36 即下台；任满时 ≥ 59 为最佳结局「潮退而立」。</li>
        <li>召对答对一题，就能看到每个选项两季之后的推演；答对的题还会变成算筹，用来推演你的政令。</li>
      </ul>
      <div class="field">
        <label>难度</label>
        <div class="seg">
          <button aria-pressed=${mode === 'calm'} onClick=${() => setMode('calm')}>从容 · 每卡可追问 3 次</button>
          <button aria-pressed=${mode === 'exam'} onClick=${() => setMode('exam')}>考场 · 每卡只问一次</button>
        </div>
      </div>
      <div class="field">
        <label>局面</label>
        <div class="seg">
          <button aria-pressed=${seedMode === 'random'} onClick=${() => setSeedMode('random')}>随机</button>
          <button aria-pressed=${seedMode === 'daily'} onClick=${() => setSeedMode('daily')}>今日挑战 · ${daily}</button>
        </div>
        <span class="muted" style="font-size:12px;margin-left:10px">今日挑战：所有人同一个局面</span>
      </div>
      <div class="quiz-actions" style="justify-content:space-between;margin-top:22px">
        <button class="btn" onClick=${onBack}>← 返回</button>
        <button class="btn primary" disabled=${stamped} onClick=${go}>用印就任</button>
      </div>
    </article>
  </main>`;
}

export function Help({ onClose }) {
  return html`<div class="overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
    <article class="paper dossier-doc" style="max-width:760px">
      <div class="doc-head"><span>执政须知</span><span>庙算</span></div>
      <h2 class="doc-title">怎么玩</h2>
      <ol style="line-height:1.95;font-size:14.5px;padding-left:1.3em">
        <li><b>每个季度</b>先处理 0–2 份机要文书（事件）。读简报和「历史镜鉴」——那是真实国家遇到同一局面时发生的事。</li>
        <li><b>召对</b>：点「召对」，顾问会从题库里按本事件的考点出一道题。答对，文书上就会展开每个选项<b>两季之后</b>的推演（外储、汇率、增长、通胀、信心、合法性），并揭示隐藏后果。答错可以追问（危机中每问一题耗 12 小时）。</li>
        <li><b>拍板</b>：选一个选项。选项会立刻改变政策与各集团的态度，其中六成会变成「旧账或人情」，在之后的季度里慢慢淡去。</li>
        <li><b>政令台</b>：汇率制度、资本账户、外债管理、财政、舆论要花政治资本；利率、准备金率、冲销力度每季可调。三元悖论是硬约束：钉住汇率 + 开放资本 + 独立利率，三者不可兼得。</li>
        <li><b>内阁</b>：每季可以向每位阁员各请教一题。答对得「算筹」，一根算筹可以推演一次你的政令。</li>
        <li><b>季报</b>：《华胥日报》头版 + 外电 + 因果账本。舆论管得越严，报纸越好看，你自己的仪表盘也越失真——外电永远照实说。</li>
        <li><b>史评</b>：任满或下台后，你会看到结局、历史对照、真实与公布数据的对比、决策年表，以及按章节汇总的错题与复习链接。</li>
      </ol>
      <div class="quiz-actions" style="justify-content:flex-end"><button class="btn primary" onClick=${onClose}>明白了</button></div>
    </article>
  </div>`;
}
