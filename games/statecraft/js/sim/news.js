// 《华胥日报》与外电。舆论管理越严，本国报纸越「平稳向好」；外电永远照实说。
// 这就是舆论机制的可见部分：你在报纸上看到的，取决于你允许报纸看到什么。
import { reported } from './model.js';
import { GROUPS, PHASES } from './defs.js';

const pct = v => `${v >= 0 ? '' : ''}${v.toFixed(1)}%`;

export function newspaper(S, report) {
  if (!report) return null;
  const { before: b, after: a, ledger } = report;
  const press = S.pol.press;
  const rep = reported(S);
  const dR = a.reserves - b.reserves, dE = (a.e / b.e - 1) * 100;
  const en = S.name === '华胥' ? 'Huaxu' : S.name;
  const facts = [];
  // 按严重程度排列的事实
  if (ledger.notes.some(n => n.kind === 'collapse')) facts.push({ w: 10, bad: true, t: `华元失守，单季贬值逾 ${Math.round(dE)}%`, f: `${en}'s currency collapses after reserves run dry` });
  if (ledger.notes.some(n => n.kind === 'burst')) facts.push({ w: 9, bad: true, t: '楼市股市急跌，多家房企债券违约', f: `Asset bubble bursts in ${en}` });
  if (a.fed > b.fed + 0.01) facts.push({ w: 7, bad: true, t: `美联储加息 ${Math.round((a.fed - b.fed) * 100)} 个基点，新兴市场承压`, f: `Fed hikes by ${Math.round((a.fed - b.fed) * 100)}bp; emerging markets wobble` });
  if (dR < -25) facts.push({ w: 8, bad: true, t: `外储单季减少 ${Math.round(-dR * 10)} 亿美元`, f: `${en}'s FX reserves fall by $${Math.round(-dR)}bn` });
  else if (dR > 25) facts.push({ w: 4, bad: false, t: `外储单季增加 ${Math.round(dR * 10)} 亿美元，再创新高`, f: `${en}'s reserves swell as hot money pours in` });
  if (dE > 2.5) facts.push({ w: 7, bad: true, t: `华元对美元贬值 ${dE.toFixed(1)}%，跌破 ${a.e.toFixed(2)}`, f: `Currency slides ${dE.toFixed(1)}% against the dollar` });
  else if (dE < -2) facts.push({ w: 5, bad: false, t: `华元升值 ${(-dE).toFixed(1)}%，出口企业叫苦`, f: `Currency strengthens; exporters complain` });
  if (a.pi > 5) facts.push({ w: 6, bad: true, t: `物价同比上涨 ${pct(a.pi)}，菜篮子吃紧`, f: `Inflation hits ${pct(a.pi)}` });
  if (a.u > 6) facts.push({ w: 6, bad: true, t: `城镇失业率升至 ${pct(a.u)}`, f: `Unemployment climbs to ${pct(a.u)}` });
  if (a.g < b.g - 1) facts.push({ w: 5, bad: true, t: `经济增速放缓至 ${pct(a.g)}`, f: `Growth slows to ${pct(a.g)}` });
  else if (a.g > 7) facts.push({ w: 3, bad: false, t: `经济增长 ${pct(a.g)}，领跑新兴市场`, f: `${en} grows ${pct(a.g)}` });
  if (a.bubble > 120 && !ledger.notes.some(n => n.kind === 'burst')) facts.push({ w: 3, bad: false, t: '楼市成交火爆，地王频出', f: 'Property frenzy continues' });
  for (const g of GROUPS) {
    const d = a.groups[g.id] - b.groups[g.id];
    if (d < -6) facts.push({ w: 4, bad: true, t: `${g.name}不满情绪升温`, f: null });
  }
  facts.sort((x, y) => y.w - x.w);

  const eventLines = report.news.map(n => n.text).filter(Boolean);
  let domestic;
  if (press === 'open') domestic = [...eventLines, ...facts.map(f => f.t)];
  else if (press === 'guided') domestic = [...eventLines, ...facts.filter(f => !f.bad || f.w >= 8).map(f => f.t)];
  else domestic = [...eventLines.filter(t => !/失守|违约|急跌|不满|罢工|挤兑/.test(t)), ...facts.filter(f => !f.bad).map(f => f.t)];
  const filler = {
    open: [`${PHASES[a.phase].label}期：${PHASES[a.phase].blurb}`],
    guided: ['经济运行保持在合理区间', `${PHASES[a.phase].label}期外部环境复杂，我国经济韧性强`],
    controlled: [`前三季度经济增长 ${pct(rep.g)}，稳中向好`, '各地群众安居乐业', '金融市场运行平稳有序', '外部势力唱衰论调不攻自破'],
  }[press];
  domestic = [...new Set([...domestic, ...filler])].slice(0, 5);
  const foreign = facts.filter(f => f.f).slice(0, 3).map(f => f.f);
  return {
    masthead: `${S.name}日报`, q: report.q, lead: domestic[0] || filler[0], rest: domestic.slice(1),
    foreign, censored: press === 'controlled' ? facts.filter(f => f.bad).length : 0, press,
  };
}
