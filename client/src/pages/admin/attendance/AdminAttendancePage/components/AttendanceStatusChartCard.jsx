import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Cell
} from 'recharts';
import { useTranslation } from 'react-i18next';

const AttendanceStatusChartCard = ({ statusChartData }) => {
    const { t } = useTranslation(['adminAttendance']);

    return (
        <div className="attendance-status-chart-card">
            <div className="attendance-status-chart-header">
                <h3>{t('adminAttendance:chart.title')}</h3>
                <p>{t('adminAttendance:chart.subtitle')}</p>
            </div>
            <div className="attendance-status-chart-body">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={statusChartData}
                        margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
                    >
                        <XAxis
                            type="category"
                            dataKey="key"
                            tickFormatter={(value) => t(`adminAttendance:chart.status.${value}`)}
                        />
                        <YAxis type="number" allowDecimals={false} />
                        <Tooltip formatter={(value, _, payload) => [value, t(`adminAttendance:chart.status.${payload?.payload?.key || 'present'}`)]} />
                        <Bar dataKey="value" barSize={40} radius={[8, 8, 0, 0]}>
                            {statusChartData.map((entry) => (
                                <Cell key={entry.key} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="attendance-status-legend">
                {statusChartData.map((item) => (
                    <div key={item.key} className="attendance-status-legend-item">
                        <span
                            className="attendance-status-legend-dot"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="attendance-status-legend-label">{t(`adminAttendance:chart.status.${item.key}`)}</span>
                        <span className="attendance-status-legend-value">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AttendanceStatusChartCard;
