import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Cell
} from 'recharts';

const AttendanceStatusChartCard = ({ statusChartData }) => {
    return (
        <div className="attendance-status-chart-card">
            <div className="attendance-status-chart-header">
                <h3>Attendance Status Chart</h3>
                <p>Present, Absent, Tardy and Excused counts for the selected range</p>
            </div>
            <div className="attendance-status-chart-body">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={statusChartData}
                        margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
                    >
                        <XAxis type="category" dataKey="name" />
                        <YAxis type="number" allowDecimals={false} />
                        <Tooltip formatter={(value, name) => [value, name]} />
                        <Bar dataKey="value" barSize={40} radius={[8, 8, 0, 0]}>
                            {statusChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="attendance-status-legend">
                {statusChartData.map((item) => (
                    <div key={item.name} className="attendance-status-legend-item">
                        <span
                            className="attendance-status-legend-dot"
                            style={{ backgroundColor: item.color }}
                        />
                        <span className="attendance-status-legend-label">{item.name}</span>
                        <span className="attendance-status-legend-value">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AttendanceStatusChartCard;
