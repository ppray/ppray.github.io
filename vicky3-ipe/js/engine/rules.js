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
        lose: (stats, state) => (state.nations.PRS.pops.workers.radicals || 0) > 80
    },
    QING: {
        win: (stats, state) => (stats.QING.manufacturedExportRatio || 0) > 0.40,
        lose: (stats, state) => (stats.QING.termsOfTrade || 100) < 40 || state.nations.QING.treasury < -3000
    },
    USA: {
        win: (stats, state) => stats.USA.gdpRank === 1 && (stats.USA.civilWarTension || 0) < 50,
        lose: (stats, state) => (stats.USA.civilWarTension || 0) > 90
    }
};
