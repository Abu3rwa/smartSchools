import { useTheme, useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { CHART_STYLES } from '../constants.js';

/**
 * Average grade percentage across the academic year.
 */
export default function PerformanceTrendCard({ data }) {
    const { t } = useTranslation(['adminDashboard']);
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));
    const hasValues = Array.isArray(data) && data.some((point) => point.average !== null);
    const pointsWithValues = Array.isArray(data)
        ? data.filter((point) => point.average !== null).length
        : 0;
    // A lone recorded month has nothing to connect, so it needs a visible point.
    const dot = pointsWithValues <= 2 ? { r: 3, fill: 'var(--primary, #0d9488)' } : false;

    return (
        <section className="admin-panel admin-panel-chart">
            <div className="admin-panel-head">
                <h2 className="admin-panel-title">{t('adminDashboard:performanceTrend.title')}</h2>
                <span className="admin-panel-hint">{t('adminDashboard:performanceTrend.subtitle')}</span>
            </div>

            {hasValues ? (
                <div className="admin-chart-body">
                    <ResponsiveContainer width="100%" height={isSm ? 200 : 232}>
                        <AreaChart
                            data={data}
                            margin={{
                                top: 8,
                                right: isSm ? 8 : 16,
                                left: isSm ? -20 : -8,
                                bottom: 0,
                            }}
                        >
                            <defs>
                                <linearGradient id="adminTrendFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--primary, #0d9488)" stopOpacity={0.22} />
                                    <stop offset="100%" stopColor="var(--primary, #0d9488)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                stroke={CHART_STYLES.grid}
                                strokeDasharray="3 3"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: CHART_STYLES.axis }}
                                minTickGap={8}
                                stroke={CHART_STYLES.axis}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                domain={[0, 100]}
                                ticks={[0, 25, 50, 75, 100]}
                                width={isSm ? 32 : 38}
                                tick={{ fontSize: 11, fill: CHART_STYLES.axis }}
                                stroke={CHART_STYLES.axis}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                cursor={{ stroke: CHART_STYLES.grid }}
                                contentStyle={{
                                    backgroundColor: CHART_STYLES.tooltipBg,
                                    border: `1px solid ${CHART_STYLES.tooltipBorder}`,
                                    borderRadius: 10,
                                    color: CHART_STYLES.tooltipText,
                                    fontSize: '0.8125rem',
                                }}
                                labelStyle={{ color: CHART_STYLES.tooltipText }}
                                formatter={(value) => [
                                    `${Number(value).toFixed(1)}%`,
                                    t('adminDashboard:performanceTrend.average'),
                                ]}
                            />
                            <Area
                                type="monotone"
                                dataKey="average"
                                stroke="var(--primary, #0d9488)"
                                strokeWidth={2}
                                fill="url(#adminTrendFill)"
                                dot={dot}
                                activeDot={{ r: 4 }}
                                connectNulls={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p className="admin-panel-empty">{t('adminDashboard:performanceTrend.empty')}</p>
            )}
        </section>
    );
}
