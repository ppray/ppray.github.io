/**
 * 《帝国的账本：核心与边缘》 (Empire's Ledger) v3.4
 * 胜负判定规则表：check 函数从 js/data/countries.js 分离至此
 * 原因：countries.js 必须保持纯数据以通过 structuredClone 深拷贝 (M0-1.1)
 * desc 文案仍保留在 countries.js (纯字符串), 此处只放判定逻辑
 */

export const NATION_RULES = {
    GBR: {
        win: (stats, state) => state.hegemonyScore >= 80 && !state.nations.GBR.everBelow80 && stats.GBR.heavyRank === 1 && state.year >= 1900,
        lose: (stats, state) => state.nations.GBR.treasury < -5000 || state.hegemonyScore < 30
    },
    PRS: {
        win: (stats, state) => (stats.PRS.heavyIndustryVal || 0) > (stats.GBR.heavyIndustryVal || 99999),
        // v3.5: 财政悬崖对所有国家生效——国库 < -4000 即破产（与工人激进的失序路径并列）
        lose: (stats, state) => (state.nations.PRS.pops.workers.radicals || 0) > 80 || state.nations.PRS.treasury < -4000
    },
    QING: {
        win: (stats, state) => (stats.QING.manufacturedExportRatio || 0) > 0.40,
        lose: (stats, state) => (stats.QING.termsOfTrade || 100) < 40 || state.nations.QING.treasury < -3000
    },
    USA: {
        // v3.5: 胜利条件从 "GDP 第一"（不可达，追不上 GBR 被动扩张）改为 "GDP 增速显著超英"。
        // 美国后发高增长史实 + 1870 时间门避免开局抖动误判；内战张力<50 保留为风险约束。
        // 要求 USA 增速至少 1.5% 且高出 GBR 1 个百分点——被动挂机 GBR 停滞时也需玩家主动工业化。
        win: (stats, state) => state.year >= 1870
            && (stats.USA.gdpGrowth || 0) >= 0.015
            && (stats.USA.gdpGrowth || 0) >= (stats.GBR.gdpGrowth || 0) + 0.01
            && (stats.USA.civilWarTension || 0) < 50,
        // v3.5: 财政悬崖同样适用于新兴国——国库 < -4000 即破产
        lose: (stats, state) => (stats.USA.civilWarTension || 0) > 90 || state.nations.USA.treasury < -4000
    }
};
