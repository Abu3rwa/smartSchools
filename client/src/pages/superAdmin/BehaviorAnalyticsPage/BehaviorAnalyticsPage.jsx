import {
    HiOutlineDeviceMobile,
    HiOutlineEye,
    HiOutlineExclamation,
    HiOutlineGlobeAlt,
    HiOutlineShieldCheck,
    HiOutlineUsers
} from 'react-icons/hi';
import AnalyticsHeader from './components/AnalyticsHeader';
import AnalyticsFilters from './components/AnalyticsFilters';
import AnalyticsTabs from './components/AnalyticsTabs';
import LoadingState from './components/LoadingState';
import ErrorState from './components/ErrorState';
import useBehaviorAnalyticsPage from './hooks/useBehaviorAnalyticsPage';
import { DEVICE_DISTRIBUTION_ITEMS, USAGE_FEATURE_ITEMS } from './constants';
import {
    formatDate,
    formatNumber,
    getEventTypeColor,
    getMaxDailyEvents,
    getMaxEventCount,
    getRiskColor,
    getTotalEvents
} from './utils/behaviorAnalyticsPresentation';
import './BehaviorAnalyticsPage.css';

const BehaviorAnalyticsPage = () => {
    const {
        analyticsData,
        loading,
        error,
        selectedPeriod,
        setSelectedPeriod,
        selectedSchool,
        setSelectedSchool,
        selectedEventType,
        setSelectedEventType,
        activeTab,
        setActiveTab,
        showFilters,
        setShowFilters,
        fetchAnalytics,
        handleExport
    } = useBehaviorAnalyticsPage();

    const maxEventCount = getMaxEventCount(analyticsData?.eventTypeDistribution || []);
    const maxDailyEvents = getMaxDailyEvents(analyticsData?.dailyTrends || []);

    if (loading) {
        return <LoadingState />;
    }

    if (error) {
        return <ErrorState error={error} onRetry={fetchAnalytics} />;
    }

    return (
        <div className="behavior-analytics-page">
            <AnalyticsHeader
                showFilters={showFilters}
                onToggleFilters={() => setShowFilters((prev) => !prev)}
                onExport={handleExport}
            />

            {showFilters && (
                <AnalyticsFilters
                    selectedPeriod={selectedPeriod}
                    onPeriodChange={setSelectedPeriod}
                    selectedSchool={selectedSchool}
                    onSchoolChange={setSelectedSchool}
                    selectedEventType={selectedEventType}
                    onEventTypeChange={setSelectedEventType}
                />
            )}

            <AnalyticsTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === 'overview' && (
                <div className="overview-content">
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineUsers size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(getTotalEvents(analyticsData?.eventStats || []))}</h3>
                                <p>Total Events</p>
                                <span className="metric-period">{selectedPeriod}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineUsers size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(analyticsData?.topUsers?.length || 0)}</h3>
                                <p>Active Users</p>
                                <span className="metric-period">{selectedPeriod}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineShieldCheck size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(analyticsData?.securityStats?.totalSecurityEvents || 0)}</h3>
                                <p>Security Events</p>
                                <span className="metric-period">{selectedPeriod}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineDeviceMobile size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{analyticsData?.dailyTrends?.length || 0}</h3>
                                <p>Active Days</p>
                                <span className="metric-period">{selectedPeriod}</span>
                            </div>
                        </div>
                    </div>

                    <div className="chart-section">
                        <h3>Event Type Distribution</h3>
                        <div className="event-distribution">
                            {analyticsData?.eventTypeDistribution?.map((event, index) => (
                                <div key={index} className="event-item">
                                    <div className="event-header">
                                        <span className="event-name">{event.eventType}</span>
                                        <span className="event-count">{formatNumber(event.count)}</span>
                                    </div>
                                    <div className="event-bar">
                                        <div
                                            className="event-fill"
                                            style={{
                                                width: `${((event.count || 0) / maxEventCount) * 100}%`,
                                                backgroundColor: `var(--color-${getEventTypeColor(event.eventType)})`
                                            }}
                                        ></div>
                                    </div>
                                    <span className="event-users">{event.uniqueUsers} users</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="chart-section">
                        <h3>Daily Activity Trends</h3>
                        <div className="trends-chart">
                            {analyticsData?.dailyTrends?.map((day, index) => (
                                <div key={index} className="trend-bar-container">
                                    <div className="trend-bar" style={{ height: `${((day.totalEvents || 0) / maxDailyEvents) * 100}%` }}>
                                        <span className="trend-value">{day.totalEvents}</span>
                                    </div>
                                    <span className="trend-label">{formatDate(day._id)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="users-content">
                    <div className="users-table-container">
                        <table className="users-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>School</th>
                                    <th>Events</th>
                                    <th>Unique Actions</th>
                                    <th>Last Activity</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analyticsData?.topUsers?.map((user, index) => (
                                    <tr key={index}>
                                        <td>
                                            <div className="user-info">
                                                <span className="user-name">
                                                    {user.userInfo?.firstName} {user.userInfo?.lastName}
                                                </span>
                                                <span className="user-email">{user.userInfo?.email}</span>
                                            </div>
                                        </td>
                                        <td>{user.schoolInfo?.name || 'N/A'}</td>
                                        <td>{formatNumber(user.eventCount)}</td>
                                        <td>{user.uniqueActions}</td>
                                        <td>{formatDate(user.lastActivity)}</td>
                                        <td>
                                            <button className="action-btn">
                                                <HiOutlineEye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'security' && (
                <div className="security-content">
                    <div className="security-stats">
                        <div className="security-stat">
                            <HiOutlineExclamation size={24} className="icon-high" />
                            <div>
                                <h3>{formatNumber(analyticsData?.securityStats?.totalSecurityEvents || 0)}</h3>
                                <p>Total Security Events</p>
                            </div>
                        </div>
                        <div className="security-stat">
                            <HiOutlineUsers size={24} className="icon-medium" />
                            <div>
                                <h3>{formatNumber(analyticsData?.securityStats?.totalUniqueUsers || 0)}</h3>
                                <p>Unique Users</p>
                            </div>
                        </div>
                        <div className="security-stat">
                            <HiOutlineGlobeAlt size={24} className="icon-low" />
                            <div>
                                <h3>{formatNumber(analyticsData?.securityStats?.totalUniqueIPs || 0)}</h3>
                                <p>Unique IPs</p>
                            </div>
                        </div>
                    </div>

                    <div className="security-events">
                        <h3>Recent Security Events</h3>
                        <div className="events-list">
                            {analyticsData?.securityEvents?.map((event, index) => (
                                <div key={index} className={`security-event risk-${getRiskColor(event.riskScore)}`}>
                                    <div className="event-header">
                                        <span className="event-type">{event.eventType}</span>
                                        <span className="event-time">{formatDate(event.timestamp)}</span>
                                    </div>
                                    <div className="event-details">
                                        <p><strong>User:</strong> {event.user?.firstName} {event.user?.lastName}</p>
                                        <p><strong>School:</strong> {event.school?.name}</p>
                                        <p><strong>IP:</strong> {event.ipAddress}</p>
                                        <p><strong>Action:</strong> {event.action}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'usage' && (
                <div className="usage-content">
                    <div className="usage-grid">
                        <div className="usage-section">
                            <h3>Feature Usage</h3>
                            <div className="feature-list">
                                {USAGE_FEATURE_ITEMS.map((item) => (
                                    <div key={item.label} className="feature-item">
                                        <span>{item.label}</span>
                                        <span>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="usage-section">
                            <h3>Device Distribution</h3>
                            <div className="device-list">
                                {DEVICE_DISTRIBUTION_ITEMS.map((item) => (
                                    <div key={item.label} className="device-item">
                                        <span>{item.label}</span>
                                        <span>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BehaviorAnalyticsPage;
