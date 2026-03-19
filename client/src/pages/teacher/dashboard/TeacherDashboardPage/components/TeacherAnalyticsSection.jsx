import { LineChart, Line, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTranslation } from 'react-i18next';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const TeacherAnalyticsSection = ({ analyticsData, analyticsError }) => {
    const { t } = useTranslation(['dashboard']);

    if (analyticsError) {
        return (
            <div className="teacher-card analytics-card">
                <div className="card-header">
                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.title')}</h3>
                </div>
                <p className="empty-text">{t('dashboard:teacherDashboard.analytics.loadError')}</p>
            </div>
        );
    }

    const workloadData = (analyticsData?.workloadByWeekday || []).map((item) => ({
        ...item,
        dayLabel: t(`dashboard:teacherDashboard.analytics.weekdays.${WEEKDAY_KEYS[item.day]}`)
    }));

    const classPerformanceData = (analyticsData?.classPerformance || []).map((item) => ({
        ...item,
        shortName: item.className?.length > 18 ? `${item.className.slice(0, 17)}...` : item.className
    }));

    const atRiskStudents = analyticsData?.atRiskStudents || [];
    const summary = analyticsData?.summary || {
        activeClasses: 0,
        atRiskStudents: 0,
        avgClassPerformance: 0
    };

    return (
        <div className="teacher-analytics-section">
            <div className="teacher-card analytics-card">
                <div className="card-header analytics-header">
                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.title')}</h3>
                    <p className="analytics-subtitle">{t('dashboard:teacherDashboard.analytics.subtitle')}</p>
                </div>

                <div className="analytics-summary-grid">
                    <div className="analytics-summary-item">
                        <span className="analytics-summary-value">{summary.activeClasses || 0}</span>
                        <span className="analytics-summary-label">{t('dashboard:teacherDashboard.analytics.summary.activeClasses')}</span>
                    </div>
                    <div className="analytics-summary-item">
                        <span className="analytics-summary-value">{summary.atRiskStudents || 0}</span>
                        <span className="analytics-summary-label">{t('dashboard:teacherDashboard.analytics.summary.atRiskStudents')}</span>
                    </div>
                    <div className="analytics-summary-item">
                        <span className="analytics-summary-value">{Math.round(summary.avgClassPerformance || 0)}%</span>
                        <span className="analytics-summary-label">{t('dashboard:teacherDashboard.analytics.summary.avgClassPerformance')}</span>
                    </div>
                </div>
            </div>

            <div className="teacher-card analytics-card">
                <div className="card-header">
                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.workloadByWeekday')}</h3>
                </div>
                {workloadData.length === 0 ? (
                    <p className="empty-text">{t('dashboard:teacherDashboard.analytics.noData')}</p>
                ) : (
                    <div className="analytics-chart-wrap">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={workloadData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="dayLabel" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="count" fill="var(--primary-400)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="teacher-card analytics-card">
                <div className="card-header">
                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.classPerformance')}</h3>
                </div>
                {classPerformanceData.length === 0 ? (
                    <p className="empty-text">{t('dashboard:teacherDashboard.analytics.noData')}</p>
                ) : (
                    <div className="analytics-chart-wrap">
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={classPerformanceData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="shortName" interval={0} angle={-20} textAnchor="end" height={60} />
                                <YAxis domain={[0, 100]} />
                                <Tooltip formatter={(value) => [`${Math.round(value)}%`, t('dashboard:teacherDashboard.analytics.averageScore')]} />
                                <Line type="monotone" dataKey="avgPercentage" stroke="var(--primary-400)" strokeWidth={2.5} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div className="teacher-card analytics-card">
                <div className="card-header">
                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.atRiskStudents')}</h3>
                </div>
                {atRiskStudents.length === 0 ? (
                    <p className="empty-text">{t('dashboard:teacherDashboard.analytics.atRiskEmpty')}</p>
                ) : (
                    <ul className="teacher-analytics-risk-list">
                        {atRiskStudents.map((item) => (
                            <li key={item.studentId} className="teacher-analytics-risk-item">
                                <div className="teacher-analytics-risk-meta">
                                    <span className="student-name">{item.studentName}</span>
                                    <span className="class-name">{item.className}</span>
                                </div>
                                <span className="risk-score">{Math.round(item.avgPercentage)}%</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default TeacherAnalyticsSection;
