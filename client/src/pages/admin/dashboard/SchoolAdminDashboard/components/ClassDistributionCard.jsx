import { Link } from 'react-router-dom';
import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX, CHART_STYLES } from '../constants.js';
import { truncateClassLabel } from '../utils/schoolAdminDashboardPresentation.js';

/**
 * Class distribution bar chart card. Uses existing CSS: btn-link.
 */
export default function ClassDistributionCard({ data }) {
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    if (!data || data.length === 0) return null;

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
                    Class Distribution
                </Typography>
                <Link to="/portal/classes" className="btn-link">
                    View All <HiOutlineArrowRight size={16} />
                </Link>
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
                    <BarChart
                        data={data}
                        margin={{
                            top: 8,
                            right: isSm ? 8 : 16,
                            left: isSm ? -16 : 0,
                            bottom: isSm ? 8 : 24,
                        }}
                    >
                        <CartesianGrid
                            stroke={CHART_STYLES.grid}
                            strokeDasharray="3 3"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: isSm ? 10 : 11 }}
                            stroke={CHART_STYLES.axis}
                            tickLine={{ stroke: CHART_STYLES.axis }}
                            axisLine={{ stroke: CHART_STYLES.axis }}
                            angle={isSm ? 0 : -30}
                            textAnchor={isSm ? 'middle' : 'end'}
                            height={isSm ? 36 : 60}
                            interval={0}
                            minTickGap={isSm ? 8 : 16}
                            tickFormatter={(value) => truncateClassLabel(value, isSm ? 10 : 18)}
                        />
                        <YAxis
                            allowDecimals={false}
                            width={isSm ? 28 : 36}
                            stroke={CHART_STYLES.axis}
                            tickLine={{ stroke: CHART_STYLES.axis }}
                            axisLine={{ stroke: CHART_STYLES.axis }}
                            tick={{
                                fontSize: isSm ? 10 : 11,
                                fill: CHART_STYLES.axis,
                            }}
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
                        <Bar
                            dataKey="students"
                            fill="var(--primary, #5aaeee)"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </Box>
        </Box>
    );
}
