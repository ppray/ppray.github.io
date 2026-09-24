// 章节与概念分类表：题库打标签、事件挂考点、史评出复习建议，全部从这里读。
// 纯数据 + 正则，改分类只动这一个文件；scripts/statecraft/validate.mjs 会校验引用完整性。

// 《货币与金融的国际政治经济学》14 章（对应 国关复习/mfipe-data.js 的 TOPICS），外加政治学原理。
// level：must 必背 · hard 重难点 · supp 补充 · extra 补遗 · pol 政治学
export const CHAPTERS = [
  { id: 'fx-reserves',      label: '外汇储备',             level: 'must', freq: '9 次', game: 'fx-reserves',      gameTitle: '外储纪年', card: '外汇储备-关键词速查卡.html' },
  { id: 'fx-rate',          label: '人民币汇率',           level: 'must', freq: '8 次', game: 'fx-rate',          gameTitle: '汇改纪年', card: '人民币汇率-关键词速查卡.html' },
  { id: 'gold-std',         label: '金本位制度',           level: 'must', freq: '7 次', game: 'gold-std',         gameTitle: '金锚纪年' },
  { id: 'rmb-intl',         label: '人民币国际化',         level: 'must', freq: '6 次', game: 'rmb-intl',         gameTitle: '出海纪年', card: '人民币国际化-关键词速查卡.html' },
  { id: 'bretton',          label: '布雷顿森林与牙买加体系', level: 'hard', freq: '5 次', game: 'bretton',          gameTitle: '潮汐纪年', card: '布雷顿森林与牙买加体系-关键词速查卡.html' },
  { id: 'center-periphery', label: '中心-外围体系',         level: 'hard', freq: '5 次', game: 'center-periphery', gameTitle: '圈层纪年', card: '中心-外围体系-关键词速查卡.html' },
  { id: 'monetary-tools',   label: '货币政策工具与机制',   level: 'hard', freq: '5 次', game: 'monetary-tools',   gameTitle: '水阀纪年' },
  { id: 'crisis-history',   label: '全球金融危机史',       level: 'hard', freq: '4 次', game: 'crisis-history',   gameTitle: '危机纪年', card: '全球金融危机史-关键词速查卡.html' },
  { id: 'fdi',              label: '外资(FDI)与中国工业化', level: 'hard', freq: '4 次', game: null, card: '外资FDI与中国工业化-关键词速查卡.html' },
  { id: 'us-hegemony',      label: '美元霸权与美国政策',   level: 'supp', freq: '',     game: 'us-hegemony',      gameTitle: '特权纪年', card: '美元霸权与美国政策-关键词速查卡.html' },
  { id: 'cycles',           label: '经济周期与理论模型',   level: 'supp', freq: '',     game: 'cycles',           gameTitle: '长波纪年', card: '经济周期与理论模型-关键词速查卡.html' },
  { id: 'deglobalization',  label: '新自由主义与全球化变迁', level: 'supp', freq: '',   game: 'deglobalization',  gameTitle: '退潮纪年', card: '新自由主义与全球化变迁-关键词速查卡.html' },
  { id: 'regional',         label: '区域合作与特定项目',   level: 'supp', freq: '',     game: null, card: '区域合作与特定项目-关键词速查卡.html' },
  { id: 'general',          label: '综合名词与模拟卷补遗', level: 'extra', freq: '',    game: null },
  { id: 'politics',         label: '政治学原理',           level: 'pol',  freq: '',     game: null, page: '/quiz.html' },
];

export const LEVEL_LABEL = { must: '必背', hard: '重难点', supp: '补充', extra: '补遗', pol: '政治学' };

// mfipe-data.js 的 TOPICS 标题 → 章节（按标题里的关键词匹配，顺序即优先级）
export const MFIPE_TOPIC_RULES = [
  [/金本位/, 'gold-std'], [/布雷顿|牙买加/, 'bretton'], [/美元霸权/, 'us-hegemony'],
  [/中心-外围|中心外围/, 'center-periphery'], [/货币政策工具/, 'monetary-tools'],
  [/危机史/, 'crisis-history'], [/经济周期/, 'cycles'], [/新自由主义|全球化变迁/, 'deglobalization'],
  [/区域合作/, 'regional'], [/外资|FDI/, 'fdi'], [/外汇储备/, 'fx-reserves'],
  [/人民币国际化/, 'rmb-intl'], [/人民币汇率/, 'fx-rate'], [/综合性|补遗|总览/, 'general'],
];

// 概念：事件挂考点用的颗粒度。chapter = 主归属章（史评里「去哪复习」）。
// re 在题干 + 解析 + 考点上匹配；章节自带的 base 概念不需要正则也会打上。
export const CONCEPTS = [
  // ── 货币金融
  { id: 'reserves',       label: '外汇储备与外汇占款', chapter: 'fx-reserves',      re: /外汇储备|外储|外汇占款|结售汇|美债/ },
  { id: 'sterilization',  label: '冲销与对冲',         chapter: 'monetary-tools',   re: /冲销|对冲|央票|央行票据|外汇占款/ },
  { id: 'trilemma',       label: '三元悖论',           chapter: 'fx-rate',          re: /三元悖论|不可能三角|蒙代尔|资本(自由)?流动.{0,12}(货币政策|独立)|货币政策独立/ },
  { id: 'fx-regime',      label: '汇率制度与汇改',     chapter: 'fx-rate',          re: /汇率|汇改|811|8·11|钉住|盯住|浮动|中间价|升值|贬值/ },
  { id: 'monetary-tools', label: '货币政策工具',       chapter: 'monetary-tools',   re: /准备金|再贷款|MLF|SLF|公开市场|基础货币|货币乘数|利率市场化|最后贷款人|量化宽松|QE/ },
  { id: 'distribution',   label: '剥夺与补贴',         chapter: 'fx-reserves',      re: /剥夺|补贴了?谁|谁买单|储户|负利率|金融抑制|羊毛|受益者|受害者/ },
  { id: 'dollar-tide',    label: '美元潮汐',           chapter: 'bretton',          re: /潮汐|放水|吹泡|收水|收割|加息|缩表|美联储|缩减/ },
  { id: 'dollar-hegemony',label: '美元霸权',           chapter: 'us-hegemony',      re: /霸权|嚣张特权|铸币税|特里芬|石油美元|美元指数/ },
  { id: 'currency-intl',  label: '货币国际化',         chapter: 'rmb-intl',         re: /国际化|跨境(贸易)?结算|离岸|货币互换|SDR|特别提款权|CIPS|计价|熊猫债/ },
  { id: 'crisis',         label: '金融危机',           chapter: 'crisis-history',   re: /危机|挤兑|投机攻击|索罗斯|传染|违约|崩盘|急停/ },
  { id: 'debt',           label: '债务与货币错配',     chapter: 'crisis-history',   re: /错配|外债|原罪|债务|杠杆|美元债/ },
  { id: 'center-periphery', label: '中心-外围',        chapter: 'center-periphery', re: /中心[-—－]外围|中心国|外围国?|半外围|依附|劫贫济富|套叠/ },
  { id: 'gold-standard',  label: '金本位与黄金',       chapter: 'gold-std',         re: /金本位|黄金|休谟|金汇兑|黄金输送点/ },
  { id: 'bretton-woods',  label: '布雷顿森林与牙买加', chapter: 'bretton',          re: /布雷顿|牙买加|双挂钩|黄金窗口|尼克松/ },
  { id: 'cycles',         label: '经济周期',           chapter: 'cycles',           re: /周期|康波|长波|朱格拉|基钦|库兹涅茨|通缩|滞胀|滞涨|大宗商品/ },
  { id: 'neoliberal',     label: '新自由主义与全球化', chapter: 'deglobalization',  re: /新自由主义|华盛顿共识|私有化|自由化|全球化|去全球化|逆全球化/ },
  { id: 'trade-war',      label: '贸易战与汇率操纵',   chapter: 'fx-rate',          re: /操纵|关税|贸易战|广场协议|301|以贸解财|顺差/ },
  { id: 'sanctions',      label: '金融制裁与储备武器化', chapter: 'us-hegemony',    re: /制裁|冻结|武器化|SWIFT|长臂|恐怖平衡|人质/ },
  { id: 'fdi',            label: '外资与产业链',       chapter: 'fdi',              re: /FDI|外资|外商直接投资|三外路线|CICE|产业链编辑|雁行|微笑曲线|市场换技术|产业转移/ },
  { id: 'regional',       label: '区域合作',           chapter: 'regional',         re: /区域|RCEP|一带一路|最优货币区|OCA|清迈|欧元区|统币分财/ },
  // ── 政治学
  { id: 'power',          label: '政治权力与统治',     chapter: 'politics',         re: /政治权力|权威|统治类型|韦伯|卡里斯马/ },
  { id: 'legitimacy',     label: '政治合法性',         chapter: 'politics',         re: /合法性|合法化|统治阶级|政治统治|统治类型|韦伯|卡里斯马|法理型|政治沟通|舆论/ },
  { id: 'political-culture', label: '政治文化与意识形态', chapter: 'politics',      re: /政治文化|意识形态|政治社会化/ },
  { id: 'participation',  label: '政治参与与政党',     chapter: 'politics',         re: /政治参与|政党|社团|利益集团|议会|选举|多党合作/ },
  { id: 'state-capacity', label: '国家能力与政治发展', chapter: 'politics',         re: /国家能力|政治发展|政治管理|国家的|国家四要素|现代化/ },
  { id: 'ir',             label: '国际体系与外交',     chapter: 'politics',         re: /国际体系|国际格局|国家主权|国家利益|综合国力|相互依存|外交|联合国|跨国公司|国际组织|国际冲突/ },
  { id: 'socialism',      label: '社会主义与中共党史', chapter: 'politics',         re: /社会主义|马克思|毛泽东|邓小平|苏联|东欧|共产|十[八九]大|新时代|一国两制|五四|条约|革命/ },
];

// 每章的基础概念（不需要正则也打上）
export const CHAPTER_BASE = {
  'fx-reserves': ['reserves'], 'fx-rate': ['fx-regime'], 'gold-std': ['gold-standard'],
  'rmb-intl': ['currency-intl'], 'bretton': ['bretton-woods'], 'center-periphery': ['center-periphery'],
  'monetary-tools': ['monetary-tools'], 'crisis-history': ['crisis'], 'fdi': ['fdi'],
  'us-hegemony': ['dollar-hegemony'], 'cycles': ['cycles'], 'deglobalization': ['neoliberal'],
  'regional': ['regional'], 'general': [], 'politics': [],
};

// 政治学之外的 quiz-questions 条目（ipe-*）没有章节字段：按概念命中数投票归章，平票取 CONCEPTS 中靠前者。
export const conceptById = Object.fromEntries(CONCEPTS.map(c => [c.id, c]));
export const chapterById = Object.fromEntries(CHAPTERS.map(c => [c.id, c]));
