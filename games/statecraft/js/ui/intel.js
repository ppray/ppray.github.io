// 「得算」簿记：召对答题的结果写回游戏状态（随存档保存），并换算成算筹。
import { clone } from '../sim/model.js';

export const MINISTER_CONCEPTS = {
  hebingwen: ['reserves', 'fx-regime', 'currency-intl', 'trilemma', 'sterilization', 'gold-standard'],
  zheng: ['dollar-tide', 'crisis', 'debt', 'monetary-tools', 'sanctions', 'bretton-woods'],
  lin: ['center-periphery', 'neoliberal', 'fdi', 'regional', 'cycles', 'dollar-hegemony', 'distribution', 'trade-war'],
  lumin: ['legitimacy', 'participation', 'power', 'political-culture', 'state-capacity', 'ir'],
};

export function ensureIntel(S) {
  S.intel ||= { asked: 0, correct: 0, byConcept: {}, byChapter: {}, wrong: [], tokens: 0, askedIds: [] };
  S.intel.tokens ??= 0; S.intel.askedIds ||= []; S.intel.byChapter ||= {};
  S.evState ||= {};
  S.deskAsk ||= {};
  return S;
}

export function recordIntel(S0, item, correct, { evId, minister, hoursCost = 0 } = {}) {
  const S = ensureIntel(clone(S0));
  const I = S.intel;
  I.asked += 1;
  if (correct) { I.correct += 1; I.tokens += 1; }
  else I.wrong.push(item.id);
  I.askedIds.push(item.id);
  for (const c of item.concepts) {
    const r = I.byConcept[c] ||= { n: 0, ok: 0 };
    r.n += 1; if (correct) r.ok += 1;
  }
  const ch = I.byChapter[item.chapter] ||= { n: 0, ok: 0 };
  ch.n += 1; if (correct) ch.ok += 1;
  if (evId) {
    const es = S.evState[evId] ||= { unlocked: false, tries: 0, hours: 48 };
    es.tries += 1;
    es.hours = Math.max(0, es.hours - hoursCost);
    if (correct) es.unlocked = true;
  }
  if (minister) S.deskAsk[minister] = S.q;
  return S;
}

export function spendToken(S0) {
  const S = ensureIntel(clone(S0));
  if (S.intel.tokens < 1) return null;
  S.intel.tokens -= 1;
  return S;
}
