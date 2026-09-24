// 史评：结局 · 历史对照 · 任期走势 · 决策年表 · 得算与复习建议
import { html, useState, useEffect } from '../../vendor/htm-preact.js';
import { ending, SUAN_TEXT } from '../sim/endings.js';
import { CHAPTERS, chapterById, LEVEL_LABEL } from '../../data/concepts.js';
import { LineChart } from './charts.js';

export function Ending({ S, bank, onRestart, onArchive, onTitle }) {
  const E = ending(S);
  const rows = S.hist.rows;
  const distorted = rows.some(r => r.press && r.press !== 'open');
  const I = S.intel || { asked: 0, correct: 0, byChapter: {}, wrong: [] };
  const wrongItems = bank ? [...new Set(I.wrong)].map(id => bank.find(it => it.id === id)).filter(Boolean) : [];
  const chRows = CHAPTERS.filter(c => I.byChapter && I.byChapter[c.id]);
  const decisions = S.log.filter(l => l.id);
  return html`<div class="overlay">
    <article class="paper ending">
      <div class="doc-head"><span>史评 · ${S.name} · 第 ${E.quarters} 季度${S.over === 'term' ? '（任满）' : '（中止）'}</span><span>种子 ${S.seed}</span></div>
      <div class="ending-head">
        <div>
          <h1>${E.title}</h1>
          <p class="lede">${E.text}</p>
        </div>
        <div style="text-align:center"><span class="seal stamp" style="width:96px;height:96px;font-size:48px">${E.seal}</span>
          <div style="margin-top:10px;font-size:12px;color:var(--paper-muted)">合法性 <b class="num">${S.legit.toFixed(0)}</b></div></div>
      </div>
      <div class="mirror" style="margin-top:18px"><h4>历史上的同一幕 · ${E.mirror.place}<small>${E.mirror.year}</small></h4><p>${E.mirror.text}</p></div>

      <hr />
      <h3 class="serif" style="margin:0 0 6px;letter-spacing:.1em">庙算 · ${E.suan}</h3>
      <p style="margin:0;font-size:14px">召对 <b class="num">${I.asked}</b> 次，答对 <b class="num">${I.correct}</b> 次${I.asked ? `（${Math.round(E.rate * 100)}%）` : ''}。${SUAN_TEXT[E.suan]}</p>

      <hr />
      <h3 class="serif" style="margin:0;letter-spacing:.1em">任期走势</h3>
      <p class="muted" style="font-size:12.5px;margin:4px 0 0">绿色底纹为美元潮汐的收水、收割期。${distorted ? '红色虚线是报纸上的「公布值」，实线是真实值——两者之差，就是舆论管控下的统计失真。' : ''}</p>
      <div class="charts">
        <${LineChart} title="经济增长" unit="%" rows=${rows} get=${r => r.g} getRep=${distorted ? r => r.rep.g : null} />
        <${LineChart} title="通胀" unit="%" rows=${rows} get=${r => r.pi} getRep=${distorted ? r => r.rep.pi : null} />
        <${LineChart} title="外汇储备（亿$）" rows=${rows} get=${r => r.reserves * 10} fmt=${v => Math.round(v).toLocaleString('zh-CN')} />
        <${LineChart} title="汇率（华元/美元）" rows=${rows} get=${r => r.e} fmt=${v => v.toFixed(2)} />
        <${LineChart} title="资本净流动（亿$/季）" rows=${rows.slice(1)} get=${r => r.kf * 10} fmt=${v => Math.round(v).toString()} zero=${0} />
        <${LineChart} title="合法性" rows=${rows} get=${r => r.legit} fmt=${v => v.toFixed(0)} />
      </div>

      <hr />
      <h3 class="serif" style="margin:0 0 6px;letter-spacing:.1em">决策年表</h3>
      <ul class="timeline">${decisions.map(d => html`<li>
        <span class="q">第 ${d.q} 季</span>
        <div><b>${d.title}</b> · ${d.label}<p>${d.review}${d.mirror ? html` <span class="muted">（对照：${d.mirror.place} ${d.mirror.year}）</span>` : null}</p></div>
      </li>`)}</ul>

      ${chRows.length ? html`<hr />
        <h3 class="serif" style="margin:0 0 10px;letter-spacing:.1em">本局考点掌握</h3>
        <div class="mastery">${chRows.map(c => {
          const r = I.byChapter[c.id];
          return html`<div class="row"><span>${c.label}<span class="lvl">${LEVEL_LABEL[c.level]}</span></span>
            <span class="bar"><b style=${{ width: `${(r.ok / r.n) * 100}%`, background: r.ok / r.n < 0.6 ? 'var(--cinnabar)' : 'var(--verdigris)' }}></b></span>
            <span class="num">${r.ok}/${r.n}</span></div>`;
        })}</div>` : null}

      ${wrongItems.length ? html`<hr />
        <h3 class="serif" style="margin:0 0 6px;letter-spacing:.1em">错题 · 复习路线</h3>
        <div class="wrong-list">${wrongItems.map(it => {
          const ch = chapterById[it.chapter];
          return html`<details><summary>${it.q} <span class="muted" style="font-size:12px">· ${ch ? ch.label : ''}</span></summary>
            <div class="ans">${it.w || ''}${it.s ? html`<div><b>考点：</b>${it.s}</div>` : null}
              <div>复习：<a href=${it.link} target="_blank" rel="noopener">${it.from}</a></div></div>
          </details>`;
        })}</div>` : null}

      <div class="quiz-actions" style="justify-content:flex-end;margin-top:22px">
        <button class="btn" onClick=${onTitle}>回扉页</button>
        <button class="btn" onClick=${onArchive}>去档案馆刷题</button>
        <button class="btn" onClick=${() => onRestart(S.seed)}>同一局面再来</button>
        <button class="btn primary" onClick=${() => onRestart(null)}>再任一届</button>
      </div>
    </article>
  </div>`;
}
