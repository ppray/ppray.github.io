// 模拟的「名词表」：利益集团、政令、可被事件改写的状态路径。
// 事件效果和条件只能引用这里登记过的路径——validate.mjs 据此做 schema 校验。

export const GROUPS = [
  { id: 'exporters', name: '出口商',     weight: 0.22, blurb: '沿海制造业与外贸企业。要便宜的华元、稳定的汇率、低利率。' },
  { id: 'finance',   name: '金融资本',   weight: 0.18, blurb: '银行、券商与离岸资金。要开放资本账户、少缴准备金、资产上涨。' },
  { id: 'workers',   name: '产业工人',   weight: 0.22, blurb: '工厂与建筑工地的劳动者。要就业、要工资跑赢物价。' },
  { id: 'savers',    name: '储户与中产', weight: 0.18, blurb: '存款、房产和子女留学。要正的实际利率、稳定的币值。' },
  { id: 'local',     name: '地方与国企', weight: 0.20, blurb: '地方政府、城投平台与国企。要财政扩张、廉价信贷、土地升值。' },
];
export const groupById = Object.fromEntries(GROUPS.map(g => [g.id, g]));

// 政令台。cost = 调整一次消耗的政治资本；react = 调整时各方的即时反应（按方向）。
export const POLICIES = {
  fxRegime: {
    label: '汇率制度', cost: 2,
    options: [
      { v: 'peg', label: '钉住美元', hint: '汇率不动，央行吞下全部外汇进出——外储就是弹药。' },
      { v: 'managed', label: '有管理浮动', hint: '每季度 ±2% 区间内浮动，央行吸收大部分压力。' },
      { v: 'float', label: '自由浮动', hint: '市场定价，外储基本不动，汇率自己吸收冲击。' },
    ],
  },
  capOpen: {
    label: '资本账户', cost: 2,
    options: [
      { v: 0, label: '严格管制', hint: '热钱进出都难——但恐慌时仍会通过贸易伪报渗漏。' },
      { v: 1, label: '部分开放', hint: '额度制：合格机构可进出。' },
      { v: 2, label: '完全开放', hint: '资本自由流动。配合钉住汇率 = 放弃货币政策独立（三元悖论）。' },
    ],
  },
  sterilize: {
    label: '冲销力度', cost: 0,
    options: [
      { v: 0, label: '不冲销', hint: '外汇占款直接变基础货币：通胀与资产价格上涨。' },
      { v: 50, label: '半冲销', hint: '一半用央票回收。' },
      { v: 100, label: '全冲销', hint: '发央票全部回收：物价稳，但冲销成本随利差累积，且推高利率、吸引更多热钱。' },
    ],
  },
  fiscal: {
    label: '财政取向', cost: 1,
    options: [
      { v: -1, label: '紧缩', hint: '压赤字：债务率降，增长与就业承压。' },
      { v: 0, label: '中性', hint: '维持现有支出。' },
      { v: 1, label: '扩张', hint: '基建与补贴：增长快、地方高兴，债务上升。' },
    ],
  },
  press: {
    label: '舆论管理', cost: 1,
    options: [
      { v: 'open', label: '开放', hint: '坏消息立刻见报，但你看到的数据最真实，民怨及时释放。' },
      { v: 'guided', label: '引导', hint: '主流媒体统一口径。' },
      { v: 'controlled', label: '管控', hint: '报纸只剩好消息——连你看到的仪表盘也会被「美化」，民怨在暗处累积。' },
    ],
  },
  macropru: {
    label: '外债管理', cost: 1,
    options: [
      { v: 0, label: '放开', hint: '企业与地方可自由借境外美元——潮水退去时是急停的引信。' },
      { v: 1, label: '额度管理', hint: '宏观审慎额度。' },
      { v: 2, label: '严格限制', hint: '只许有美元收入的主体借美元。' },
    ],
  },
};

// 连续型政令（央行每季度可调，不耗政治资本）
export const DIALS = {
  rate: { label: '政策利率', unit: '%', step: 0.25, min: 0, max: 20, maxMove: 2 },
  rrr: { label: '存款准备金率', unit: '%', step: 0.5, min: 5, max: 25, maxMove: 3 },
};

// 调整政令时各集团的即时反应：key = `${policy}:${方向或目标值}`
export const POLICY_REACT = {
  'fxRegime:peg':        { exporters: 4, finance: -2, conf: -1 },
  'fxRegime:managed':    { exporters: -1, conf: 2 },
  'fxRegime:float':      { exporters: -5, savers: -3, finance: 3, conf: 1 },
  'capOpen:up':          { finance: 7, savers: 2, us: 6, conf: 3 },
  'capOpen:down':        { finance: -9, savers: -2, us: -7, conf: -5, national: 2 },
  'fiscal:up':           { local: 5, workers: 2, conf: -1 },
  'fiscal:down':         { local: -7, workers: -4, conf: 2 },
  'press:open':          { trust: 3, national: -2 },
  'press:guided':        {},
  'press:controlled':    { trust: -2, national: 3 },
  'macropru:up':         { local: -4, finance: -3, conf: 2 },
  'macropru:down':       { local: 4, finance: 3, conf: -1 },
  'reval:up':            { exporters: -6, workers: -2, savers: 3, us: 5 },
  'reval:down':          { exporters: 5, savers: -4, us: -6, conf: -3 },
};

// 事件可读写的状态路径。type: num 带 [min,max] 钳制；enum 列可选值；bool；flag 任意标记。
export const PATHS = {
  'eco.i':        { type: 'num', min: 0, max: 30, label: '政策利率' },
  'eco.rrr':      { type: 'num', min: 5, max: 25, label: '存款准备金率' },
  'eco.e':        { type: 'num', min: 3, max: 40, label: '汇率' },
  'eco.reserves': { type: 'num', min: 0, max: 5000, label: '外汇储备' },
  'eco.fxDebt':   { type: 'num', min: 0, max: 2000, label: '短期外债' },
  'eco.bubble':   { type: 'num', min: 50, max: 250, label: '资产价格' },
  'eco.debt':     { type: 'num', min: 0, max: 300, label: '政府债务率' },
  'eco.conf':     { type: 'num', min: 0, max: 100, label: '市场信心' },
  'eco.npl':      { type: 'num', min: 0, max: 40, label: '不良率' },
  'eco.pi':       { type: 'num', min: -5, max: 60, label: '通胀' },
  'eco.g':        { type: 'num', min: -20, max: 15, label: '增长' },
  'eco.shock':    { type: 'num', min: 0, max: 20, label: '增长冲击' },
  'eco.intl':     { type: 'num', min: 0, max: 100, label: '本币国际化' },
  'eco.gold':     { type: 'num', min: 0, max: 60, label: '黄金占储备' },
  'eco.fdiFlow':  { type: 'num', min: -30, max: 40, label: 'FDI 流入' },
  'world.tariff': { type: 'num', min: 0, max: 0.5, label: '对华胥关税' },
  'world.oil':    { type: 'num', min: 0.3, max: 2.5, label: '油价指数' },
  'soc.trust':    { type: 'num', min: 0, max: 100, label: '民众信任' },
  'soc.national': { type: 'num', min: 0, max: 100, label: '民族情绪' },
  'soc.grievance':{ type: 'num', min: 0, max: 100, label: '积怨' },
  'dip.us':       { type: 'num', min: 0, max: 100, label: '对美关系' },
  'dip.swap':     { type: 'bool', label: '区域互换网' },
  'pol.fxRegime': { type: 'enum', values: ['peg', 'managed', 'float'], label: '汇率制度' },
  'pol.capOpen':  { type: 'enum', values: [0, 1, 2], label: '资本账户' },
  'pol.sterilize':{ type: 'enum', values: [0, 50, 100], label: '冲销力度' },
  'pol.fiscal':   { type: 'enum', values: [-1, 0, 1], label: '财政取向' },
  'pol.press':    { type: 'enum', values: ['open', 'guided', 'controlled'], label: '舆论管理' },
  'pol.macropru': { type: 'enum', values: [0, 1, 2], label: '外债管理' },
  'pc':           { type: 'num', min: 0, max: 6, label: '政治资本' },
};
for (const g of GROUPS) PATHS[`soc.groups.${g.id}`] = { type: 'num', min: 0, max: 100, label: g.name };
// 只读路径（条件可用、效果不可写）：派生量与时间
export const READ_PATHS = {
  q: 'num', 'world.fed': 'num', 'world.phase': 'enum', 'world.risk': 'num',
  'eco.adequacy': 'num', 'eco.ca': 'num', 'eco.kf': 'num', 'eco.dR': 'num', 'eco.u': 'num',
  'eco.caShare': 'num', 'eco.realDeposit': 'num', 'eco.sterCost': 'num', 'eco.bills': 'num',
  legit: 'num', 'hist.controlledQs': 'num',
};

export const PHASES = {
  fangshui: { label: '放水', blurb: '美联储零利率，美元外溢，热钱涌入外围。' },
  chuipao:  { label: '吹泡', blurb: '资产价格在廉价美元里膨胀；市场开始揣测转向。' },
  shoushui: { label: '收水', blurb: '美联储加息，美元回流，外围资本外流。' },
  shouge:   { label: '收割', blurb: '高利率与强美元下，脆弱的外围国家接连爆雷。' },
};
