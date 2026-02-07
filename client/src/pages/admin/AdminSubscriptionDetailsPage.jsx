import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchSubscriptionById,
    fetchBillingHistory,
    recordPayment,
    updateSubscription,
    cancelSubscription,
    clearError,
    clearSuccess,
    selectCurrentSubscription,
    selectBillingHistory,
    selectSubscriptionLoading,
    selectSubscriptionError,
    selectSubscriptionSuccess
} from '../../store/slices/subscriptionSlice';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowLeft,
    HiOutlineCreditCard,
    HiOutlineCurrencyDollar,
    HiOutlineCalendar,
    HiOutlineUsers,
    HiOutlineDocumentText,
    HiOutlinePencil,
    HiOutlineX,
    HiOutlinePlus,
    HiOutlineDownload,
    HiOutlineEye,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineClock,
    HiOutlineSparkles,
    HiOutlineShieldCheck,
    HiOutlineChartBar,
    HiOutlineDeviceMobile,
    HiOutlineCloud,
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineMail
} from 'react-icons/hi';
import './AdminSubscriptionDetailsPage.css';

const AdminSubscriptionDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    
    // Redux state
    const subscription = useSelector(selectCurrentSubscription);
    const billingHistory = useSelector(selectBillingHistory);
    const loading = useSelector(selectSubscriptionLoading);
    const error = useSelector(selectSubscriptionError);
    const success = useSelector(selectSubscriptionSuccess);
    
    // Local state
    const [activeTab, setActiveTab] = useState('overview');
    const [showEditModal, setShowEditModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    useEffect(() => {
        if (id) {
            dispatch(fetchSubscriptionById(id));
            dispatch(fetchBillingHistory(id));
        }
    }, [dispatch, id]);

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

    const handleEditSubscription = (updateData) => {
        dispatch(updateSubscription({
            id: subscription._id,
            updateData
        }));
        setShowEditModal(false);
    };

    const handleCancelSubscription = () => {
        dispatch(cancelSubscription(subscription._id));
        setShowCancelModal(false);
    };

    const handleRecordPayment = (paymentData) => {
        dispatch(recordPayment({
            id: subscription._id,
            ...paymentData
        }));
        setShowPaymentModal(false);
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
                return <HiOutlineCheckCircle size={20} />;
            case 'trial':
                return <HiOutlineClock size={20} />;
            case 'suspended':
                return <HiOutlineXCircle size={20} />;
            case 'cancelled':
                return <HiOutlineX size={20} />;
            default:
                return <HiOutlineClock size={20} />;
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
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getUsagePercentage = (current, max) => {
        if (max === -1) return 0; // unlimited
        return Math.round((current / max) * 100);
    };

    const getUsageColor = (percentage) => {
        if (percentage >= 90) return 'usage-danger';
        if (percentage >= 75) return 'usage-warning';
        return 'usage-normal';
    };

    if (loading || !subscription) {
        return (
            <div className="subscription-details-loading">
                <div className="spinner"></div>
                <p>Loading subscription details...</p>
            </div>
        );
    }

    return (
        <div className="admin-subscription-details-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <button
                        className="back-button"
                        onClick={() => navigate('/admin/subscriptions')}
                    >
                        <HiOutlineArrowLeft size={20} />
                        Back to Subscriptions
                    </button>
                    <div className="header-info">
                        <h1>{subscription.school?.name}</h1>
                        <div className="header-meta">
                            <span className={`status-badge ${getStatusColor(subscription.status)}`}>
                                {getStatusIcon(subscription.status)}
                                {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                            </span>
                            <span className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}>
                                {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowEditModal(true)}
                    >
                        <HiOutlinePencil size={20} />
                        Edit
                    </button>
                    {subscription.status !== 'cancelled' && (
                        <button
                            className="btn btn-danger"
                            onClick={() => setShowCancelModal(true)}
                        >
                            <HiOutlineX size={20} />
                            Cancel
                        </button>
                    )}
                </div>
            </div>

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
                        className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
                        onClick={() => setActiveTab('usage')}
                    >
                        <HiOutlineUsers size={20} />
                        Usage
                    </button>
                    <button
                        className={`tab ${activeTab === 'billing' ? 'active' : ''}`}
                        onClick={() => setActiveTab('billing')}
                    >
                        <HiOutlineCreditCard size={20} />
                        Billing
                    </button>
                    <button
                        className={`tab ${activeTab === 'features' ? 'active' : ''}`}
                        onClick={() => setActiveTab('features')}
                    >
                        <HiOutlineSparkles size={20} />
                        Features
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="overview-content">
                        <div className="overview-grid">
                            <div className="overview-card">
                                <h3>Subscription Details</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>Plan</label>
                                        <span className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}>
                                            {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Status</label>
                                        <span className={`status-badge ${getStatusColor(subscription.status)}`}>
                                            {getStatusIcon(subscription.status)}
                                            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Monthly Cost</label>
                                        <span className="cost">{formatCurrency(subscription.billing.amount)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Billing Cycle</label>
                                        <span>{subscription.billing.interval}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Created</label>
                                        <span>{formatDate(subscription.createdAt)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Trial Ends</label>
                                        <span>
                                            {subscription.trialEndsAt 
                                                ? formatDate(subscription.trialEndsAt)
                                                : 'N/A'
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="overview-card">
                                <h3>School Information</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>School Name</label>
                                        <span>{subscription.school?.name}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Admin Name</label>
                                        <span>{subscription.school?.contact?.adminName}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Email</label>
                                        <span>{subscription.school?.contact?.adminEmail}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Phone</label>
                                        <span>{subscription.school?.contact?.phone || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Address</label>
                                        <span>
                                            {subscription.school?.contact?.address 
                                                ? `${subscription.school.contact.address.street}, ${subscription.school.contact.address.city}, ${subscription.school.contact.address.state}`
                                                : 'N/A'
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="overview-card">
                                <h3>Payment Information</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>Payment Method</label>
                                        <span>{subscription.paymentMethod === 'cash' ? 'Cash' : subscription.paymentMethod || 'Cash'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Last Payment</label>
                                        <span>{subscription.billing?.lastBilledAt ? formatDate(subscription.billing.lastBilledAt) : 'No payments yet'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Next Billing</label>
                                        <span>{subscription.billing?.nextBillingAt ? formatDate(subscription.billing.nextBillingAt) : 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Total Invoices</label>
                                        <span>{subscription.invoices?.length || 0}</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowPaymentModal(true)}
                                    >
                                        <HiOutlineCurrencyDollar size={20} />
                                        Record Cash Payment
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Usage Tab */}
                {activeTab === 'usage' && (
                    <div className="usage-content">
                        <div className="usage-grid">
                            <div className="usage-card">
                                <h3>Resource Usage</h3>
                                <div className="usage-items">
                                    <div className="usage-item">
                                        <div className="usage-header">
                                            <div className="usage-info">
                                                <span className="usage-label">Students</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentStudents} / {subscription.limits.maxStudents === -1 ? '∞' : subscription.limits.maxStudents}
                                                </span>
                                            </div>
                                            <span className={`usage-percentage ${getUsageColor(getUsagePercentage(subscription.usage.currentStudents, subscription.limits.maxStudents))}`}>
                                                {getUsagePercentage(subscription.usage.currentStudents, subscription.limits.maxStudents)}%
                                            </span>
                                        </div>
                                        <div className="usage-bar">
                                            <div 
                                                className="usage-fill"
                                                style={{ 
                                                    width: `${Math.min(getUsagePercentage(subscription.usage.currentStudents, subscription.limits.maxStudents), 100)}%` 
                                                }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="usage-item">
                                        <div className="usage-header">
                                            <div className="usage-info">
                                                <span className="usage-label">Teachers</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentTeachers} / {subscription.limits.maxTeachers === -1 ? '∞' : subscription.limits.maxTeachers}
                                                </span>
                                            </div>
                                            <span className={`usage-percentage ${getUsageColor(getUsagePercentage(subscription.usage.currentTeachers, subscription.limits.maxTeachers))}`}>
                                                {getUsagePercentage(subscription.usage.currentTeachers, subscription.limits.maxTeachers)}%
                                            </span>
                                        </div>
                                        <div className="usage-bar">
                                            <div 
                                                className="usage-fill"
                                                style={{ 
                                                    width: `${Math.min(getUsagePercentage(subscription.usage.currentTeachers, subscription.limits.maxTeachers), 100)}%` 
                                                }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="usage-item">
                                        <div className="usage-header">
                                            <div className="usage-info">
                                                <span className="usage-label">Classes</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentClasses} / {subscription.limits.maxClasses === -1 ? '∞' : subscription.limits.maxClasses}
                                                </span>
                                            </div>
                                            <span className={`usage-percentage ${getUsageColor(getUsagePercentage(subscription.usage.currentClasses, subscription.limits.maxClasses))}`}>
                                                {getUsagePercentage(subscription.usage.currentClasses, subscription.limits.maxClasses)}%
                                            </span>
                                        </div>
                                        <div className="usage-bar">
                                            <div 
                                                className="usage-fill"
                                                style={{ 
                                                    width: `${Math.min(getUsagePercentage(subscription.usage.currentClasses, subscription.limits.maxClasses), 100)}%` 
                                                }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div className="usage-item">
                                        <div className="usage-header">
                                            <div className="usage-info">
                                                <span className="usage-label">Storage</span>
                                                <span className="usage-count">
                                                    {Math.round(subscription.usage.currentStorage / 1024)}MB / {subscription.limits.maxStorage === -1 ? '∞' : subscription.limits.maxStorage}MB
                                                </span>
                                            </div>
                                            <span className={`usage-percentage ${getUsageColor(getUsagePercentage(subscription.usage.currentStorage, subscription.limits.maxStorage))}`}>
                                                {getUsagePercentage(subscription.usage.currentStorage, subscription.limits.maxStorage)}%
                                            </span>
                                        </div>
                                        <div className="usage-bar">
                                            <div 
                                                className="usage-fill"
                                                style={{ 
                                                    width: `${Math.min(getUsagePercentage(subscription.usage.currentStorage, subscription.limits.maxStorage), 100)}%` 
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="usage-card">
                                <h3>Usage Trends</h3>
                                <div className="trends-placeholder">
                                    <HiOutlineChartBar size={48} />
                                    <p>Usage trends chart would be displayed here</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Billing Tab */}
                {activeTab === 'billing' && (
                    <div className="billing-content">
                        <div className="billing-header">
                            <h3>Billing History</h3>
                            <button className="btn btn-secondary">
                                <HiOutlineDownload size={20} />
                                Export
                            </button>
                        </div>
                        
                        <div className="billing-table-container">
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>Invoice #</th>
                                        <th>Date</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billingHistory.map((invoice, index) => (
                                        <tr key={index}>
                                            <td>
                                                <span className="invoice-number">{invoice.number}</span>
                                            </td>
                                            <td>{formatDate(invoice.createdAt)}</td>
                                            <td>{formatCurrency(invoice.amount, invoice.currency)}</td>
                                            <td>
                                                <span className={`invoice-status status-${invoice.status}`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="invoice-actions">
                                                    {invoice.hostedInvoiceUrl && (
                                                        <a
                                                            href={invoice.hostedInvoiceUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="action-btn"
                                                        >
                                                            <HiOutlineEye size={16} />
                                                        </a>
                                                    )}
                                                    {invoice.invoicePdfUrl && (
                                                        <a
                                                            href={invoice.invoicePdfUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="action-btn"
                                                        >
                                                            <HiOutlineDownload size={16} />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {billingHistory.length === 0 && (
                                <div className="empty-billing">
                                    <HiOutlineDocumentText size={48} />
                                    <h3>No billing history</h3>
                                    <p>This subscription doesn't have any invoices yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Features Tab */}
                {activeTab === 'features' && (
                    <div className="features-content">
                        <div className="features-grid">
                            <div className="feature-category">
                                <h3>Core Features</h3>
                                <div className="feature-list">
                                    <div className={`feature-item ${subscription.features.emailNotifications ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineMail size={20} />
                                        <span>Email Notifications</span>
                                        <div className="feature-toggle">
                                            {subscription.features.emailNotifications ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                    <div className={`feature-item ${subscription.features.dataExport ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineDownload size={20} />
                                        <span>Data Export</span>
                                        <div className="feature-toggle">
                                            {subscription.features.dataExport ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="feature-category">
                                <h3>Communication</h3>
                                <div className="feature-list">
                                    <div className={`feature-item ${subscription.features.parentPortal ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineUsers size={20} />
                                        <span>Parent Portal</span>
                                        <div className="feature-toggle">
                                            {subscription.features.parentPortal ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="feature-category">
                                <h3>Analytics & Reporting</h3>
                                <div className="feature-list">
                                    <div className={`feature-item ${subscription.features.advancedAnalytics ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineChartBar size={20} />
                                        <span>Advanced Analytics</span>
                                        <div className="feature-toggle">
                                            {subscription.features.advancedAnalytics ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                    <div className={`feature-item ${subscription.features.customReports ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineDocumentText size={20} />
                                        <span>Custom Reports</span>
                                        <div className="feature-toggle">
                                            {subscription.features.customReports ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="feature-category">
                                <h3>Advanced Features</h3>
                                <div className="feature-list">
                                    <div className={`feature-item ${subscription.features.apiAccess ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineCloud size={20} />
                                        <span>API Access</span>
                                        <div className="feature-toggle">
                                            {subscription.features.apiAccess ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                    <div className={`feature-item ${subscription.features.prioritySupport ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineShieldCheck size={20} />
                                        <span>Priority Support</span>
                                        <div className="feature-toggle">
                                            {subscription.features.prioritySupport ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                    <div className={`feature-item ${subscription.features.customBranding ? 'enabled' : 'disabled'}`}>
                                        <HiOutlineSparkles size={20} />
                                        <span>Custom Branding</span>
                                        <div className="feature-toggle">
                                            {subscription.features.customBranding ? (
                                                <HiOutlineCheckCircle size={20} />
                                            ) : (
                                                <HiOutlineXCircle size={20} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Subscription Modal */}
            {showEditModal && (
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
                                <select defaultValue={subscription.plan}>
                                    <option value="starter">Starter</option>
                                    <option value="professional">Professional</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select defaultValue={subscription.status}>
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
                                    defaultValue={subscription.metadata?.notes || ''}
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
                                    const planEl = document.querySelector('select');
                                    const statusEl = document.querySelectorAll('select')[1];
                                    const notesEl = document.querySelector('textarea');
                                    
                                    handleEditSubscription({
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
            {showCancelModal && (
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
                                    <strong>{subscription.school?.name}</strong>.
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
                                onClick={handleCancelSubscription}
                            >
                                Cancel Subscription
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Record Cash Payment Modal */}
            {showPaymentModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Record Cash Payment</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Amount ({subscription.billing?.currency || 'USD'})</label>
                                <input
                                    type="number"
                                    id="paymentAmount"
                                    defaultValue={subscription.billing?.amount || 0}
                                    min="0"
                                    step="0.01"
                                    placeholder="Enter payment amount"
                                />
                            </div>
                            <div className="form-group">
                                <label>Receipt Number (optional)</label>
                                <input
                                    type="text"
                                    id="receiptNumber"
                                    placeholder="e.g. REC-001"
                                />
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    id="paymentNotes"
                                    placeholder="e.g. Cash payment received at office"
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    const amount = parseFloat(document.getElementById('paymentAmount').value);
                                    const receiptNumber = document.getElementById('receiptNumber').value;
                                    const notes = document.getElementById('paymentNotes').value;
                                    handleRecordPayment({ amount, receiptNumber, notes });
                                }}
                            >
                                <HiOutlineCurrencyDollar size={20} />
                                Record Payment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSubscriptionDetailsPage;
