import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
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

    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());

    const studentsBySchoolData = (schools || [])
        .filter((s) => typeof s.studentCount === 'number' && s.studentCount > 0)
        .map((s) => ({
            name: s.name || 'School',
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
                ? new Date(year, month - 1, 1).toLocaleDateString(undefined, {
                      month: 'short',
                      year: '2-digit',
                  })
                : '';
        return {
            label: label || 'Period',
            revenue: item.revenue || 0,
            newSubscriptions: item.newSubscriptions || 0,
        };
    });

    const planDistributionData = planDistribution.map((p) => ({
        name: p._id || 'plan',
        count: p.count || 0,
    }));

    const planColors = ['#4f46e5', '#22c55e', '#f97316'];

    return (
        <div className="admin-dashboard">
            <header className="admin-dashboard-header">
                <div>
                    <h1>Platform Analytics</h1>
                    <p className="admin-dashboard-subtitle">SaaS business metrics and engagement overview</p>
                </div>
                <p className="admin-dashboard-date">{todayLabel}</p>
            </header>

            {/* Stats */}
            <section className="admin-stats">
                <AdminStatCard
                    icon={HiOutlineOfficeBuilding}
                    variant="schools"
                    value={stats.schools}
                    label="Total Schools"
                />
                <AdminStatCard
                    icon={HiOutlineUserGroup}
                    variant="users"
                    value={stats.users}
                    label="Total Users"
                />
                <AdminStatCard
                    icon={HiOutlineAcademicCap}
                    variant="students"
                    value={stats.students}
                    label="Total Students"
                />
                <AdminStatCard
                    icon={HiOutlineCurrencyDollar}
                    variant="revenue"
                    value={`$${mrrValue.toLocaleString()}`}
                    label="Monthly Recurring Revenue"
                />
            </section>

            {/* Quick Actions */}
            <section className="admin-section admin-quick-actions">
                <div className="admin-section-header">
                    <h2>Quick Actions</h2>
                </div>
                <div className="admin-actions">
                    <button
                        className="admin-action-btn primary"
                        onClick={() => navigate('/admin/schools/new')}
                    >
                        <HiOutlinePlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Add School
                    </button>
                    <button
                        className="admin-action-btn"
                        onClick={() => navigate('/admin/schools')}
                    >
                        View all schools
                    </button>
                </div>
            </section>

            {/* SaaS Analytics */}
            <section className="admin-analytics-grid">
                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2>Revenue & Growth</h2>
                            <p className="admin-section-subtitle">
                                New subscriptions and recurring revenue over the last year.
                            </p>
                        </div>
                        <div className="admin-chart-container">
                            {revenueTrendData.length === 0 ? (
                                <p className="admin-empty-text">Not enough data yet.</p>
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
                                            name="Revenue"
                                            fill="var(--primary, #4f46e5)"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                            <div className="admin-metrics-row">
                                <div className="admin-metric-pill">
                                    <span className="admin-metric-label">Current MRR</span>
                                    <span className="admin-metric-value">
                                        ${mrrValue.toLocaleString()}
                                    </span>
                                </div>
                                <div className="admin-metric-pill">
                                    <span className="admin-metric-label">Total collected</span>
                                    <span className="admin-metric-value">
                                        ${totalCollected.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2>Plans</h2>
                            <p className="admin-section-subtitle">
                                Distribution of schools across subscription plans.
                            </p>
                        </div>
                        <div className="admin-chart-container">
                            {planDistributionData.length === 0 ? (
                                <p className="admin-empty-text">No subscriptions yet.</p>
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
                        <h2>Student Distribution</h2>
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
                    <h2>Schools</h2>
                </div>

                {loading ? (
                    <div className="admin-empty">
                        <div className="spinner" />
                    </div>
                ) : schools.length === 0 ? (
                    <div className="admin-empty">
                        <p>No schools yet. Create your first school to get started.</p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>School</th>
                                    <th>Admin</th>
                                    <th>Users</th>
                                    <th>Students</th>
                                    <th>Plan</th>
                                    <th>Status</th>
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
                                            {school.subscription?.plan || 'starter'}
                                        </td>
                                        <td>
                                            <span
                                                className={`status-badge ${
                                                    school.subscription?.status || 'active'
                                                }`}
                                            >
                                                {school.subscription?.status || 'active'}
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
