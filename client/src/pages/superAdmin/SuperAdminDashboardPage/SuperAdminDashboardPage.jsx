import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectUser } from '../../../store/slices/authSlice';
import api from '../../../config/api';
import {
    HiOutlineOfficeBuilding,
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineCurrencyDollar,
    HiOutlinePlus,
    HiOutlineEye,
} from 'react-icons/hi';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';
import {
    fetchSubscriptionAnalytics,
    selectSubscriptionAnalytics,
} from '../../../store/slices/subscriptionSlice';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminDashboardPage.css';

const AdminStatCard = ({ icon: Icon, variant, value, label }) => (
    <div className="admin-stat-card">
        <div className={`admin-stat-icon ${variant}`}>
            <Icon size={24} />
        </div>
        <div className="admin-stat-info">
            <h3>{value}</h3>
            <p>{label}</p>
        </div>
    </div>
);

const SuperAdminDashboardPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const { t, i18n } = useTranslation(['superAdminDashboard']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';
    const subscriptionAnalytics = useSelector(selectSubscriptionAnalytics);
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ schools: 0, users: 0, students: 0 });

    useEffect(() => {
        fetchSchools();
        dispatch(fetchSubscriptionAnalytics('year'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchSchools = async () => {
        try {
            const response = await api.get('/schools');
            const data = response.data.data;
            setSchools(data.schools);
            setStats({
                schools: data.pagination.total,
                users: data.schools.reduce((sum, s) => sum + (s.userCount || 0), 0),
                students: data.schools.reduce((sum, s) => sum + (s.studentCount || 0), 0),
            });
        } catch (error) {
            console.error('Error fetching schools:', error);
        } finally {
            setLoading(false);
        }
    };

    const todayLabel = new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());

    const formatCurrency = (amount = 0, currency = 'USD') =>
        new Intl.NumberFormat(locale, {
            style: 'currency',
            currency
        }).format(amount);

    const formatPlanLabel = (plan = '') =>
        String(plan || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase())
            .trim();

    const getPlanLabel = (plan = '') => {
        const normalized = String(plan || '').toLowerCase();
        return t(`superAdminDashboard:plan.${normalized}`, { defaultValue: formatPlanLabel(normalized) });
    };

    const getStatusLabel = (status = '') => {
        const normalized = String(status || '').toLowerCase();
        return t(`superAdminDashboard:status.${normalized}`, { defaultValue: normalized });
    };

    const studentsBySchoolData = (schools || [])
        .filter((s) => typeof s.studentCount === 'number' && s.studentCount > 0)
        .map((s) => ({
            name: s.name || t('superAdminDashboard:common.school'),
            students: s.studentCount,
        }));

    const analyticsData = subscriptionAnalytics?.analytics || [];
    const planDistribution = subscriptionAnalytics?.planDistribution || [];
    const mrrValue = subscriptionAnalytics?.mrr || 0;
    const totalCollected = subscriptionAnalytics?.totalCollected || 0;

    const revenueTrendData = analyticsData.map((item) => {
        const year = item._id?.year;
        const month = item._id?.month;
        const label =
            year && month
                ? new Date(year, month - 1, 1).toLocaleDateString(locale, {
                      month: 'short',
                      year: '2-digit',
                  })
                : '';
        return {
            label: label || t('superAdminDashboard:common.period'),
            revenue: item.revenue || 0,
            newSubscriptions: item.newSubscriptions || 0,
        };
    });

    const planDistributionData = planDistribution.map((p) => ({
        name: getPlanLabel(p._id || 'starter'),
        count: p.count || 0,
    }));

    const planColors = ['#4f46e5', '#22c55e', '#f97316'];

    return (
        <div className="admin-dashboard">
            <header className="admin-dashboard-header">
                <div>
                    <h1>{t('superAdminDashboard:header.title')}</h1>
                    <p className="admin-dashboard-subtitle">{t('superAdminDashboard:header.subtitle')}</p>
                </div>
                <p className="admin-dashboard-date">{todayLabel}</p>
            </header>

            {/* Stats */}
            <section className="admin-stats">
                <AdminStatCard
                    icon={HiOutlineOfficeBuilding}
                    variant="schools"
                    value={stats.schools}
                    label={t('superAdminDashboard:stats.totalSchools')}
                />
                <AdminStatCard
                    icon={HiOutlineUserGroup}
                    variant="users"
                    value={stats.users}
                    label={t('superAdminDashboard:stats.totalUsers')}
                />
                <AdminStatCard
                    icon={HiOutlineAcademicCap}
                    variant="students"
                    value={stats.students}
                    label={t('superAdminDashboard:stats.totalStudents')}
                />
                <AdminStatCard
                    icon={HiOutlineCurrencyDollar}
                    variant="revenue"
                    value={formatCurrency(mrrValue)}
                    label={t('superAdminDashboard:stats.monthlyRecurringRevenue')}
                />
            </section>

            {/* Quick Actions */}
            <section className="admin-section admin-quick-actions">
                <div className="admin-section-header">
                    <h2>{t('superAdminDashboard:quickActions.title')}</h2>
                </div>
                <div className="admin-actions">
                    <button
                        className="admin-action-btn primary"
                        onClick={() => navigate('/admin/schools/new')}
                    >
                        <HiOutlinePlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {t('superAdminDashboard:quickActions.addSchool')}
                    </button>
                    <button
                        className="admin-action-btn"
                        onClick={() => navigate('/admin/schools')}
                    >
                        {t('superAdminDashboard:quickActions.viewAllSchools')}
                    </button>
                </div>
            </section>

            {/* SaaS Analytics */}
            <section className="admin-analytics-grid">
                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2>{t('superAdminDashboard:analytics.revenueGrowthTitle')}</h2>
                            <p className="admin-section-subtitle">
                                {t('superAdminDashboard:analytics.revenueGrowthSubtitle')}
                            </p>
                        </div>
                        <div className="admin-chart-container">
                            {revenueTrendData.length === 0 ? (
                                <p className="admin-empty-text">{t('superAdminDashboard:analytics.notEnoughData')}</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart
                                        data={revenueTrendData}
                                        margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="label" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Bar
                                            dataKey="revenue"
                                            name={t('superAdminDashboard:charts.revenue')}
                                            fill="var(--primary, #4f46e5)"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                            <div className="admin-metrics-row">
                                <div className="admin-metric-pill">
                                    <span className="admin-metric-label">{t('superAdminDashboard:analytics.currentMrr')}</span>
                                    <span className="admin-metric-value">
                                        {formatCurrency(mrrValue)}
                                    </span>
                                </div>
                                <div className="admin-metric-pill">
                                    <span className="admin-metric-label">{t('superAdminDashboard:analytics.totalCollected')}</span>
                                    <span className="admin-metric-value">
                                        {formatCurrency(totalCollected)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2>{t('superAdminDashboard:analytics.plansTitle')}</h2>
                            <p className="admin-section-subtitle">
                                {t('superAdminDashboard:analytics.plansSubtitle')}
                            </p>
                        </div>
                        <div className="admin-chart-container">
                            {planDistributionData.length === 0 ? (
                                <p className="admin-empty-text">{t('superAdminDashboard:analytics.noSubscriptions')}</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie
                                            data={planDistributionData}
                                            dataKey="count"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={80}
                                            label
                                        >
                                            {planDistributionData.map((entry, index) => (
                                                <Cell
                                                    // eslint-disable-next-line react/no-array-index-key
                                                    key={`cell-${index}`}
                                                    fill={planColors[index % planColors.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Legend />
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </section>

            {/* School Insights */}
            {!!studentsBySchoolData.length && (
                <section className="admin-section">
                    <div className="admin-section-header">
                        <h2>{t('superAdminDashboard:analytics.studentDistribution')}</h2>
                    </div>
                    <div className="admin-chart-container">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart
                                data={studentsBySchoolData}
                                margin={{ top: 8, right: 16, left: 0, bottom: 32 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11 }}
                                    interval={0}
                                    angle={-30}
                                    textAnchor="end"
                                />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="students" fill="var(--primary, #4f46e5)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* Schools Table */}
            <section className="admin-section">
                <div className="admin-section-header">
                    <h2>{t('superAdminDashboard:schools.title')}</h2>
                </div>

                {loading ? (
                    <div className="admin-empty">
                        <div className="spinner" />
                    </div>
                ) : schools.length === 0 ? (
                    <div className="admin-empty">
                        <p>{t('superAdminDashboard:schools.empty')}</p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>{t('superAdminDashboard:schools.table.school')}</th>
                                    <th>{t('superAdminDashboard:schools.table.admin')}</th>
                                    <th>{t('superAdminDashboard:schools.table.users')}</th>
                                    <th>{t('superAdminDashboard:schools.table.students')}</th>
                                    <th>{t('superAdminDashboard:schools.table.plan')}</th>
                                    <th>{t('superAdminDashboard:schools.table.status')}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {schools.map((school) => (
                                    <tr key={school._id}>
                                        <td style={{ fontWeight: 500 }}>{school.name}</td>
                                        <td>{school.contact?.adminEmail}</td>
                                        <td>{school.userCount || 0}</td>
                                        <td>{school.studentCount || 0}</td>
                                        <td style={{ textTransform: 'capitalize' }}>
                                            {getPlanLabel(school.subscription?.plan || 'starter')}
                                        </td>
                                        <td>
                                            <span
                                                className={`status-badge ${
                                                    school.subscription?.status || 'active'
                                                }`}
                                            >
                                                {getStatusLabel(school.subscription?.status || 'active')}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className="admin-action-btn"
                                                onClick={() => navigate(`/admin/schools/${school._id}`)}
                                            >
                                                <HiOutlineEye size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default SuperAdminDashboardPage;
