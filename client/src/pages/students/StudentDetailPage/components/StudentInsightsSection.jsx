import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip
} from 'recharts';
import {
    buildMonthlyTrendData,
    TREND_CATEGORY_OPTIONS,
    toId
} from '../utils/studentDetailPresentation';

const MAX_ASSIGNMENT_ROWS = 10;
const PERFORMANCE_COLORS = {
    excellent: '#16a34a',
    good: '#0ea5e9',
    warning: '#f59e0b',
    risk: '#ef4444',
    neutral: '#64748b'
};

const getPerformanceTone = (value) => {
    if (!Number.isFinite(value)) return 'neutral';
    if (value >= 85) return 'excellent';
    if (value >= 70) return 'good';
    if (value >= 55) return 'warning';
    return 'risk';
};

const getToneColor = (tone) => {
    return PERFORMANCE_COLORS[tone] || PERFORMANCE_COLORS.neutral;
};

const formatDateValue = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return format(parsed, 'MMM d, yyyy');
};

const ScoreCell = ({ scoreLabel, percentage }) => {
    const tone = getPerformanceTone(percentage);
    return (
        <span className={`assignment-score assignment-score-${tone}`}>
        <span>{scoreLabel}</span>
        {Number.isFinite(percentage) && (
            <small>{percentage.toFixed(1)}%</small>
        )}
    </span>
    );
};

const SubjectPerformanceTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    const tone = getPerformanceTone(Number(row?.average));
    const color = getToneColor(tone);

    return (
        <div
            style={{
                background: 'var(--bg-card, #1e1e2f)',
                border: `1px solid ${color}`,
                borderRadius: 8,
                padding: '0.6rem 0.75rem',
                boxShadow: 'var(--shadow-md)'
            }}
        >
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {row?.subject || 'Subject'}
            </div>
            <div style={{ color, fontWeight: 700, fontSize: 14 }}>
                {Number.isFinite(row?.average) ? `${row.average.toFixed(1)}%` : 'N/A'}
            </div>
        </div>
    );
};

const StudentInsightsSection = ({
    loading,
    error,
    overview,
    subjectPerformanceData,
    grades = [],
    academicYear = '',
    academicYearStartMonth = 8,
    assignmentRows
}) => {
    const [trendSubjectFilter, setTrendSubjectFilter] = useState('all');
    const [trendCategoryFilter, setTrendCategoryFilter] = useState('all');

    const chartTooltipStyle = {
        backgroundColor: 'var(--bg-card, #1e1e2f)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
        borderRadius: 8,
        color: 'var(--text-primary, #ffffff)'
    };

    const trendSubjectOptions = useMemo(() => {
        const subjectsMap = new Map();
        grades.forEach((grade) => {
            const subjectId = toId(grade?.subject?._id || grade?.subject);
            if (!subjectId) return;
            const subjectName = grade?.subject?.name || grade?.subject?.code || 'Unknown Subject';
            if (!subjectsMap.has(subjectId)) {
                subjectsMap.set(subjectId, subjectName);
            }
        });

        subjectPerformanceData.forEach((subject) => {
            const subjectId = toId(subject?.subjectId);
            const subjectName = subject?.subject || 'Unknown Subject';
            if (!subjectId) return;
            if (!subjectsMap.has(subjectId)) {
                subjectsMap.set(subjectId, subjectName);
            }
        });

        return Array.from(subjectsMap.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [grades, subjectPerformanceData]);

    const trendCategoryOptions = TREND_CATEGORY_OPTIONS;

    useEffect(() => {
        if (trendSubjectFilter === 'all') return;
        const exists = trendSubjectOptions.some((option) => option.value === trendSubjectFilter);
        if (!exists) {
            setTrendSubjectFilter('all');
        }
    }, [trendSubjectFilter, trendSubjectOptions]);

    useEffect(() => {
        if (trendCategoryFilter === 'all') return;
        const exists = trendCategoryOptions.some((option) => option.value === trendCategoryFilter);
        if (!exists) {
            setTrendCategoryFilter('all');
        }
    }, [trendCategoryFilter, trendCategoryOptions]);

    const filteredMonthlyTrendData = useMemo(() => {
        return buildMonthlyTrendData({
            grades,
            academicYear,
            academicYearStartMonth,
            subjectId: trendSubjectFilter,
            category: trendCategoryFilter
        });
    }, [grades, academicYear, academicYearStartMonth, trendSubjectFilter, trendCategoryFilter]);

    const hasTrendData = useMemo(
        () => filteredMonthlyTrendData.some((row) => Number.isFinite(row.average)),
        [filteredMonthlyTrendData]
    );

    return (
        <section className="student-insights-section">
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Student Performance Overview</h3>
                </div>

                {loading ? (
                    <div className="insights-loading">
                        <div className="spinner" />
                        <p className="mb-0">Loading performance data...</p>
                    </div>
                ) : (
                    <>
                        {error && <p className="error-message mb-md">{error}</p>}

                        <div className="student-overview-metrics">
                            <div className="overview-stat-card">
                                <span className="overview-stat-label">Overall Average</span>
                                <strong className="overview-stat-value">{overview.overallAverageLabel}</strong>
                            </div>
                            <div className="overview-stat-card">
                                <span className="overview-stat-label">Graded Entries</span>
                                <strong className="overview-stat-value">{overview.gradedEntries}</strong>
                            </div>
                            <div className="overview-stat-card">
                                <span className="overview-stat-label">Assignment Completion</span>
                                <strong className="overview-stat-value">{overview.assignmentCompletionLabel}</strong>
                            </div>
                            <div className="overview-stat-card">
                                <span className="overview-stat-label">Best Subject</span>
                                <strong className="overview-stat-value text-truncate">{overview.bestSubject}</strong>
                            </div>
                        </div>

                        <div className="charts-grid">
                            <div className="chart-card">
                                <h4>Subject Performance</h4>
                                {subjectPerformanceData.length ? (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart
                                            data={subjectPerformanceData}
                                            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis
                                                dataKey="subject"
                                                stroke="var(--text-muted)"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                                interval={0}
                                                angle={-20}
                                                textAnchor="end"
                                                height={56}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                stroke="var(--text-muted)"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            />
                                            <Tooltip content={<SubjectPerformanceTooltip />} />
                                            <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                                                {subjectPerformanceData.map((entry, index) => (
                                                    <Cell
                                                        key={`performance-cell-${entry.subject}-${index}`}
                                                        fill={getToneColor(getPerformanceTone(entry.average))}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-muted mb-0">No subject performance data yet.</p>
                                )}
                            </div>

                            <div className="chart-card">
                                <h4>Monthly Trend</h4>
                                <div className="trend-filter-row">
                                    <label className="trend-filter-item">
                                        <span>Subject</span>
                                        <select
                                            value={trendSubjectFilter}
                                            onChange={(event) => setTrendSubjectFilter(event.target.value)}
                                        >
                                            <option value="all">All Subjects</option>
                                            {trendSubjectOptions.map((subject) => (
                                                <option key={subject.value} value={subject.value}>
                                                    {subject.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="trend-filter-item">
                                        <span>Category</span>
                                        <select
                                            value={trendCategoryFilter}
                                            onChange={(event) => setTrendCategoryFilter(event.target.value)}
                                        >
                                            <option value="all">All Categories</option>
                                            {trendCategoryOptions.map((category) => (
                                                <option key={category.value} value={category.value}>
                                                    {category.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                {filteredMonthlyTrendData.length ? (
                                    <ResponsiveContainer width="100%" height={260}>
                                        <LineChart
                                            data={filteredMonthlyTrendData}
                                            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                                            <XAxis
                                                dataKey="month"
                                                stroke="var(--text-muted)"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                stroke="var(--text-muted)"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            />
                                            <Tooltip contentStyle={chartTooltipStyle} />
                                            <Line
                                                type="monotone"
                                                dataKey="average"
                                                stroke="var(--accent-emerald)"
                                                strokeWidth={2.5}
                                                dot={{ r: 4, strokeWidth: 2, fill: 'var(--bg-card)' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-muted mb-0">No monthly trend available yet.</p>
                                )}
                                {!hasTrendData && (
                                    <p className="text-muted mb-0">
                                        No grade data for the selected subject/category in this academic year.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="assignments-card">
                            <div className="assignments-card-header">
                                <h4>Assignments and Grade Entries</h4>
                                <span className="text-muted">
                                    Showing latest {Math.min(assignmentRows.length, MAX_ASSIGNMENT_ROWS)}
                                </span>
                            </div>
                            {assignmentRows.length ? (
                                <div className="assignment-table-wrap">
                                    <table className="assignment-table">
                                        <thead>
                                            <tr>
                                                <th>Title</th>
                                                <th>Subject</th>
                                                <th>Type</th>
                                                <th>Date</th>
                                                <th>Score</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assignmentRows.slice(0, MAX_ASSIGNMENT_ROWS).map((row) => (
                                                <tr key={row.id}>
                                                    <td>{row.title}</td>
                                                    <td>{row.subjectName}</td>
                                                    <td>{row.typeLabel}</td>
                                                    <td>{formatDateValue(row.gradedAt || row.dueDate)}</td>
                                                    <td><ScoreCell scoreLabel={row.scoreLabel} percentage={row.percentage} /></td>
                                                    <td>
                                                        <span className={`status-pill status-pill-${row.statusTone}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-muted mb-0">No assignments or grade entries for this student yet.</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

export default StudentInsightsSection;
