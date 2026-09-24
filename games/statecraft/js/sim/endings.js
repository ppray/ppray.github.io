// 结局与史评。每个结局都对照一段真实历史，并给出「得算」评级。
const E = {
  default: { title: '主权违约', seal: '丁', tone: 'bad',
    text: '债务与信心同时崩塌，{name}宣布暂停偿付外债。执政府在一片混乱中交出权力。',
    mirror: { place: '阿根廷', year: '2001', text: '钉住美元的货币局制度在美元走强与资本外流中难以为继，2001 年 12 月阿根廷宣布债务违约，一个月内更换了五位总统。' } },
  street: { title: '街头的终局', seal: '丁', tone: 'bad',
    text: '积怨冲破了堤坝。罢工、游行与骚乱持续数周，你在一个清晨宣布辞职。',
    mirror: { place: '印尼', year: '1998', text: '亚洲金融危机中印尼盾暴跌八成以上，IMF 方案下燃油涨价引发骚乱，执政三十余年的苏哈托于 1998 年 5 月辞职。' } },
  palace: { title: '宫廷里的终局', seal: '丁', tone: 'bad',
    text: '没有人上街。金融资本与地方诸侯先后倒戈，执政联盟在一次闭门会议后宣告解体。',
    mirror: { place: '政治学', year: '', text: '统治的合法性不只来自民众，也来自执政联盟内部的利益交换；当精英集团认为继续支持的代价高于收益，政权可以在无声中更替。' } },
  ousted: { title: '黯然去职', seal: '丁', tone: 'bad',
    text: '合法性跌破了底线。你没能撑到任期结束。',
    mirror: { place: '政治学', year: '', text: '政治统治合法化有两条途径：法律基础（硬）与意识形态教化（软）。当政绩与认同同时流失，两条都会失效。' } },
  harvested: { title: '被收割', seal: '丙', tone: 'bad',
    text: '你熬到了任期结束，但华元崩了、IMF 来了，本国资产被外资低价收购。潮水退去，{name}成了别人的收成。',
    mirror: { place: '韩国 · 泰国', year: '1997', text: '美元潮汐四步的最后一步：收割。外围国家在放水期借入美元、吹起泡沫，收水期资本撤离、货币崩溃，中心国家的资本在危机中低价入场。' } },
  naked: { title: '潮退裸泳', seal: '丙', tone: 'mixed',
    text: '华元失守，被迫浮动。你保住了位子，但{name}的中产阶级在一个季度里失去了三成购买力。',
    mirror: { place: '泰国', year: '1997', text: '1997 年 7 月 2 日泰国放弃泰铢与美元挂钩，此前央行在远期市场耗尽了几乎全部可用外储。潮水退去，才知道谁在裸泳。' } },
  iron: { title: '铁幕下的稳定', seal: '丙', tone: 'mixed',
    text: '报纸上一片光明，街头一片安静。只有你知道仪表盘上的数字有多少是真的——也许连你也不知道。',
    mirror: { place: '苏联', year: '1970s–1980s', text: '苏联模式晚期，层层上报的计划完成数字与真实经济渐行渐远，决策者依据失真的信息治国，合法性在无声中流失（政治学：苏联模式的失败）。' } },
  stood: { title: '潮退而立', seal: '甲', tone: 'good',
    text: '一轮完整的美元潮汐过去了。{name}的汇率守住了、银行没有倒、民心还在。邻国的报纸开始研究「华胥经验」。',
    mirror: { place: '中国', year: '1998 / 2015–2016', text: '1998 年亚洲金融危机中人民币坚持不贬值；2015–2016 年资本外流中，中国外储从近 4 万亿美元降到约 3 万亿美元，靠汇改、资本流动管理与外储缓冲稳住了局面。' } },
  survived: { title: '守成', seal: '乙', tone: 'mixed',
    text: '没有奇迹，也没有灾难。{name}付出了代价，但熬过了潮汐。',
    mirror: { place: '印度 · 印尼', year: '2013–2015', text: '「脆弱五国」在缩减恐慌后经历了货币贬值与加息，但多数避免了全面危机——代价是几年的低增长。' } },
  lame: { title: '跛脚任满', seal: '丙', tone: 'mixed',
    text: '你做满了任期，但几乎没有人记得你做过什么——除了那些对你不满的人。',
    mirror: { place: '政治学', year: '', text: '政治参与的制约因素之一是政治效能感：当民众认为政府回应不了诉求，信任会先于政权流失。' } },
};

export function ending(S) {
  let id;
  const G = S.soc.groups;
  if (S.over === 'default') id = 'default';
  else if (S.over === 'ousted') id = S.soc.grievance > 28 || G.workers < 28 ? 'street' : (G.finance < 32 || G.local < 32) ? 'palace' : 'ousted';
  else if (S.flags.forcedFloat && S.flags.imfProgram) id = 'harvested';
  else if (S.flags.forcedFloat) id = 'naked';
  else if (S.hist.controlledQs >= 6 && S.soc.trust < 48) id = 'iron';
  else if (S.legit >= 59) id = 'stood';
  else if (S.legit >= 50) id = 'survived';
  else id = 'lame';
  const def = E[id];
  const intel = S.intel || { asked: 0, correct: 0 };
  const rate = intel.asked ? intel.correct / intel.asked : 0;
  const suan = intel.correct >= 14 && rate >= 0.75 ? '上算' : intel.correct >= 8 && rate >= 0.55 ? '中算' : intel.correct >= 3 ? '下算' : '无算';
  return { id, ...def, text: def.text.replace(/\{name\}/g, S.name), suan, rate, quarters: S.hist.rows.length - 1 };
}

export const SUAN_TEXT = {
  上算: '「多算胜」。你几乎每次都在拍板之前看清了后果。',
  中算: '「少算不胜」。一半的决定你看清了，另一半靠运气。',
  下算: '你很少召对顾问，或召对了也没能听懂。',
  无算: '「而况于无算乎」。你在没有推演的情况下完成了整个任期。',
};
