import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX, CHART_STYLES } from '../constants.js';

/**
 * Performance trend line chart card.
 */
export default function PerformanceTrendCard({ data }) {
    const { t } = useTranslation(['adminDashboard']);
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    return (
        <Box sx={CARD_SX}>
            <Box
                sx={{
                    ...CARD_HEADER_SX,
                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                    gap: { xs: 1, sm: 0 },
                }}
            >
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    {t('adminDashboard:performanceTrend.title')}
                </Typography>
                <Typography
                    sx={{ fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}
                >
                    {t('adminDashboard:performanceTrend.subtitle')}
                </Typography>
            </Box>
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: { xs: 210, sm: 230, md: 260 },
                }}
            >
                <ResponsiveContainer width="100%" height={isSm ? 220 : 260}>
                    <LineChart
                        data={data || []}
                        margin={{
                            top: 8,
                            right: isSm ? 8 : 16,
                            left: isSm ? -16 : 0,
                            bottom: 8,
                        }}
                    >
                        <CartesianGrid
                            stroke={CHART_STYLES.grid}
                            strokeDasharray="3 3"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="month"
                            tick={{
                                fontSize: isSm ? 10 : 11,
                                fill: CHART_STYLES.axis,
                            }}
                            minTickGap={8}
                            stroke={CHART_STYLES.axis}
                            tickLine={{ stroke: CHART_STYLES.axis }}
                            axisLine={{ stroke: CHART_STYLES.axis }}
                        />
                        <YAxis
                            domain={[0, 100]}
                            width={isSm ? 28 : 36}
                            tick={{
                                fontSize: isSm ? 10 : 11,
                                fill: CHART_STYLES.axis,
                            }}
                            stroke={CHART_STYLES.axis}
                            tickLine={{ stroke: CHART_STYLES.axis }}
                            axisLine={{ stroke: CHART_STYLES.axis }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: CHART_STYLES.tooltipBg,
                                border: `1px solid ${CHART_STYLES.tooltipBorder}`,
                                borderRadius: 8,
                                color: CHART_STYLES.tooltipText,
                            }}
                            labelStyle={{ color: CHART_STYLES.tooltipText }}
                        />
                        <Line
                            type="monotone"
                            dataKey="average"
                            stroke="var(--primary, #5aaeee)"
                            strokeWidth={2}
                            dot={{ r: isSm ? 3 : 4 }}
                            name={t('adminDashboard:performanceTrend.average')}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
}
