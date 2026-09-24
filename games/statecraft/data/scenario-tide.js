// M0 剧本「潮汐」：华胥（虚构国）在一轮完整的美元潮汐里执政 12 个季度。
// 数量级参照 2010 年代的中型新兴经济体（GDP 约 2.4 万亿美元），不是任何真实国家的数据。
export default {
  id: 'tide',
  title: '潮汐',
  subtitle: '一轮美元周期里的十二个季度',
  maxQ: 12,
  country: {
    name: '华胥',
    currency: '华元',
    blurb: '人口一亿二千万的制造业出口国。二十年间靠「外贸 + 外资 + 外汇」三件套完成工业化，外储是国民的骄傲，也是悬在头顶的问号。',
  },
  potential: 6.0,   // 潜在增速（年化 %）
  u0: 4.5,          // 自然失业率
  e0: 6.8,          // 基准汇率：1 美元 = 6.8 华元
  trade: { x0: 150, m0: 126 },       // 季度出口/进口（十亿美元）
  tide: {
    hikeStart: [5, 7],               // 美联储首次加息落在第几季度（随机）
    floor: 0.25, step: [0.5, 0.75], peak: [3.75, 4.75],
  },
  eco: {
    g: 6.4, pi: 2.4, u: 4.4,
    i: 4.0, rrr: 15, e: 6.8,
    reserves: 420, fxDebt: 110, fdiStock: 700, fdiFlow: 9,
    bubble: 104, debt: 38, conf: 64, npl: 1.8,
    gdpQ: 600, P: 100, bills: 60, sterCost: 0, tribute: 0,
    intl: 3, gold: 2, shock: 0, mImp: 0.8,
  },
  pol: { fxRegime: 'managed', capOpen: 1, sterilize: 50, fiscal: 0, press: 'guided', macropru: 1 },
  soc: {
    groups: { exporters: 60, finance: 55, workers: 60, savers: 53, local: 60 },
    trust: 60, national: 45, grievance: 4,
  },
  dip: { us: 58, swap: false },
  pc: 4,
};
