/**
 * FINRA Margin Statistics Dashboard - Main Application
 * 
 * Initializes ECharts instances and renders interactive visualizations
 * for margin debt, credit balances, and net credit balance trends.
 */

(function () {
    'use strict';

    // ==================== Utility Functions ====================

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Shared tooltip chrome: rounded, blurred, elevated
    const TOOLTIP_EXTRA_CSS = 'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:12px 14px;';

    function formatMoney(val) {
        const absVal = Math.abs(val);
        if (absVal >= 1e6) return (val < 0 ? '-' : '') + '$' + (absVal / 1e6).toFixed(2) + 'T';
        if (absVal >= 1e3) return (val < 0 ? '-' : '') + '$' + (absVal / 1e3).toFixed(1) + 'B';
        return (val < 0 ? '-' : '') + '$' + absVal.toFixed(0) + 'M';
    }

    function formatMoneyFull(val) {
        const absVal = Math.abs(val);
        const sign = val < 0 ? '-' : '';
        return sign + '$' + absVal.toLocaleString('en-US') + 'M';
    }

    function pctChange(current, previous) {
        if (!previous || previous === 0) return null;
        return ((current - previous) / Math.abs(previous)) * 100;
    }

    // Ease-out count-up for KPI values; honors reduced-motion
    function animateValue(el, target, formatter, duration) {
        duration = duration || 800;
        if (prefersReducedMotion) {
            el.textContent = formatter(target);
            return;
        }
        const start = performance.now();
        function tick(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = formatter(target * eased);
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function getChartColors() {
        return {
            marginDebt: '#ef4444',
            freeCreditCash: '#22c55e',
            creditMargin: '#3b82f6',
            netCredit: '#a78bfa',
            netCreditPositive: '#22c55e',
            netCreditNegative: '#ef4444',
            sp500: '#f59e0b',
            sp500Soft: 'rgba(245, 158, 11, 0.15)',
            grid: 'rgba(255,255,255,0.04)',
            axisLabel: '#64748b',
            axisLine: 'rgba(255,255,255,0.08)',
            tooltipBg: 'rgba(17, 24, 39, 0.95)',
            zeroLine: 'rgba(255,255,255,0.15)',
        };
    }

    // ==================== Data Processing ====================

    const data = FINRA_MARGIN_DATA;
    const dates = data.map(d => d.date);
    const marginDebts = data.map(d => d.marginDebt);
    const freeCreditCashs = data.map(d => d.freeCreditCash);
    const creditMargins = data.map(d => d.creditMargin);
    const netCredits = data.map(d => d.netCredit);
    const sp500s = data.map(d => d.sp500);

    // Compute YoY change (find data point ~12 months ago)
    const yoyData = data.map((d, i) => {
        const targetDate = new Date(d.date + '-01');
        targetDate.setFullYear(targetDate.getFullYear() - 1);
        const targetStr = targetDate.toISOString().slice(0, 7);

        // Find the closest earlier data point
        let prev = null;
        for (let j = i - 1; j >= 0; j--) {
            if (data[j].date <= targetStr) {
                prev = data[j];
                break;
            }
        }
        if (prev) {
            return pctChange(d.marginDebt, prev.marginDebt);
        }
        return null;
    });

    // ==================== KPI Cards ====================

    function updateKPIs() {
        const latest = data[data.length - 1];
        const prev = data[data.length - 2];

        // Margin Debt
        animateValue(document.getElementById('kpiMarginDebtValue'), latest.marginDebt, formatMoney);
        const mdChange = pctChange(latest.marginDebt, prev.marginDebt);
        const mdEl = document.getElementById('kpiMarginDebtChange');
        mdEl.textContent = `${mdChange > 0 ? '▲' : '▼'} ${Math.abs(mdChange).toFixed(1)}% vs 上期`;
        mdEl.className = 'kpi-change ' + (mdChange > 0 ? 'negative' : 'positive');

        // Free Credit Cash
        animateValue(document.getElementById('kpiFreeCreditCashValue'), latest.freeCreditCash, formatMoney);
        const fccChange = pctChange(latest.freeCreditCash, prev.freeCreditCash);
        const fccEl = document.getElementById('kpiFreeCreditCashChange');
        fccEl.textContent = `${fccChange > 0 ? '▲' : '▼'} ${Math.abs(fccChange).toFixed(1)}% vs 上期`;
        fccEl.className = 'kpi-change ' + (fccChange > 0 ? 'positive' : 'negative');

        // Credit Margin
        animateValue(document.getElementById('kpiCreditMarginValue'), latest.creditMargin, formatMoney);
        const cmChange = pctChange(latest.creditMargin, prev.creditMargin);
        const cmEl = document.getElementById('kpiCreditMarginChange');
        cmEl.textContent = `${cmChange > 0 ? '▲' : '▼'} ${Math.abs(cmChange).toFixed(1)}% vs 上期`;
        cmEl.className = 'kpi-change ' + (cmChange > 0 ? 'positive' : 'negative');

        // Net Credit
        animateValue(document.getElementById('kpiNetCreditValue'), latest.netCredit, formatMoney);
        const ncChange = pctChange(latest.netCredit, prev.netCredit);
        const ncEl = document.getElementById('kpiNetCreditChange');
        if (ncChange !== null) {
            // For net credit, more negative is worse
            const isImproving = latest.netCredit > prev.netCredit;
            ncEl.textContent = `${isImproving ? '▲' : '▼'} ${formatMoneyFull(Math.abs(latest.netCredit - prev.netCredit))} vs 上期`;
            ncEl.className = 'kpi-change ' + (isImproving ? 'positive' : 'negative');
        }

        // Last update
        document.getElementById('lastUpdate').textContent = `最新数据：${latest.date}`;
    }

    // ==================== Main Chart (Net Credit + Margin Debt) ====================

    function buildMainChartOption(startIdx) {
        const c = getChartColors();

        const slicedDates = dates.slice(startIdx);
        const slicedNetCredits = netCredits.slice(startIdx);
        const slicedMarginDebts = marginDebts.slice(startIdx);

        // Net credit bars: green (positive) or red (negative)
        const positiveGrad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(34, 197, 94, 0.8)' },
            { offset: 1, color: 'rgba(34, 197, 94, 0.15)' }
        ]);
        const negativeGrad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.15)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.8)' }
        ]);

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: c.tooltipBg,
                borderColor: 'rgba(99, 102, 241, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f1f5f9', fontFamily: 'Inter', fontSize: 13 },
                extraCssText: TOOLTIP_EXTRA_CSS,
                axisPointer: {
                    type: 'shadow',
                    shadowStyle: { color: 'rgba(148, 163, 184, 0.05)' },
                },
                formatter: function (params) {
                    let html = `<div style="font-weight:600;margin-bottom:6px;color:#94a3b8">${params[0].axisValue}</div>`;
                    params.forEach(p => {
                        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color && p.color.colorStops ? (p.data >= 0 ? '#22c55e' : '#ef4444') : p.color};margin-right:6px"></span>`;
                        html += `<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.8">
                            <span>${dot}${p.seriesName}</span>
                            <span style="font-weight:600;font-variant-numeric:tabular-nums">${formatMoneyFull(p.data)}</span>
                        </div>`;
                    });
                    return html;
                }
            },
            legend: {
                data: ['净信用余额 (Net Credit)', '融资债务 (Margin Debt)'],
                top: 0,
                left: 'center',
                textStyle: { color: c.axisLabel, fontFamily: 'Inter', fontSize: 12 },
                icon: 'roundRect',
                itemWidth: 14,
                itemHeight: 10,
            },
            grid: {
                left: 80,
                right: 80,
                top: 40,
                bottom: 50,
            },
            xAxis: {
                type: 'category',
                data: slicedDates,
                axisLine: { lineStyle: { color: c.axisLine } },
                axisTick: { show: false },
                axisLabel: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
            },
            yAxis: [
                {
                    type: 'value',
                    name: '净信用余额 (M$)',
                    nameTextStyle: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter', padding: [0, 0, 0, -20] },
                    position: 'left',
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: c.axisLabel, fontSize: 11, fontFamily: 'Inter',
                        formatter: v => formatMoney(v)
                    },
                    splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
                },
                {
                    type: 'value',
                    name: '融资债务 (M$)',
                    nameTextStyle: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter', padding: [0, -20, 0, 0] },
                    position: 'right',
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: c.axisLabel, fontSize: 11, fontFamily: 'Inter',
                        formatter: v => formatMoney(v)
                    },
                    splitLine: { show: false },
                }
            ],
            series: [
                {
                    name: '净信用余额 (Net Credit)',
                    type: 'bar',
                    yAxisIndex: 0,
                    data: slicedNetCredits,
                    barMaxWidth: 12,
                    itemStyle: {
                        borderRadius: [2, 2, 0, 0],
                        color: function (params) {
                            return params.data >= 0 ? positiveGrad : negativeGrad;
                        },
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { color: c.zeroLine, width: 1, type: 'solid' },
                        data: [{ yAxis: 0 }],
                        label: { show: false },
                    }
                },
                {
                    name: '融资债务 (Margin Debt)',
                    type: 'line',
                    yAxisIndex: 1,
                    data: slicedMarginDebts,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: c.marginDebt },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(239, 68, 68, 0.15)' },
                            { offset: 1, color: 'rgba(239, 68, 68, 0.0)' }
                        ])
                    },
                    itemStyle: { color: c.marginDebt },
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    start: 0,
                    end: 100,
                }
            ],
            animationDuration: 1200,
            animationEasing: 'cubicOut',
            animationDurationUpdate: 500,
            animationEasingUpdate: 'cubicOut',
        };
    }

    function initMainChart(startIdx) {
        const container = document.getElementById('mainChart');
        const chart = echarts.init(container, null, { renderer: 'canvas' });
        chart.setOption(buildMainChartOption(startIdx));
        return chart;
    }

    // ==================== Breakdown Chart ====================

    function initBreakdownChart() {
        const c = getChartColors();
        const container = document.getElementById('breakdownChart');
        const chart = echarts.init(container, null, { renderer: 'canvas' });

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: c.tooltipBg,
                borderColor: 'rgba(99, 102, 241, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f1f5f9', fontFamily: 'Inter', fontSize: 13 },
                extraCssText: TOOLTIP_EXTRA_CSS,
                axisPointer: {
                    type: 'line',
                    lineStyle: { color: 'rgba(148, 163, 184, 0.3)', width: 1, type: 'dashed' },
                },
                formatter: function (params) {
                    let html = `<div style="font-weight:600;margin-bottom:6px;color:#94a3b8">${params[0].axisValue}</div>`;
                    params.forEach(p => {
                        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px"></span>`;
                        html += `<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.8">
                            <span>${dot}${p.seriesName}</span>
                            <span style="font-weight:600;font-variant-numeric:tabular-nums">${formatMoneyFull(p.data)}</span>
                        </div>`;
                    });
                    return html;
                }
            },
            legend: {
                data: ['融资债务', '现金账户自由余额', '保证金账户信用余额'],
                top: 0,
                textStyle: { color: c.axisLabel, fontFamily: 'Inter', fontSize: 12 },
                icon: 'roundRect',
                itemWidth: 14,
                itemHeight: 10,
            },
            grid: {
                left: 80,
                right: 30,
                top: 40,
                bottom: 50,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: c.axisLine } },
                axisTick: { show: false },
                axisLabel: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
            },
            yAxis: {
                type: 'value',
                name: '百万美元 (M$)',
                nameTextStyle: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: c.axisLabel, fontSize: 11, fontFamily: 'Inter',
                    formatter: v => formatMoney(v)
                },
                splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
            },
            series: [
                {
                    name: '融资债务',
                    type: 'line',
                    data: marginDebts,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: c.marginDebt },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(239, 68, 68, 0.12)' },
                            { offset: 1, color: 'rgba(239, 68, 68, 0)' }
                        ])
                    },
                    itemStyle: { color: c.marginDebt },
                },
                {
                    name: '现金账户自由余额',
                    type: 'line',
                    data: freeCreditCashs,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: c.freeCreditCash },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(34, 197, 94, 0.12)' },
                            { offset: 1, color: 'rgba(34, 197, 94, 0)' }
                        ])
                    },
                    itemStyle: { color: c.freeCreditCash },
                },
                {
                    name: '保证金账户信用余额',
                    type: 'line',
                    data: creditMargins,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: c.creditMargin },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(59, 130, 246, 0.12)' },
                            { offset: 1, color: 'rgba(59, 130, 246, 0)' }
                        ])
                    },
                    itemStyle: { color: c.creditMargin },
                },
            ],
            dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
            animationDuration: 1200,
            animationEasing: 'cubicOut',
        };

        chart.setOption(option);
        return chart;
    }

    // ==================== Comparison Chart (Net Credit vs S&P 500) ====================

    function initComparisonChart() {
        const c = getChartColors();
        const container = document.getElementById('comparisonChart');
        const chart = echarts.init(container, null, { renderer: 'canvas' });

        // Market event annotations
        const marketEvents = [
            { date: '2000-03', label: '互联网泡沫顶部', position: 'top' },
            { date: '2002-09', label: '泡沫破裂底部', position: 'bottom' },
            { date: '2007-07', label: '金融危机前杠杆峰值', position: 'top' },
            { date: '2009-02', label: '金融危机底部', position: 'bottom' },
            { date: '2020-03', label: 'COVID 崩盘', position: 'bottom' },
            { date: '2021-10', label: '杠杆历史峰值', position: 'top' },
        ];

        const markPoints = marketEvents.map(evt => {
            const idx = dates.indexOf(evt.date);
            if (idx === -1) return null;
            return {
                name: evt.label,
                coord: [evt.date, netCredits[idx]],
                symbol: 'pin',
                symbolSize: 40,
                label: {
                    show: true,
                    formatter: evt.label,
                    fontSize: 10,
                    fontFamily: 'Inter',
                    color: '#e2e8f0',
                    position: evt.position === 'top' ? 'top' : 'bottom',
                    distance: 12,
                    backgroundColor: 'rgba(17, 24, 39, 0.85)',
                    padding: [4, 8],
                    borderRadius: 4,
                },
                itemStyle: {
                    color: evt.position === 'top' ? c.netCreditNegative : c.netCreditPositive,
                }
            };
        }).filter(Boolean);

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: c.tooltipBg,
                borderColor: 'rgba(139, 92, 246, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f1f5f9', fontFamily: 'Inter', fontSize: 13 },
                extraCssText: TOOLTIP_EXTRA_CSS,
                axisPointer: {
                    type: 'shadow',
                    shadowStyle: { color: 'rgba(148, 163, 184, 0.05)' },
                },
                formatter: function (params) {
                    let html = `<div style="font-weight:600;margin-bottom:8px;color:#94a3b8;font-size:13px">${params[0].axisValue}</div>`;
                    params.forEach(p => {
                        const isNetCredit = p.seriesName.includes('净信用');
                        const colorDot = isNetCredit
                            ? (p.data >= 0 ? '#22c55e' : '#ef4444')
                            : '#f59e0b';
                        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorDot};margin-right:6px"></span>`;
                        const formatted = isNetCredit
                            ? formatMoneyFull(p.data)
                            : p.data.toLocaleString('en-US');
                        html += `<div style="display:flex;justify-content:space-between;gap:32px;line-height:2">
                            <span>${dot}${p.seriesName}</span>
                            <span style="font-weight:700;font-variant-numeric:tabular-nums;color:${colorDot}">${formatted}</span>
                        </div>`;
                    });
                    // Add net credit interpretation
                    const ncParam = params.find(p => p.seriesName.includes('净信用'));
                    if (ncParam) {
                        const interpretation = ncParam.data >= 0
                            ? '🟢 现金充裕（低杠杆）'
                            : '🔴 杠杆超过现金';
                        html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#94a3b8">${interpretation}</div>`;
                    }
                    return html;
                }
            },
            legend: {
                data: ['净信用余额 (Net Credit)', 'S&P 500'],
                top: 0,
                left: 'center',
                textStyle: { color: c.axisLabel, fontFamily: 'Inter', fontSize: 12 },
                icon: 'roundRect',
                itemWidth: 14,
                itemHeight: 10,
            },
            grid: {
                left: 85,
                right: 80,
                top: 50,
                bottom: 60,
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: c.axisLine } },
                axisTick: { show: false },
                axisLabel: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
            },
            yAxis: [
                {
                    type: 'value',
                    name: '净信用余额 (M$)',
                    nameTextStyle: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter', padding: [0, 0, 0, -20] },
                    position: 'left',
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: c.axisLabel, fontSize: 11, fontFamily: 'Inter',
                        formatter: v => formatMoney(v)
                    },
                    splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
                },
                {
                    type: 'value',
                    name: 'S&P 500',
                    nameTextStyle: { color: c.sp500, fontSize: 11, fontFamily: 'Inter', fontWeight: 600, padding: [0, -20, 0, 0] },
                    position: 'right',
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: c.sp500, fontSize: 11, fontFamily: 'Inter',
                        formatter: v => v.toLocaleString('en-US')
                    },
                    splitLine: { show: false },
                }
            ],
            series: [
                {
                    name: '净信用余额 (Net Credit)',
                    type: 'bar',
                    yAxisIndex: 0,
                    data: netCredits,
                    barMaxWidth: 12,
                    itemStyle: {
                        borderRadius: [2, 2, 0, 0],
                        color: function (params) {
                            if (params.data >= 0) {
                                return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(34, 197, 94, 0.8)' },
                                    { offset: 1, color: 'rgba(34, 197, 94, 0.15)' }
                                ]);
                            } else {
                                return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: 'rgba(239, 68, 68, 0.15)' },
                                    { offset: 1, color: 'rgba(239, 68, 68, 0.8)' }
                                ]);
                            }
                        }
                    },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        lineStyle: { color: 'rgba(255,255,255,0.2)', width: 1.5, type: 'solid' },
                        data: [{ yAxis: 0 }],
                        label: {
                            show: true,
                            position: 'end',
                            formatter: '零线',
                            color: '#94a3b8',
                            fontSize: 10,
                            fontFamily: 'Inter',
                        },
                    },
                    markPoint: {
                        data: markPoints,
                        animation: true,
                    },
                },
                {
                    name: 'S&P 500',
                    type: 'line',
                    yAxisIndex: 1,
                    data: sp500s,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5, color: c.sp500 },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(245, 158, 11, 0.12)' },
                            { offset: 1, color: 'rgba(245, 158, 11, 0.0)' }
                        ])
                    },
                    itemStyle: { color: c.sp500 },
                },
            ],
            dataZoom: [
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    bottom: 10,
                    height: 28,
                    borderColor: 'rgba(255,255,255,0.06)',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    fillerColor: 'rgba(99, 102, 241, 0.15)',
                    handleStyle: { color: c.netCredit, borderColor: c.netCredit },
                    textStyle: { color: c.axisLabel, fontSize: 10, fontFamily: 'Inter' },
                    dataBackground: {
                        lineStyle: { color: 'rgba(167, 139, 250, 0.3)' },
                        areaStyle: { color: 'rgba(167, 139, 250, 0.08)' },
                    },
                },
                { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
            ],
            animationDuration: 1500,
            animationEasing: 'cubicOut',
        };

        chart.setOption(option);
        return chart;
    }

    // ==================== YoY Chart ====================

    function initYoYChart() {
        const c = getChartColors();
        const container = document.getElementById('yoyChart');
        const chart = echarts.init(container, null, { renderer: 'canvas' });

        const validYoY = yoyData.map((v, i) => v !== null ? { date: dates[i], value: Math.round(v * 10) / 10 } : null).filter(Boolean);

        const barColors = validYoY.map(d =>
            d.value >= 0
                ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(239, 68, 68, 0.85)' },
                    { offset: 1, color: 'rgba(239, 68, 68, 0.2)' }
                ])
                : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(34, 197, 94, 0.2)' },
                    { offset: 1, color: 'rgba(34, 197, 94, 0.85)' }
                ])
        );

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: c.tooltipBg,
                borderColor: 'rgba(99, 102, 241, 0.3)',
                borderWidth: 1,
                textStyle: { color: '#f1f5f9', fontFamily: 'Inter', fontSize: 13 },
                extraCssText: TOOLTIP_EXTRA_CSS,
                axisPointer: {
                    type: 'shadow',
                    shadowStyle: { color: 'rgba(148, 163, 184, 0.05)' },
                },
                formatter: function (params) {
                    const p = params[0];
                    const color = p.data >= 0 ? '#ef4444' : '#22c55e';
                    return `<div style="font-weight:600;margin-bottom:4px;color:#94a3b8">${p.axisValue}</div>
                        <div style="color:${color};font-weight:700;font-size:15px">${p.data > 0 ? '+' : ''}${p.data.toFixed(1)}%</div>
                        <div style="font-size:11px;color:#64748b;margin-top:2px">融资债务同比变化</div>`;
                }
            },
            grid: {
                left: 60,
                right: 30,
                top: 20,
                bottom: 50,
            },
            xAxis: {
                type: 'category',
                data: validYoY.map(d => d.date),
                axisLine: { lineStyle: { color: c.axisLine } },
                axisTick: { show: false },
                axisLabel: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
            },
            yAxis: {
                type: 'value',
                name: '%',
                nameTextStyle: { color: c.axisLabel, fontSize: 11, fontFamily: 'Inter' },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: c.axisLabel, fontSize: 11, fontFamily: 'Inter',
                    formatter: v => v.toFixed(0) + '%'
                },
                splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
            },
            series: [{
                type: 'bar',
                data: validYoY.map(d => d.value),
                barMaxWidth: 16,
                itemStyle: {
                    borderRadius: [3, 3, 0, 0],
                    color: function (params) {
                        return barColors[params.dataIndex];
                    }
                },
                markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: c.zeroLine, width: 1, type: 'solid' },
                    data: [{ yAxis: 0 }],
                    label: { show: false },
                }
            }],
            dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
            animationDuration: 1200,
            animationEasing: 'cubicOut',
        };

        chart.setOption(option);
        return chart;
    }

    // ==================== Time Range Filter ====================

    function getStartIndexForRange(range) {
        if (range === 'all') return 0;
        const years = parseInt(range);
        // Anchor to the latest data month (not the system clock) so ranges
        // stay correct even when FINRA data publication lags behind.
        const cutoff = new Date(dates[dates.length - 1] + '-01');
        cutoff.setFullYear(cutoff.getFullYear() - years);
        const cutoffStr = cutoff.toISOString().slice(0, 7);
        for (let i = 0; i < dates.length; i++) {
            if (dates[i] >= cutoffStr) return i;
        }
        return 0;
    }

    // ==================== Init ====================

    let mainChart;
    let comparisonChart;
    let breakdownChart;
    let yoyChart;

    function init() {
        updateKPIs();
        mainChart = initMainChart(0);
        comparisonChart = initComparisonChart();
        breakdownChart = initBreakdownChart();
        yoyChart = initYoYChart();

        // Range buttons: update in place for a smooth animated transition
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.range-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                this.classList.add('active');
                this.setAttribute('aria-pressed', 'true');
                const startIdx = getStartIndexForRange(this.dataset.range);

                if (mainChart) {
                    mainChart.setOption(buildMainChartOption(startIdx));
                }
            });
        });

        // Header elevation on scroll
        const header = document.querySelector('.header');
        const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        // Debounced resize handler
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (mainChart) mainChart.resize();
                if (comparisonChart) comparisonChart.resize();
                if (breakdownChart) breakdownChart.resize();
                if (yoyChart) yoyChart.resize();
            }, 120);
        });
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
