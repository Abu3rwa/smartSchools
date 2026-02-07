import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineChartBar,
    HiOutlineUsers,
    HiOutlineShieldCheck,
    HiOutlineGlobeAlt,
    HiOutlineDeviceMobile,
    HiOutlineCalendar,
    HiOutlineDownload,
    HiOutlineSearch,
    HiOutlineFilter,
    HiOutlineEye,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineArrowTrendingUp,
    HiOutlineArrowTrendingDown,
    HiOutlineServer
} from 'react-icons/hi';
import './AdminBehaviorAnalyticsPage.css';

const AdminBehaviorAnalyticsPage = () => {
    const dispatch = useDispatch();
    
    // Local state
    const [analyticsData, setAnalyticsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState('month');
    const [selectedSchool, setSelectedSchool] = useState('');
    const [selectedEventType, setSelectedEventType] = useState('');
    const [activeTab, setActiveTab] = useState('overview');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchAnalytics();
    }, [selectedPeriod, selectedSchool, selectedEventType]);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const params = new URLSearchParams({
                period: selectedPeriod,
                ...(selectedSchool && { school: selectedSchool }),
                ...(selectedEventType && { eventType: selectedEventType })
            });
            
            const response = await fetch(`/api/behavior/analytics?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch analytics data');
            }
            
            const data = await response.json();
            setAnalyticsData(data.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString();
    };

    const getEventTypeColor = (eventType) => {
        const colors = {
            'login': 'blue',
            'logout': 'gray',
            'grade_created': 'green',
            'grade_updated': 'yellow',
            'grade_deleted': 'red',
            'login_failed': 'red',
            'permission_denied': 'orange',
            'page_view': 'purple',
            'feature_used': 'indigo'
        };
        return colors[eventType] || 'gray';
    };

    const getRiskColor = (riskScore) => {
        if (riskScore >= 3) return 'high';
        if (riskScore >= 2) return 'medium';
        return 'low';
    };

    const handleExport = async (format = 'json') => {
        try {
            const params = new URLSearchParams({
                format,
                period: selectedPeriod,
                ...(selectedSchool && { school: selectedSchool }),
                ...(selectedEventType && { eventType: selectedEventType })
            });
            
            const response = await fetch(`/api/behavior/export?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (format === 'csv') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `behavior_data_${selectedPeriod}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const data = await response.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `behavior_data_${selectedPeriod}.json`;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export failed:', err);
        }
    };

    if (loading) {
        return (
            <div className="behavior-analytics-loading">
                <div className="spinner"></div>
                <p>Loading analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="behavior-analytics-error">
                <HiOutlineExclamation size={48} />
                <h3>Error loading analytics</h3>
                <p>{error}</p>
                <button onClick={fetchAnalytics} className="btn btn-primary">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="behavior-analytics-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Behavior Analytics</h1>
                    <p>Monitor user activity, security events, and system usage patterns</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <HiOutlineFilter size={20} />
                        Filters
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleExport('json')}
                    >
                        <HiOutlineDownload size={20} />
                        Export JSON
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => handleExport('csv')}
                    >
                        <HiOutlineDownload size={20} />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label>Time Period</label>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(e.target.value)}
                        >
                            <option value="week">Last Week</option>
                            <option value="month">Last Month</option>
                            <option value="quarter">Last Quarter</option>
                            <option value="year">Last Year</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>School</label>
                        <select
                            value={selectedSchool}
                            onChange={(e) => setSelectedSchool(e.target.value)}
                        >
                            <option value="">All Schools</option>
                            {/* Schools would be populated here */}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>Event Type</label>
                        <select
                            value={selectedEventType}
                            onChange={(e) => setSelectedEventType(e.target.value)}
                        >
                            <option value="">All Events</option>
                            <option value="login">Login</option>
                            <option value="grade_created">Grade Created</option>
                            <option value="page_view">Page View</option>
                            <option value="feature_used">Feature Used</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        <HiOutlineChartBar size={20} />
                        Overview
                    </button>
                    <button
                        className={`tab ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        <HiOutlineUsers size={20} />
                        Users
                    </button>
                    <button
                        className={`tab ${activeTab === 'security' ? 'active' : ''}`}
                        onClick={() => setActiveTab('security')}
                    >
                        <HiOutlineShieldCheck size={20} />
                        Security
                    </button>
                    <button
                        className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
                        onClick={() => setActiveTab('usage')}
                    >
                        <HiOutlineGlobeAlt size={20} />
                        Usage
                    </button>
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="overview-content">
                    {/* Key Metrics */}
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">
                                <HiOutlineUsers size={24} />
                            </div>
                            <div className="metric-content">
                                <h3>{formatNumber(analyticsData?.eventStats?.reduce((sum, stat) => sum + stat.totalCount, 0) || 0)}</h3>
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

                    {/* Event Type Distribution */}
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
                                                width: `${(event.count / Math.max(...analyticsData.eventTypeDistribution.map(e => e.count))) * 100}%`,
                                                backgroundColor: `var(--color-${getEventTypeColor(event.eventType)})`
                                            }}
                                        ></div>
                                    </div>
                                    <span className="event-users">{event.uniqueUsers} users</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Daily Trends */}
                    <div className="chart-section">
                        <h3>Daily Activity Trends</h3>
                        <div className="trends-chart">
                            {analyticsData?.dailyTrends?.map((day, index) => (
                                <div key={index} className="trend-bar-container">
                                    <div className="trend-bar" style={{ 
                                        height: `${(day.totalEvents / Math.max(...analyticsData.dailyTrends.map(d => d.totalEvents))) * 100}%` 
                                    }}>
                                        <span className="trend-value">{day.totalEvents}</span>
                                    </div>
                                    <span className="trend-label">{formatDate(day._id)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Users Tab */}
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

            {/* Security Tab */}
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

            {/* Usage Tab */}
            {activeTab === 'usage' && (
                <div className="usage-content">
                    <div className="usage-grid">
                        <div className="usage-section">
                            <h3>Feature Usage</h3>
                            <div className="feature-list">
                                {/* Feature usage data would be displayed here */}
                                <div className="feature-item">
                                    <span>Grade Management</span>
                                    <span>1,234 uses</span>
                                </div>
                                <div className="feature-item">
                                    <span>Student Management</span>
                                    <span>856 uses</span>
                                </div>
                                <div className="feature-item">
                                    <span>Report Generation</span>
                                    <span>432 uses</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="usage-section">
                            <h3>Device Distribution</h3>
                            <div className="device-list">
                                {/* Device usage data would be displayed here */}
                                <div className="device-item">
                                    <span>Desktop</span>
                                    <span>65%</span>
                                </div>
                                <div className="device-item">
                                    <span>Mobile</span>
                                    <span>25%</span>
                                </div>
                                <div className="device-item">
                                    <span>Tablet</span>
                                    <span>10%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBehaviorAnalyticsPage;
