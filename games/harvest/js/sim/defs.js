// 《猎潮》名词表：资金规则、工具类型、评级。
// 一句话讲清这个游戏在模拟什么：
//   危机的「方向」事后看是确定的，难的是三件事——什么时候进、用多大杠杆、什么时候跑。
//   早了被 carry 磨死（保尔森 2006 建仓，被赎回逼到差点放弃），晚了赚不到，跑晚了被政策反杀（德拉吉一句话轧空全欧洲空头）。

export const START_EQUITY = 100;   // 起始权益（百万美元）
export const UNIT = 30;            // 一档敞口的名义本金（百万美元）
export const MAX_STEP = 6;         // 单一工具最多 6 档
export const MARGIN_RATE = 0.20;   // 初始保证金率 → 每档占用保证金 UNIT × 0.2 = 6
export const MAINT_BASE = 0.10;    // 维持保证金率（占总敞口）；流动性越差要求越高：MAINT_BASE / liq
export const TRADE_COST = 0.004;   // 调仓滑点：按变动的名义本金计
export const MCALL_FEE = 0.02;     // 强平罚金：按被平掉的名义本金计
export const HEAT_TRIGGER = 100;   // 监管热度到顶 → 下回合政策干预落地
export const INTEL_COST = 4;       // 买一次情报的费用（从权益里扣）
export const LOBBY_COST = 6;       // 游说一次降热度
export const LOBBY_HEAT = -22;

// 工具原型。dir 是「默认持仓方向」：+1 多头（标的涨则赚）、-1 空头（标的跌则赚）。
// mv 一律写成「标的本身的涨跌」，收益 = dir × mv × 名义本金。
export const TOOL_KINDS = {
  fx:     { name: '汇率',   carry: 0.010, kind: '做空', desc: '借入弱势货币换成美元：贬值即收益，但利差天天在抽血。' },
  bond:   { name: '主权债', carry: 0.009, kind: '做空', desc: '做空主权债 / 买信用保护：利差走阔与违约都赚钱，波动大。' },
  cds:    { name: 'CDS',    carry: 0.012, kind: '买保护', desc: '付保费买违约保险：太平岁月天天失血，出事一次回本。' },
  eq:     { name: '股票',   carry: 0.006, kind: '做空', desc: '融券做空股指或个股：借券费 + 股息，最怕轧空。' },
  vol:    { name: '波动率', carry: 0.020, kind: '做多', desc: '买期权做多波动率：theta 最贵，但崩盘时它是唯一上涨的东西。' },
  haven:  { name: '避险',   carry: 0.002, kind: '做多', desc: '美债、黄金、美元：危机里的压舱石，收益薄但是正的。' },
  dist:   { name: '抄底',   carry: 0.002, kind: '做多', desc: '不良资产、折价债、被砸出坑的股票：要等到血流成河才有货。' },
};

// 评级。门槛由 scripts/harvest/balance.mjs 反推：
// 「半仓常驻不择时」落在青铜—白银（脚本实测 185–264，人是达不到脚本精度的），
// 「完美时机」落在秃鹫（333–614）。一句话：看对方向只值青铜，跑对时点才值秃鹫。
export const GRADES = [
  { key: 'bust',    min: -Infinity, max: 60,       name: '清盘', word: 'margin call',  snark: '你死在黎明前：方向也许没错，但杠杆先杀死了你。' },
  { key: 'cut',     min: 60,        max: 100,      name: '割肉', word: 'stopped out',  snark: '看对了剧情，没赚到钱——持仓成本和恐惧吃掉了你的收益。' },
  { key: 'bronze',  min: 100,       max: 145,      name: '青铜', word: 'in the money', snark: '赚到了，但只吃到鱼身的一小段。真正的钱在拐点那一两天。' },
  { key: 'silver',  min: 145,       max: 195,      name: '白银', word: 'well played',  snark: '时机和仓位都对了一次。剩下的差距只在退出。' },
  { key: 'vulture', min: 195,       max: Infinity, name: '秃鹫', word: 'vulture',      snark: '你在最恐慌的那一周满仓，又在央行开口那天全部离场。这就是收割。' },
];

export const GRADE_ORDER = ['bust', 'cut', 'bronze', 'silver', 'vulture'];

export function gradeOf(equity, busted) {
  if (busted) return GRADES[0];
  for (const g of GRADES) if (equity >= g.min && equity < g.max) return g;
  return GRADES[GRADES.length - 1];
}

// 监管热度：不是「你做得多大」，而是「你做得多大 + 做得多么招摇」。
// 做空主权货币、买主权 CDS 最招骂；做多避险资产几乎没人管。
export const HEAT_WEIGHT = { fx: 1.0, bond: 1.0, cds: 1.2, eq: 0.7, vol: 0.4, haven: 0.1, dist: 0.0 };
