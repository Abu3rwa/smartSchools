import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    fetchSubscriptions,
    fetchSubscriptionAnalytics,
    createSubscription,
    updateSubscription,
    cancelSubscription,
    clearError,
    clearSuccess,
    selectSubscriptions,
    selectSubscriptionAnalytics,
    selectSubscriptionStatistics,
    selectSubscriptionLoading,
    selectSubscriptionError,
    selectSubscriptionSuccess
} from '../../../store/slices/subscriptionSlice';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlineChartBar,
    HiOutlineCreditCard,
    HiOutlineUsers,
    HiOutlineCurrencyDollar,
    HiOutlineSearch,
    HiOutlineFilter,
    HiOutlinePlus,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineX,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineClock,
    HiOutlineArrowUp,
    HiOutlineArrowDown,
    HiOutlineCalendar,
    HiOutlineDocumentText,
    HiOutlineCash,
    HiOutlineSparkles
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminSubscriptionsPage.css';

const SuperAdminSubscriptionsPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    
    // Redux state
    const subscriptions = useSelector(selectSubscriptions);
    const analytics = useSelector(selectSubscriptionAnalytics);
    const statistics = useSelector(selectSubscriptionStatistics);
    const loading = useSelector(selectSubscriptionLoading);
    const error = useSelector(selectSubscriptionError);
    const success = useSelector(selectSubscriptionSuccess);
    
    // Local state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [planFilter, setPlanFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [analyticsPeriod, setAnalyticsPeriod] = useState('month');
    const [createForm, setCreateForm] = useState({
        schoolId: '',
        plan: 'starter',
        status: 'trial',
        trialDays: 14,
        notes: ''
    });

    // Schools for create modal
    const [schools, setSchools] = useState([]);

    useEffect(() => {
        dispatch(fetchSubscriptions());
        dispatch(fetchSubscriptionAnalytics(analyticsPeriod));
        // Fetch all schools for admin create modal
        api.get('/schools?limit=1000').then(res => {
            setSchools(res.data.data?.schools || []);
        }).catch(() => {});
    }, [dispatch, analyticsPeriod]);

    useEffect(() => {
        if (error) {
            toast.error(error);
            dispatch(clearError());
        }
        if (success) {
            toast.success(success);
            dispatch(clearSuccess());
        }
    }, [error, success, dispatch]);

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
        const params = {
            search: e.target.value,
            status: statusFilter,
            plan: planFilter
        };
        dispatch(fetchSubscriptions(params));
    };

    const handleFilter = (type, value) => {
        if (type === 'status') {
            setStatusFilter(value);
        } else if (type === 'plan') {
            setPlanFilter(value);
        }
        
        const params = {
            search: searchTerm,
            status: type === 'status' ? value : statusFilter,
            plan: type === 'plan' ? value : planFilter
        };
        dispatch(fetchSubscriptions(params));
    };

    const handleEditSubscription = (subscription) => {
        setSelectedSubscription(subscription);
        setShowEditModal(true);
    };

    const handleCancelSubscription = (subscription) => {
        setSelectedSubscription(subscription);
        setShowCancelModal(true);
    };

    const handleViewDetails = (subscription) => {
        navigate(`/admin/subscriptions/${subscription._id}`);
    };

    const handleUpdateSubscription = (updateData) => {
        dispatch(updateSubscription({
            id: selectedSubscription._id,
            updateData
        }));
        setShowEditModal(false);
        setSelectedSubscription(null);
    };

    const handleConfirmCancel = () => {
        dispatch(cancelSubscription(selectedSubscription._id));
        setShowCancelModal(false);
        setSelectedSubscription(null);
    };

    const handleCreateSubscription = () => {
        if (!createForm.schoolId) {
            toast.error('Please select a school');
            return;
        }
        dispatch(createSubscription(createForm));
        setShowCreateModal(false);
        setCreateForm({ schoolId: '', plan: 'starter', status: 'trial', trialDays: 14, notes: '' });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'active':
                return 'status-active';
            case 'trial':
                return 'status-trial';
            case 'suspended':
                return 'status-suspended';
            case 'cancelled':
                return 'status-cancelled';
            case 'inactive':
                return 'status-inactive';
            default:
                return 'status-default';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'active':
                return <HiOutlineCheckCircle size={16} />;
            case 'trial':
                return <HiOutlineClock size={16} />;
            case 'suspended':
                return <HiOutlineXCircle size={16} />;
            case 'cancelled':
                return <HiOutlineX size={16} />;
            default:
                return <HiOutlineClock size={16} />;
        }
    };

    const getPlanBadgeColor = (plan) => {
        switch (plan) {
            case 'starter':
                return 'plan-starter';
            case 'professional':
                return 'plan-professional';
            case 'enterprise':
                return 'plan-enterprise';
            default:
                return 'plan-default';
        }
    };

    const formatCurrency = (amount, currency = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString();
    };

    if (loading && subscriptions.length === 0) {
        return (
            <div className="admin-subscriptions-loading">
                <div className="spinner"></div>
                <p>Loading subscriptions...</p>
            </div>
        );
    }

    return (
        <div className="admin-subscriptions-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <div className="header-title">
                        <h1>Subscription Management</h1>
                        <p>Manage all school subscriptions and billing</p>
                    </div>
                    <div className="header-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowAnalyticsModal(true)}
                        >
                            <HiOutlineChartBar size={20} />
                            Analytics
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <HiOutlinePlus size={20} />
                            Create Subscription
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineUsers size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{statistics.totalSubscriptions}</h3>
                        <p>Total Subscriptions</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon active">
                        <HiOutlineCheckCircle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{statistics.activeSubscriptions}</h3>
                        <p>Active Subscriptions</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon trial">
                        <HiOutlineClock size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{statistics.trialSubscriptions}</h3>
                        <p>Trial Subscriptions</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <HiOutlineCurrencyDollar size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{formatCurrency(statistics.totalRevenue)}</h3>
                        <p>Total Revenue</p>
                    </div>
                </div>
            </div>

            {/* Plan Distribution */}
            <div className="plan-distribution">
                <h3>Plan Distribution</h3>
                <div className="plan-stats">
                    <div className="plan-stat">
                        <span className="plan-badge plan-starter">Starter</span>
                        <span className="plan-count">{statistics.starterCount}</span>
                    </div>
                    <div className="plan-stat">
                        <span className="plan-badge plan-professional">Professional</span>
                        <span className="plan-count">{statistics.professionalCount}</span>
                    </div>
                    <div className="plan-stat">
                        <span className="plan-badge plan-enterprise">Enterprise</span>
                        <span className="plan-count">{statistics.enterpriseCount}</span>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="search-filters">
                <div className="search-bar">
                    <div className="search-input-wrapper">
                        <HiOutlineSearch size={20} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search subscriptions..."
                            value={searchTerm}
                            onChange={handleSearch}
                        />
                    </div>
                    <button
                        className="filter-toggle"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <HiOutlineFilter size={20} />
                        Filters
                    </button>
                </div>

                {showFilters && (
                    <div className="filters-panel">
                        <div className="filter-group">
                            <label>Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => handleFilter('status', e.target.value)}
                            >
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="trial">Trial</option>
                                <option value="suspended">Suspended</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Plan</label>
                            <select
                                value={planFilter}
                                onChange={(e) => handleFilter('plan', e.target.value)}
                            >
                                <option value="">All Plans</option>
                                <option value="starter">Starter</option>
                                <option value="professional">Professional</option>
                                <option value="enterprise">Enterprise</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Subscriptions Table */}
            <div className="subscriptions-table-container">
                <table className="subscriptions-table">
                    <thead>
                        <tr>
                            <th>School</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Amount</th>
                            <th>Billing Cycle</th>
                            <th>Next Billing</th>
                            <th>Usage</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subscriptions.map((subscription) => (
                            <tr key={subscription._id}>
                                <td>
                                    <div className="school-info">
                                        <div className="school-name">
                                            {subscription.school?.name || 'Unknown School'}
                                        </div>
                                        <div className="school-email">
                                            {subscription.school?.contact?.adminEmail}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}>
                                        {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                                    </span>
                                </td>
                                <td>
                                    <span className={`status-badge ${getStatusColor(subscription.status)}`}>
                                        {getStatusIcon(subscription.status)}
                                        {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                                    </span>
                                </td>
                                <td>{formatCurrency(subscription.billing.amount)}</td>
                                <td>
                                    <span className="billing-cycle">
                                        {subscription.billing.interval}
                                    </span>
                                </td>
                                <td>
                                    {subscription.billing.nextBillingAt 
                                        ? formatDate(subscription.billing.nextBillingAt)
                                        : 'N/A'
                                    }
                                </td>
                                <td>
                                    <div className="usage-info">
                                        <div className="usage-bar">
                                            <div 
                                                className="usage-fill"
                                                style={{ 
                                                    width: `${Math.min(
                                                        (subscription.usage.currentStudents / subscription.limits.maxStudents) * 100,
                                                        100
                                                    )}%` 
                                                }}
                                            ></div>
                                        </div>
                                        <span className="usage-text">
                                            {subscription.usage.currentStudents}/{subscription.limits.maxStudents}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div className="actions">
                                        <button
                                            className="action-btn view"
                                            onClick={() => handleViewDetails(subscription)}
                                            title="View Details"
                                        >
                                            <HiOutlineEye size={16} />
                                        </button>
                                        <button
                                            className="action-btn edit"
                                            onClick={() => handleEditSubscription(subscription)}
                                            title="Edit Subscription"
                                        >
                                            <HiOutlinePencil size={16} />
                                        </button>
                                        {subscription.status !== 'cancelled' && (
                                            <button
                                                className="action-btn cancel"
                                                onClick={() => handleCancelSubscription(subscription)}
                                                title="Cancel Subscription"
                                            >
                                                <HiOutlineX size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {subscriptions.length === 0 && !loading && (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <HiOutlineCreditCard size={48} />
                        </div>
                        <h3>No subscriptions found</h3>
                        <p>Try adjusting your search criteria or create a new subscription.</p>
                    </div>
                )}
            </div>

            {/* Edit Subscription Modal */}
            {showEditModal && selectedSubscription && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Edit Subscription</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowEditModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Plan</label>
                                <select
                                    defaultValue={selectedSubscription.plan}
                                    ref={(el) => { if (el) el.planValue = el.value; }}
                                >
                                    <option value="starter">Starter</option>
                                    <option value="professional">Professional</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    defaultValue={selectedSubscription.status}
                                    ref={(el) => { if (el) el.statusValue = el.value; }}
                                >
                                    <option value="trial">Trial</option>
                                    <option value="active">Active</option>
                                    <option value="suspended">Suspended</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    placeholder="Add notes about this subscription change..."
                                    defaultValue={selectedSubscription.metadata?.notes || ''}
                                    ref={(el) => { if (el) el.notesValue = el.value; }}
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowEditModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    const planEl = document.querySelector('select[defaultvalue]');
                                    const statusEl = document.querySelectorAll('select')[1];
                                    const notesEl = document.querySelector('textarea');
                                    
                                    handleUpdateSubscription({
                                        plan: planEl.value,
                                        status: statusEl.value,
                                        notes: notesEl.value
                                    });
                                }}
                            >
                                Update Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {showCancelModal && selectedSubscription && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Cancel Subscription</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowCancelModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="warning-message">
                                <HiOutlineXCircle size={48} />
                                <h3>Are you sure you want to cancel this subscription?</h3>
                                <p>
                                    This action will cancel the subscription for{' '}
                                    <strong>{selectedSubscription.school?.name}</strong>.
                                    The school will lose access to premium features at the end of the billing period.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCancelModal(false)}
                            >
                                Keep Subscription
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleConfirmCancel}
                            >
                                Cancel Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Subscription Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Create Subscription</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowCreateModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>School *</label>
                                <select
                                    value={createForm.schoolId}
                                    onChange={(e) => setCreateForm({ ...createForm, schoolId: e.target.value })}
                                >
                                    <option value="">Select a school...</option>
                                    {(schools || []).map((school) => (
                                        <option key={school._id} value={school._id}>
                                            {school.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Plan</label>
                                <select
                                    value={createForm.plan}
                                    onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value })}
                                >
                                    <option value="starter">Starter ($29/mo)</option>
                                    <option value="professional">Professional ($79/mo)</option>
                                    <option value="enterprise">Enterprise ($199/mo)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Initial Status</label>
                                <select
                                    value={createForm.status}
                                    onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                                >
                                    <option value="trial">Trial</option>
                                    <option value="active">Active</option>
                                </select>
                            </div>
                            {createForm.status === 'trial' && (
                                <div className="form-group">
                                    <label>Trial Days</label>
                                    <input
                                        type="number"
                                        value={createForm.trialDays}
                                        onChange={(e) => setCreateForm({ ...createForm, trialDays: parseInt(e.target.value) || 14 })}
                                        min="1"
                                        max="90"
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    value={createForm.notes}
                                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                    placeholder="Optional notes about this subscription..."
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCreateModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateSubscription}
                            >
                                <HiOutlinePlus size={20} />
                                Create Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Analytics Modal */}
            {showAnalyticsModal && (
                <div className="modal-overlay analytics-modal">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Subscription Analytics</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowAnalyticsModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="analytics-controls">
                                <select
                                    value={analyticsPeriod}
                                    onChange={(e) => setAnalyticsPeriod(e.target.value)}
                                >
                                    <option value="week">Last Week</option>
                                    <option value="month">Last Month</option>
                                    <option value="year">Last Year</option>
                                </select>
                            </div>
                            
                            {analytics ? (
                                <div className="analytics-content">
                                    {/* Key Metrics */}
                                    <div className="analytics-summary">
                                        <div className="summary-card">
                                            <h4>New Subscriptions</h4>
                                            <p>{analytics.analytics.reduce((sum, item) => sum + item.newSubscriptions, 0)}</p>
                                            <span className="summary-period">{analytics.period}</span>
                                        </div>
                                        <div className="summary-card">
                                            <h4>Revenue</h4>
                                            <p>{formatCurrency(analytics.analytics.reduce((sum, item) => sum + item.revenue, 0))}</p>
                                            <span className="summary-period">{analytics.period}</span>
                                        </div>
                                        <div className="summary-card">
                                            <h4>MRR</h4>
                                            <p>{formatCurrency(analytics.mrr)}</p>
                                            <span className="summary-period">Monthly</span>
                                        </div>
                                        <div className="summary-card">
                                            <h4>Total Collected</h4>
                                            <p>{formatCurrency(analytics.totalCollected)}</p>
                                            <span className="summary-period">All time</span>
                                        </div>
                                    </div>
                                    
                                    {/* Subscription Trends Chart */}
                                    <div className="analytics-chart">
                                        <h4>Subscription Trends</h4>
                                        <div className="trends-chart">
                                            {analytics.analytics.length > 0 ? (
                                                <div className="chart-bars">
                                                    {analytics.analytics.map((item, index) => {
                                                        const maxValue = Math.max(...analytics.analytics.map(d => Math.max(d.newSubscriptions, d.revenue / 100)));
                                                        const heightPercent = (item.newSubscriptions / maxValue) * 100;
                                                        return (
                                                            <div key={index} className="chart-bar-container">
                                                                <div className="chart-bar" style={{ height: `${heightPercent}%` }}>
                                                                    <span className="chart-value">{item.newSubscriptions}</span>
                                                                </div>
                                                                <span className="chart-label">
                                                                    {new Date(item._id.year, item._id.month - 1).toLocaleDateString('en-US', { month: 'short' })}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="chart-placeholder">
                                                    <HiOutlineChartBar size={48} />
                                                    <p>No data available for selected period</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Status Breakdown */}
                                    <div className="analytics-breakdown">
                                        <h4>Status Breakdown</h4>
                                        <div className="breakdown-grid">
                                            {analytics.statusBreakdown.map((status) => {
                                                const total = analytics.statusBreakdown.reduce((sum, s) => sum + s.count, 0);
                                                const percentage = ((status.count / total) * 100).toFixed(1);
                                                return (
                                                    <div key={status._id} className="breakdown-item">
                                                        <div className="breakdown-header">
                                                            <span className="breakdown-label">{status._id}</span>
                                                            <span className="breakdown-count">{status.count}</span>
                                                        </div>
                                                        <div className="breakdown-bar">
                                                            <div 
                                                                className="breakdown-fill"
                                                                style={{ width: `${percentage}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="breakdown-percentage">{percentage}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    
                                    {/* Plan Distribution */}
                                    <div className="analytics-breakdown">
                                        <h4>Plan Distribution</h4>
                                        <div className="plan-grid">
                                            {analytics.planDistribution.map((plan) => {
                                                const total = analytics.planDistribution.reduce((sum, p) => sum + p.count, 0);
                                                const percentage = ((plan.count / total) * 100).toFixed(1);
                                                return (
                                                    <div key={plan._id} className="plan-item">
                                                        <div className="plan-header">
                                                            <span className="plan-name">{plan._id}</span>
                                                            <span className="plan-count">{plan.count}</span>
                                                        </div>
                                                        <div className="plan-revenue">{formatCurrency(plan.revenue)}</div>
                                                        <div className="plan-bar">
                                                            <div 
                                                                className="plan-fill"
                                                                style={{ width: `${percentage}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="plan-percentage">{percentage}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="loading-analytics">
                                    <div className="spinner"></div>
                                    <p>Loading analytics...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminSubscriptionsPage;
