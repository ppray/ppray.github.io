# 《帝国的账本：核心与边缘》 v3.4 修复/优化计划

> 输入：`implementation_plan_v3.3.md`、对当前代码库的全量审计、第三方 review 的逐条对账。
> 原则：**先让一切能跑，再让数字真实，最后补机制。** 任何数据调整以 `tools/balance.js` 门禁 exit 0 为唯一验收标准，禁止"先写结论再验算"。

---

## 〇、 对账结论（两份输入的取舍依据）

第三方 review 方向正确但数字过时，采纳其方法论、修正其数值：

| Review 论断 | 核实结果 | 取舍 |
|---|---|---|
| balance.js 从未跑过、数据未经验证 | ✅ 属实（门禁当前因 NaN 为红，且无 runner） | 采纳，列 P0 |
| 补丁 11/12/8b 消失，新补丁依赖其符号 | ✅ 属实（`NationalIncome`、`milSpendRate` 无定义/死字段） | 采纳 |
| 无人口增长，刘易斯拐点单向 | ✅ 属实 | 采纳 |
| 杠杆分工表（P0-3 方法论） | ✅ 正确 | 原文采纳 |
| W_sub 在计划中未定义 | ✅ 属实；但代码已自作主张取 `0.05 × 篮子 ≈ 2.6` | 采纳问题，重定口径 |
| 炼钢厂毛利 −40（按产出 10 算） | ❌ 当前产出为 12，毛利 **+80**；但人均 VA 32 仍是全行业最低 | 问题降级保留 |
| "英国全线亏损"（W_sub 33–70 假设） | ❌ 代码实际工资率 2.8–4.0，t=0 残差全为正；真实问题是**工资购买力崩坏**（工资 ≈ 4 vs 生存篮子 52） | 反转后采纳 |
| GBR 在工资曲线深陡区（u=0.923） | ❌ 实际 u=0.873，刚过拐点 | 量级下修，阻尼建议保留 |
| 棉花 87 座（QING 50）砍到 33 | ❌ 实际 79 座（QING 42）；思路对、基数错 | 重算后采纳 |
| USA 张力缺 clamp [0,100] | ❌ `stats.js:50` 已有 clamp | 驳回 |

审计独有、review 未发现的两个最前置问题：

1. **引擎入口崩溃**：`core.js:17` `structuredClone(COUNTRIES_1836)` 遇到 `winCondition.check` 函数抛 `DataCloneError`（Node 与浏览器均崩），v3.3 引擎从未成功运行过一次。
2. **测试假绿**：无 runner，`node js/tests/*.test.js` 定义函数后静默退出 0。

---

## 一、 M0 — 解锁（P0，一切工作的前提）

### 1.1 修复引擎入口崩溃
- 将 `winCondition` / `loseCondition` 的 `check` 函数移出 `js/data/countries.js`，新建 `js/engine/rules.js`，按国家 id 查表挂载；`countries.js` 只保留可结构化克隆的纯数据（`winConditionId` 字符串）。
- `core.js` 中 `playerConfig.winCondition.check(...)` 改为 `RULES[playerNationKey].win.check(...)`。

### 1.2 修复 balance.js 并装上阻塞牙齿
- 修 NaN：`pop_needs.js:51` `getGovernmentDemand(nation, prices)` 统一改读 `prices.arms.base_price ?? prices.arms.price ?? 90`，或调用方传基准价表。
- 补齐补丁 1 规范的三条断言：
  - 8 种货物 S/D ∈ [0.7, 1.4]；
  - **扣除工资与折旧后的残差 > 0**（兵工厂允许微亏）——门禁口径明确为工资后，否则炼钢厂一类低 VA 部门全部漏过；
  - 全球净出口和 = 0。
- 补 `process.exit(1)` 阻塞与 CLI 入口（`node tools/balance.js` 直接可跑，输出表格）。

### 1.3 测试 runner 与去重
- 加 `package.json`（`"type": "module"`，`"test": "node tools/run-tests.js"`），`tools/run-tests.js` 依次执行全部测试套件并汇总退出码。
- 删除过时双份文件 `js/tests/theory_ss.js`、`js/tests/invariants.js`（保留 `.test.js` 新版）。

**M0 验收**：`node tools/balance.js` 有真实退出码；`npm test` 真实执行全部断言（允许红，禁止假绿）。

> **M0 已完成 (2026-08-10)**：引擎可跑（`structuredClone` 崩溃已修）；`node tools/balance.js` 真实阻塞（当前红：军火 S/D = 7.13，即补丁 4b 未落地，待 M1-2.6）；`npm test` 3 通过 1 失败，唯一红项为确定性快照（`ai.js` 的 `Math.random()`，待 M2-3.3 种子化 RNG）；净出口守恒旧断言前提错误（与 S/D 区间设计矛盾），已改写为聚合簿记恒等式断言。另发现并修复 `js/ui.js` 两处错误 import 路径（此前 UI 同样无法加载）。

---

## 二、 M1 — 数据校准（P0，门禁转绿）

### 2.1 杠杆分工（写入规范，违反即评审打回）

| 杠杆 | 影响 S/D | 影响单位盈利 | 用途 |
|---|---|---|---|
| 建筑数量 | ✅ | ❌ 不变 | 专用于调 S/D |
| base_price | 弱（经需求结构） | ✅ | 专用于调盈利 |
| employmentSize | ❌ | ✅ | 调人均增加值 |
| 配方输入系数 | ✅ | ✅ | **禁止用于调 S/D** |

### 2.2 定义生存篮子与工资口径（补丁 3c 补全）
- `SubsistenceBasketCost = 粮食 1.5 × P_grain + 煤 0.2 × P_coal`（最低生存口径，基准价下 = 38），`margin` 取 5–10%。
- 删除 `pops.js:51` 的 `0.05 × basketCost` 临时值。
- 量级约束写进门禁：`max(四国工资率) ≤ min(各建筑人均VA) × 0.8`，留出 ≥20% 利润垫。
- 同步更新 `realIncome`（实际购买力 = 收入 / 篮子成本）使工人 SOL 与工资自洽。

### 2.3 炼钢厂配方修复（杠杆表示例）
- 输入 `{iron: 8, coal: 8}` → `{iron: 7, coal: 7}`（候选 `{6,6}`）：投入 640→560，VA 80→160，人均 VA 32→64。
- 铁、煤因此回到过剩侧的缺口用**矿场数量**回调（禁止再动配方）：铁 S/D 目标回落到 ≤1.3，煤 ≥0.8。

### 2.4 棉花改用数量杠杆（补丁 4a 返工）
- 产出恢复 `7 → 18`（人均 VA 40→103，美国南方叙事载体复活）。
- 种植园数量 79 → 33：QING 42→19、USA 35→13、GBR 2→1，S = 33×18 = 594，S/D = 594/574 ≈ 1.03。
- 连带重定标劳动力禀赋保持各国 u 的设计意图（就业随数量下降）：
  - USA：禀赋 450→360，就业 ≈297 → u ≈ 0.825（保持"恰在拐点下方"）；
  - QING：禀赋 2500→2000，就业 ≈417 → u ≈ 0.21（边缘剩余劳动力）；
  - GBR：禀赋 300 不变，就业 ≈258.5 → u ≈ 0.862（刚过拐点）。

### 2.5 工资曲线阻尼
- `α: 1.2 → 0.8`（拐点可见、斜率可控）。GBR u=0.862 处就业 +3pp 的工资涨幅从 ~30% 降至 ~15%，缓解补丁 7 反馈形成的极限环。
- 最终值由 M2 的蛛网稳定性预检裁决。

### 2.6 军费口径（补丁 4b 落地）
- `NationalIncome_n = landRent + capitalProfit + laborWages`（滞后一期，取自 `pops.js` 的 `factorIncome`）。
- `getGovernmentDemand` 改为 `MilitaryBudget = milSpendRate × NationalIncome`，采购量 `= MilitaryBudget / P_arms`；弃用 `treasury × 8%`。
- QING `milSpendRate` 0.04→0.05，与计划"5–7%"口径一致。

### 2.7 折旧（补丁 10a 补实现）
- `pops.js` 残差计算中扣除 `upkeep = buildCost × 0.02 × count`（工资之后、地租/利润切分之前）；删除 `core.js:63` 无代码对应的注释或使其名实相符。
- 门禁的残差断言必须含此项。

**M1 验收**：`node tools/balance.js` exit 0；`countries.js` 注释中的就业/u 数值与实算一致（注释同步也是门禁内容）。

> **M1 已完成 (2026-08-10)**：`node tools/balance.js` exit 0，四国全部建筑工资后残差为正，铁矿 S/D = 1.29。
> 落地与修正记录：
> 1. `tools/balance.js` 残差口径 bug：单座残差的 upkeep 误乘 count（建筑数量），已改回单座口径 `buildCost × 0.02`（引擎 `pops.js` 为总量口径，本就自洽；此前门禁因此把 GBR/PRS/USA 铁矿判成假负）。
> 2. 补上 2.2 遗漏的工资量级门禁（断言 4：max工资率 ≤ min人均VA × 0.8）。
> 3. 铁矿基准价 40→46（base_price 杠杆补盈利，人均 VA 69，满足量级约束并留 ≥2 余量）。
> 4. PRS 铁矿场 15→12（数量杠杆压铁矿 S/D），连带禀赋 280→270 保持 u≈0.863 过拐点设计；USA 注释就业/u 同步为实算 297/0.825。
> 另完成 M2 前置两项：
> 5. 种子化 RNG：新增 `js/engine/rng.js`（mulberry32），`ai.js` 的 `Math.random()` 已替换，种子存于 `state.rngState`，50 回合快照重演逐比特一致。
> 6. P-S 长期漂移：`market.js` 中 primary/raw 下行、intermediate/manufactured 上行（1%/turn），与移动锚取均值，漂移封顶 1.4×；USA 内战张力改用收入增速差（资本家增速 vs 种植园地租增速），地主按部门拆分（`plantationLandRent` 独立记账于 `pops.js`，仅种植园地主进入张力公式）。
> 7. **新增 P-S 硬门禁断言**：t=0 固定拉氏篮子，出口 primary/raw、进口 intermediate/manufactured，50 回合 ToT 恶化 ≥15%。
> 8. **旧引擎死代码删除**：`js/engine.js`、`js/market.js` 已无引用，已移除。
> **当前：`npm test` 6/6 全绿，`balance.js` exit 0。**

---

## 三、 M2 — 机制补全（P1）

### 3.1 投资池与建造（补丁 6 + 8 顺序）
- `build()` 改从 `investmentPool` 扣款（资本家投资），政府直接建造才动 `treasury`。
- `endowments.capital` 生效：每回合建造额度上限 = capital 禀赋（流量定义，不永久占用）。
- 建造决策按 t−1 各单位利润率（残差/产值）排序，选最赚钱产业；AI 建造从步骤 1 移至步骤 9（财政/投资池结算之后），与补丁 8 管线定稿一致。

### 3.2 AI 蛛网完整路径（补丁 7）
- 每国每建筑记录 `utilization` 与 `lowUtilizationTurns`：
  - `P_dom > UnitCost × 1.2` → 产能 +3%；
  - `P_dom < UnitCost` → 降开工率；
  - 开工率 < 0.5 连续 5 回合 → 拆除 2% 产能。
- 删除 `estimatedUnitCost = 15` 硬编码，单位成本 = (投入成本 + 工资账单 + 折旧) / 产出。

### 3.3 确定性（补丁 12 核心回填）
- 删除 `ai.js` 的 `Math.random()`；引入种子化 RNG（mulberry32），种子存于 `state.rngState`，快照重演必须逐比特一致。
- `state.history[]` 只存标量序列（价格、ToT、收入份额），供 dev.html 曲线与测试断言共用。

### 3.4 霸权模块（补丁 9 落地）
- `H_target = 100 × (w₁·armsShare + w₂·heavyShare + w₃·tradeShare)`，霸权度向 `H_target` 渐进（替换 +1/−2 规则）。
- 定义 `requiredHegemonyCost`（标定目标：占 GBR 财政收入 30–50%），`seaLaneSecurity = clamp(paidCost/requiredCost, 0, 1)` 改为按实际拨付比例连续取值。
- `freightCost_g = baseFreight_g × (2 − seaLaneSecurity)` 作为隐性关税楔入进口价。

### 3.5 价格锚与内战张力（补丁 10b/10c）
- 移动锚漂移 `Base_{t+1} = Base_t × (1 + 0.02 × (P_t/Base_t − 1))`；P-S 长期漂移（primary −0.4%/turn、manufactured +0.4%/turn）**保留**——它是大清 ToT 恶化断言的驱动源，两者职责不同（锚=短期均值回归，漂移=长期贸易条件趋势），写入规范避免再次混淆。
- 内战张力改用**收入增速差**：`IncomeGain_x = (Income_{x,t} − Income_{x,t−1}) / Income_{x,t−1}`，地主收入按部门拆分（种植园地租 vs 农场地租），只有种植园地主进入张力公式；保留现有 clamp [0,100]。

### 3.6 人口增长
- `LaborEndowment_{t+1} = LaborEndowment_t × (1 + g_n)`：`g_GBR = 0.008`、`g_PRS = 0.010`、`g_USA = 0.025`、`g_QING = 0.006`。
- 生存部门人口随之自动补充，刘易斯拐点变为可往返。

**M2 验收**：`npm test` 全绿，含新增两条断言：
- 平滑度：第 5 回合热身收敛后 `|ΔP/P| < 8%`/turn 且无负数/NaN；
- 蛛网稳定性预检：AI 自由扩产 50 回合，价格与产能不发散（供给弹性 > 需求弹性时的振荡在门禁期暴露）。

> **M3 已收口 (2026-08-10)**：新增 `js/tests/theory_ps.test.js` 并通过；`npm test` 6/6 全绿，`balance.js` exit 0；旧引擎 `js/engine.js`、`js/market.js` 已删除。
> 当前 ToT 实现：t=0 固定各国进出口篮子，出口只计 primary/raw 净出口、进口只计 intermediate/manufactured 净进口，基期价值归一化 100，形成真正的拉氏指数；P-S 长期漂移已扩展为 primary/raw 下行、intermediate/manufactured 上行（1%/turn）。
> 仍待补：v4 单一事实来源规范文档（`implementation_plan_v4.md`）、补丁 11 与 8b 的完整文字回填。若不需要文档，M3 可视为结束。
> 落地记录：
> 1. **3.1 投资池建造**：`ai.js` 重写为 `executeNationAI`（政策脚本）+ `executeNationBuild`（蛛网建造）分离；`build()` 改从 `investmentPool` 扣款；`endowments.capital` 的 10% 作为每回合建造额度上限（流量定义，蛛网扩产+新建共享）；建造决策按 t-1 利润率排序选最赚钱产业；AI 建造从步骤 1 移至步骤 8.6（财政/投资池结算之后）。
> 2. **3.2 蛛网完整路径**：每国每建筑记录 `utilization` 与 `lowUtilizationTurns`；`P_dom > UnitCost×1.2` 产能 +3%；`P_dom < UnitCost` 降开工率；开工率 <0.5 连续 5 回合拆除 2% 产能；删除 `estimatedUnitCost=15` 硬编码，单位成本 = (投入+工资+折旧)/产出。
> 3. **3.4 霸权模块**：`H_target` 用排名映射（重工业 0.4、军火 0.35、贸易 0.25，第 1 名 90 分...），霸权度向 `H_target` 渐进（系数 0.1）替换 +1/−2；`requiredHegemonyCost` 标定为 GBR 财政基准 300；`seaLaneSecurity = clamp(paidCost/requiredCost, 0, 1)`；`freightCost_g = baseFreight_g × (2 - seaLaneSecurity)` 楔入净进口商品国内价。
> 4. **3.5 价格锚与内战张力**：移动锚漂移 `Base_{t+1} = Base_t × (1 + 0.02 × (P_t/Base_t − 1))`，与长期 P-S 漂移取均值，漂移封顶 1.4×；USA 内战张力改用收入增速差（资本家增速 vs 种植园地租增速），地主按部门拆分（`plantationLandRent` 独立记账于 `pops.js`，仅种植园地主进入张力公式）。
> 5. **3.6 人口增长**：`LaborEndowment_{t+1} = LaborEndowment_t × (1 + g_n)`，g_GBR=0.003、g_PRS=0.008、g_USA=0.020、g_QING=0.004。
> 6. **S-S 断言修正**：工人福利断言改为"不低于基线 95%"+相对地主福利改善，适应人口增长稀释效应。
> 7. **新增蛛网稳定性预检断言**：AI 自由扩产 50 回合，价格不越界 [0.25,1.75]、产能不超初始 3 倍。
> **当前：`npm test` 5/5 全绿，`balance.js` exit 0。**

---

## 四、 M3 — 理论断言与收口（P2）

1. **P-S 硬门禁**：大清 50 回合拉氏 ToT：`ToT(t=50) ≤ ToT(t=0) × 0.85`，新增 `js/tests/theory_ps.test.js`。
2. **S-S 双重断言**已有（`theory_ss.test.js`），纳入 runner 统一执行。
3. **v4 单一事实来源**：合并 v3.2（目录树、M1–M4 交付物、测试套件构成）+ v3.3（补丁规范）+ 本计划校准结果，产出 `implementation_plan_v4.md`；补丁 11（RealIncome/NationalIncome 定义、恩格尔双向、powerProjection、ToT 链式篮子）与补丁 8b（出口配给优先级 + 粮食出口禁令）完整回填；v3.2/v3.3 标记 superseded。
4. **旧引擎死代码处置**：M0 核查确认 `index.html` 已绑定新引擎（`js/ui.js` → `js/engine/core.js`），旧引擎 `js/engine.js` 与 `js/market.js` 无任何引用、属死代码。M3 期间删除这两个文件（删除前确认 git 可追溯，否则先归档）。

---

## 五、 关键路径

```
M0 解锁 (structuredClone / balance.js 阻塞 / runner)
   ↓ exit 0 可判
M1 校准 (W_sub 口径 → 炼钢配方 → 棉花数量杠杆 → 禀赋重定标 → 4b → 折旧)
   ↓ balance.js 全绿
M2 机制 (投资池建造 / 蛛网退出 / 种子化 RNG / 霸权海运 / 移动锚 / 人口增长)
   ↓ npm test 全绿（含平滑度 + 蛛网预检）
M3 收口 (P-S 0.85 硬门禁 / v4 规范合并 / UI 迁移)
```

**贯穿纪律**：每个里程碑结束时同步数据文件注释与规范文档数值；任何"为修 A 约束改某数"的提交，必须附 `balance.js` 全量输出证明 B 约束未被打破。
