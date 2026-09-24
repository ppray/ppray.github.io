// 内阁与来访者。立绘复用 /art 的版画肖像（idle / ok / no 三态），在《庙算》里担任新角色。
export const CAST = {
  hebingwen: { name: '何炳文', role: '中央银行行长', desk: '央行', art: 'hebingwen',
    line: '汇率、外储、利率——三样东西只能同时管两样。' },
  zheng: { name: '郑处长', role: '金融稳定局 · 美联储观察员', desk: '金融稳定', art: 'zheng',
    line: '我每天早上第一件事，是看华盛顿昨晚说了什么。' },
  lin: { name: '林教授', role: '首席经济顾问', desk: '研究室', art: 'lin',
    line: '先问一句：这项政策剥夺了谁、补贴了谁？' },
  lumin: { name: '陆敏', role: '执政府新闻办主任', desk: '新闻办', art: 'lumin',
    line: '报纸可以不登，但人心里记着账。' },
  calloway: { name: '卡洛威', role: '美国财政部特使', desk: '来访', art: 'calloway', visitor: true,
    line: '我们只是希望贵国遵守市场规则——我们的市场，我们的规则。' },
};
export const CABINET = ['hebingwen', 'zheng', 'lin', 'lumin'];
export const artSrc = (id, mood = 'idle') => `../../art/char-${CAST[id].art}-${mood}.webp`;
