import {
    HiOutlineDeviceMobile,
    HiOutlineEye,
    HiOutlineExclamation,
    HiOutlineGlobeAlt,
    HiOutlineShieldCheck,
    HiOutlineUsers
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
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
    const { t, i18n } = useTranslation(['behaviorAnalytics']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;
    const getPeriodLabel = (period) =>
        t(`behaviorAnalytics:filters.periodOptions.${period}`, { defaultValue: period });

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
                                <p>{t('behaviorAnalytics:overview.totalEvents')}</p>
                                <span className="metric-period">{getPeriodLabel(selectedPeriod)}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineUsers size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(analyticsData?.topUsers?.length || 0)}</h3>
                                <p>{t('behaviorAnalytics:overview.activeUsers')}</p>
                                <span className="metric-period">{getPeriodLabel(selectedPeriod)}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineShieldCheck size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(analyticsData?.securityStats?.totalSecurityEvents || 0)}</h3>
                                <p>{t('behaviorAnalytics:overview.securityEvents')}</p>
                                <span className="metric-period">{getPeriodLabel(selectedPeriod)}</span>
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineDeviceMobile size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{analyticsData?.dailyTrends?.length || 0}</h3>
                                <p>{t('behaviorAnalytics:overview.activeDays')}</p>
                                <span className="metric-period">{getPeriodLabel(selectedPeriod)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="chart-section">
                        <h3>{t('behaviorAnalytics:overview.eventTypeDistribution')}</h3>
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
                                    <span className="event-users">{t('behaviorAnalytics:overview.usersCount', { count: event.uniqueUsers })}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="chart-section">
                        <h3>{t('behaviorAnalytics:overview.dailyActivityTrends')}</h3>
                        <div className="trends-chart">
                            {analyticsData?.dailyTrends?.map((day, index) => (
                                <div key={index} className="trend-bar-container">
                                    <div className="trend-bar" style={{ height: `${((day.totalEvents || 0) / maxDailyEvents) * 100}%` }}>
                                        <span className="trend-value">{day.totalEvents}</span>
                                    </div>
                                    <span className="trend-label">{formatDate(day._id, locale, t('behaviorAnalytics:common.na'))}</span>
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
                                    <th>{t('behaviorAnalytics:users.table.user')}</th>
                                    <th>{t('behaviorAnalytics:users.table.school')}</th>
                                    <th>{t('behaviorAnalytics:users.table.events')}</th>
                                    <th>{t('behaviorAnalytics:users.table.uniqueActions')}</th>
                                    <th>{t('behaviorAnalytics:users.table.lastActivity')}</th>
                                    <th>{t('behaviorAnalytics:users.table.actions')}</th>
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
                                        <td>{user.schoolInfo?.name || t('behaviorAnalytics:common.na')}</td>
                                        <td>{formatNumber(user.eventCount)}</td>
                                        <td>{user.uniqueActions}</td>
                                        <td>{formatDate(user.lastActivity, locale, t('behaviorAnalytics:common.na'))}</td>
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
                                <p>{t('behaviorAnalytics:security.totalSecurityEvents')}</p>
                            </div>
                        </div>
                        <div className="security-stat">
                            <HiOutlineUsers size={24} className="icon-medium" />
                            <div>
                                <h3>{formatNumber(analyticsData?.securityStats?.totalUniqueUsers || 0)}</h3>
                                <p>{t('behaviorAnalytics:security.uniqueUsers')}</p>
                            </div>
                        </div>
                        <div className="security-stat">
                            <HiOutlineGlobeAlt size={24} className="icon-low" />
                            <div>
                                <h3>{formatNumber(analyticsData?.securityStats?.totalUniqueIPs || 0)}</h3>
                                <p>{t('behaviorAnalytics:security.uniqueIps')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="security-events">
                        <h3>{t('behaviorAnalytics:security.recentSecurityEvents')}</h3>
                        <div className="events-list">
                            {analyticsData?.securityEvents?.map((event, index) => (
                                <div key={index} className={`security-event risk-${getRiskColor(event.riskScore)}`}>
                                    <div className="event-header">
                                        <span className="event-type">{event.eventType}</span>
                                        <span className="event-time">{formatDate(event.timestamp, locale, t('behaviorAnalytics:common.na'))}</span>
                                    </div>
                                    <div className="event-details">
                                        <p><strong>{t('behaviorAnalytics:security.details.user')}:</strong> {event.user?.firstName} {event.user?.lastName}</p>
                                        <p><strong>{t('behaviorAnalytics:security.details.school')}:</strong> {event.school?.name}</p>
                                        <p><strong>{t('behaviorAnalytics:security.details.ip')}:</strong> {event.ipAddress}</p>
                                        <p><strong>{t('behaviorAnalytics:security.details.action')}:</strong> {event.action}</p>
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
                            <h3>{t('behaviorAnalytics:usage.featureUsage')}</h3>
                            <div className="feature-list">
                                {USAGE_FEATURE_ITEMS.map((item) => (
                                    <div key={item.key} className="feature-item">
                                        <span>{t(`behaviorAnalytics:usage.features.${item.key}`)}</span>
                                        <span>{t('behaviorAnalytics:usage.usesCount', { count: item.value })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="usage-section">
                            <h3>{t('behaviorAnalytics:usage.deviceDistribution')}</h3>
                            <div className="device-list">
                                {DEVICE_DISTRIBUTION_ITEMS.map((item) => (
                                    <div key={item.key} className="device-item">
                                        <span>{t(`behaviorAnalytics:usage.devices.${item.key}`)}</span>
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
