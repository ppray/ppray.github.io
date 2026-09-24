// 机要文书：一张事件卡。先读简报与历史镜鉴 →「召对」顾问（答一道题库里的题）→ 答对即解锁庙算推演 → 拍板。
import { html, useState, useMemo } from '../../vendor/htm-preact.js';
import { CAST, artSrc } from '../../data/cast.js';
import { chapterById, conceptById, LEVEL_LABEL } from '../../data/concepts.js';
import { fmtText, forecastOptions, optionAvailable, FORECAST_KEYS } from '../sim/game.js';
import { pickQuestion } from '../quiz/bank.js';
import { QuizCard } from './quiz.js';

const HOURS = 48, HOUR_COST = 12;

export function EventDossier({ S, ev, sc, bank, onChoose, onIntel, onPeek, index, total }) {
  const who = CAST[ev.advisor];
  const es = (S.evState || {})[ev.id] || { unlocked: false, tries: 0, hours: HOURS };
  const crisis = ev.kind === 'crisis';
  const exam = S.mode === 'exam';
  const maxTries = crisis ? Infinity : exam ? 1 : 3;
  const hoursLeft = crisis ? es.hours : null;
  const canAsk = !es.unlocked && bank && es.tries < maxTries && (!crisis || hoursLeft >= HOUR_COST);
  const [q, setQ] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState(null);
  const fc = useMemo(() => (es.unlocked ? forecastOptions(S, ev, sc) : null), [es.unlocked, S.q, ev.id]);
  const ch = chapterById[ev.mirror.chapter];

  const ask = () => {
    const asked = new Set((S.intel && S.intel.askedIds) || []);
    setQ(pickQuestion(bank, ev.concepts, asked));
    setAnswered(false);
  };
  const done = (correct, item) => {
    setAnswered(true);
    onIntel(item, correct, { evId: ev.id, hoursCost: crisis ? HOUR_COST : 0 });
  };
  const choose = i => {
    setChosen(i);
    setTimeout(() => onChoose(i), 650);
  };

  // 推演读数：每个指标在各选项之间比较，标出最好/最差
  const marks = useMemo(() => {
    if (!fc) return null;
    const m = {};
    for (const k of FORECAST_KEYS) {
      if (!k.good) continue;
      const vals = fc.map(f => (f ? f[k.key] : null)).filter(v => v != null);
      if (vals.length < 2) continue;
      m[k.key] = { best: k.good > 0 ? Math.max(...vals) : Math.min(...vals), worst: k.good > 0 ? Math.min(...vals) : Math.max(...vals) };
    }
    return m;
  }, [fc]);

  return html`<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="ev-title">
    <article class=${'paper dossier-doc' + (crisis ? ' crisis' : '')}>
      <div class="doc-head">
        <span>机要 · 第 ${S.q} 季度 · ${index + 1}/${total}</span>
        <span style="display:flex;gap:10px;align-items:center">
          ${onPeek ? html`<button class="btn small" style="padding:.2em .7em;font-size:11.5px" onClick=${onPeek}>先看看局势</button>` : null}
          ${crisis ? html`<span class="classified">危机 · 特急</span>` : html`<span class="classified">绝密</span>`}
        </span>
      </div>
      <h2 class="doc-title" id="ev-title">${ev.title}</h2>
      ${crisis ? html`<div class="clock" aria-label=${`距市场开盘还有 ${hoursLeft} 小时`}>
        距市场开盘 <span class="bar"><b style=${{ width: `${(hoursLeft / HOURS) * 100}%` }}></b></span> ${hoursLeft} 小时
        <span style="font-weight:400;font-size:12px;color:var(--paper-muted)">· 每次召对耗时 ${HOUR_COST} 小时</span>
      </div>` : null}
      <div class="ev-grid">
        <div>
          <div class="ev-portrait"><img src=${artSrc(ev.advisor, es.unlocked ? 'ok' : es.tries > 0 ? 'no' : 'idle')} alt=${who.name} loading="lazy" /></div>
          <div class="ev-who"><b>${who.name}</b><br />${who.role}</div>
        </div>
        <div>
          <p class="ev-text">${fmtText(S, ev.text, sc)}</p>
          <div class="mirror">
            <h4>${ev.mirror.place} · ${ev.mirror.title}<small>${ev.mirror.year}</small></h4>
            <p>${ev.mirror.text}</p>
            <div class="exam">考点：${ch ? `${ch.label}（${LEVEL_LABEL[ch.level]}${ch.freq ? ' · 考过 ' + ch.freq : ''}）` : ''}
              ${ch && ch.game ? html` · <a href=${`../${ch.game}/`} target="_blank" rel="noopener">去《${ch.gameTitle}》复习</a>` : ch && ch.card ? html` · <a href=${`../../国关复习/${ch.card}`} target="_blank" rel="noopener">看速查卡</a>` : ch && ch.page ? html` · <a href=${ch.page} target="_blank" rel="noopener">去刷政治学题</a>` : null}
            </div>
          </div>
        </div>
      </div>

      <section class="consult" aria-label="召对">
        <div class="consult-head">
          <div class="who">召对 · <b>${who.name}</b> <span style="color:var(--paper-muted)">— ${es.unlocked ? '推演已展开：每个选项两季后的局面已标在上方。' : '答对一题，即可看到每个选项两个季度后的推演。'}</span></div>
          ${!es.unlocked ? html`<button class="btn brass small" style="color:var(--cinnabar);border-color:var(--cinnabar)" disabled=${!canAsk || (q && !answered)} onClick=${ask}>
            ${!bank ? '题库加载中…' : es.tries === 0 ? '召对' : es.tries >= maxTries ? '已无追问机会' : crisis && hoursLeft < HOUR_COST ? '来不及了' : '再问一题'}
          </button>` : html`<span class="seal small stamp">算</span>`}
        </div>
        ${q ? html`<${QuizCard} key=${q.id} item=${q} onDone=${done} />` : null}
        ${!q && !es.unlocked ? html`<p style="font-size:12.5px;margin:8px 0 0;color:var(--paper-muted)">
          题目从题库中按本事件的考点抽取：${ev.concepts.map(c => (conceptById[c] ? conceptById[c].label : c)).join(' · ')}。
          ${crisis ? '危机期间每问一题耗时 12 小时。' : exam ? '考场模式：每张卡只有一次召对机会。' : '每张卡最多追问 3 次。'}不召对也可以直接拍板。</p>` : null}
      </section>

      <div class="opts-list" role="group" aria-label="选项">
        ${ev.options.map((o, i) => {
          const ok = optionAvailable(S, o);
          const f = fc && fc[i];
          return html`<button class="opt" disabled=${!ok || chosen != null} onClick=${() => choose(i)} style=${chosen === i ? { borderColor: 'var(--cinnabar)', background: 'rgba(194,58,36,.06)' } : null}>
            <span class="mark">${chosen === i ? html`<span class="seal small stamp" style="width:26px;height:26px;font-size:12px;border-width:2px">准</span>` : '甲乙丙丁戊己'[i]}</span>
            <span>
              <div class="ol">${o.label}</div>
              <div class="od">${o.desc}${!ok ? '（当前条件下不可选）' : ''}</div>
              ${es.unlocked && ok ? html`
                <div class="reveal">${o.reveal}</div>
                ${f ? html`<div class="fc" aria-label="两季度后的推演">
                  ${FORECAST_KEYS.map(k => {
                    const v = f[k.key];
                    const m = marks && marks[k.key];
                    const cls = m && m.best !== m.worst ? (Math.abs(v - m.best) < 1e-9 ? 'best' : Math.abs(v - m.worst) < 1e-9 ? 'worst' : '') : '';
                    const shown = k.scale ? Math.round(v * k.scale) : v.toFixed(k.digits);
                    return html`<span class=${cls}>${k.label} ${shown}${k.unit}</span>`;
                  })}
                  ${f.forcedFloat ? html`<span class="alarm">外储失守</span>` : null}
                  ${f.burst ? html`<span class="alarm">泡沫破裂</span>` : null}
                  ${f.over && f.over !== 'term' ? html`<span class="alarm">政权危机</span>` : null}
                </div>` : null}` : ok ? html`<div class="fog">后果：未经庙算，不可知</div>` : null}
            </span>
          </button>`;
        })}
      </div>

    </article>
  </div>`;
}
