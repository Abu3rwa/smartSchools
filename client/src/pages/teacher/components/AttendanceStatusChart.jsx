import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

const COLORS = { Present: "#10B981", Absent: "#EF4444", Tardy: "#F59E0B", Excused: "#3B82F6" };

const AttendanceStatusChart = ({ stats }) => {
  const data = [
    { name: "Present", value: stats.totalPresent,  color: COLORS.Present },
    { name: "Absent",  value: stats.totalAbsent,   color: COLORS.Absent  },
    { name: "Tardy",   value: stats.totalLate,     color: COLORS.Tardy   },
    { name: "Excused", value: stats.totalExcused,  color: COLORS.Excused },
  ];

  return (
    <div className="teacher-status-chart-card">
      <div className="teacher-status-chart-header">
        <h3>Attendance Status Chart</h3>
        <p>Present, Absent, Tardy and Excused counts for the selected range</p>
      </div>
      <div className="teacher-status-chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={75} />
            <Tooltip formatter={(value, name) => [value, name]} />
            <Bar dataKey="value" radius={[8, 8, 8, 8]}>
              {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="teacher-status-chart-legend">
        {data.map((item) => (
          <div key={item.name} className="teacher-status-chart-legend-item">
            <span className="teacher-status-chart-legend-dot" style={{ backgroundColor: item.color }} />
            <span className="teacher-status-chart-legend-label">{item.name}</span>
            <span className="teacher-status-chart-legend-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AttendanceStatusChart;
