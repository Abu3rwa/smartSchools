import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
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
} from '../../../store/slices/subscriptionSlice';
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
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminSubscriptionDetailsPage.css';

const SuperAdminSubscriptionDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation(['superAdminSubscriptionDetails']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';
    
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
    const [featureDraft, setFeatureDraft] = useState({});
    const [savingFeatures, setSavingFeatures] = useState(false);

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

    useEffect(() => {
        if (subscription?.features) {
            setFeatureDraft({ ...subscription.features });
        }
    }, [subscription?._id, subscription?.features]);

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
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency
        }).format(amount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatPlanLabel = (planKey = '') => String(planKey || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();

    const getUsagePercentage = (current, max) => {
        if (max === -1) return 0; // unlimited
        return Math.round((current / max) * 100);
    };

    const getUsageColor = (percentage) => {
        if (percentage >= 90) return 'usage-danger';
        if (percentage >= 75) return 'usage-warning';
        return 'usage-normal';
    };

    const featureSections = [
        {
            title: t('superAdminSubscriptionDetails:features.sections.core'),
            items: [
                { key: 'emailNotifications', label: t('superAdminSubscriptionDetails:features.items.emailNotifications'), icon: HiOutlineMail },
                { key: 'dataExport', label: t('superAdminSubscriptionDetails:features.items.dataExport'), icon: HiOutlineDownload }
            ]
        },
        {
            title: t('superAdminSubscriptionDetails:features.sections.communication'),
            items: [
                { key: 'parentPortal', label: t('superAdminSubscriptionDetails:features.items.parentPortal'), icon: HiOutlineUsers }
            ]
        },
        {
            title: t('superAdminSubscriptionDetails:features.sections.analyticsReporting'),
            items: [
                { key: 'advancedAnalytics', label: t('superAdminSubscriptionDetails:features.items.advancedAnalytics'), icon: HiOutlineChartBar },
                { key: 'customReports', label: t('superAdminSubscriptionDetails:features.items.customReports'), icon: HiOutlineDocumentText }
            ]
        },
        {
            title: t('superAdminSubscriptionDetails:features.sections.advanced'),
            items: [
                { key: 'apiAccess', label: t('superAdminSubscriptionDetails:features.items.apiAccess'), icon: HiOutlineCloud },
                { key: 'prioritySupport', label: t('superAdminSubscriptionDetails:features.items.prioritySupport'), icon: HiOutlineShieldCheck },
                { key: 'customBranding', label: t('superAdminSubscriptionDetails:features.items.customBranding'), icon: HiOutlineSparkles }
            ]
        }
    ];

    const getStatusLabel = (status = '') => {
        const normalized = String(status || '').toLowerCase();
        return t(`superAdminSubscriptionDetails:status.${normalized}`, { defaultValue: normalized });
    };

    const getPlanLabel = (plan = '') => {
        const normalized = String(plan || '').toLowerCase();
        return t(`superAdminSubscriptionDetails:plan.${normalized}`, { defaultValue: formatPlanLabel(normalized) });
    };

    const getIntervalLabel = (interval = '') => {
        const normalized = String(interval || '').toLowerCase();
        return t(`superAdminSubscriptionDetails:interval.${normalized}`, { defaultValue: normalized });
    };

    const getInvoiceStatusLabel = (invoiceStatus = '') => {
        const normalized = String(invoiceStatus || '').toLowerCase();
        return t(`superAdminSubscriptionDetails:invoiceStatus.${normalized}`, { defaultValue: normalized });
    };

    const getPaymentMethodLabel = (paymentMethod = '') => {
        const normalized = String(paymentMethod || '').toLowerCase();
        return t(`superAdminSubscriptionDetails:paymentMethod.${normalized}`, {
            defaultValue: paymentMethod || t('superAdminSubscriptionDetails:common.cash')
        });
    };

    const trackedFeatureKeys = featureSections.flatMap((section) => section.items.map((item) => item.key));
    const hasFeatureChanges = trackedFeatureKeys.some(
        (featureKey) => Boolean(featureDraft?.[featureKey]) !== Boolean(subscription?.features?.[featureKey])
    );

    const handleFeatureToggle = (featureKey) => {
        setFeatureDraft((prev) => ({
            ...prev,
            [featureKey]: !prev?.[featureKey]
        }));
    };

    const handleResetFeatureDraft = () => {
        setFeatureDraft({ ...subscription.features });
    };

    const handleSaveFeatures = async () => {
        setSavingFeatures(true);
        try {
            await dispatch(updateSubscription({
                id: subscription._id,
                updateData: { features: featureDraft }
            })).unwrap();
            dispatch(fetchSubscriptionById(subscription._id));
        } finally {
            setSavingFeatures(false);
        }
    };

    if (loading || !subscription) {
        return (
            <div className="subscription-details-loading">
                <div className="spinner"></div>
                <p>{t('superAdminSubscriptionDetails:loading.message')}</p>
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
                        {t('superAdminSubscriptionDetails:header.backToSubscriptions')}
                    </button>
                    <div className="header-info">
                        <h1>{subscription.school?.name}</h1>
                        <div className="header-meta">
                            <span className={`status-badge ${getStatusColor(subscription.status)}`}>
                                {getStatusIcon(subscription.status)}
                                {getStatusLabel(subscription.status)}
                            </span>
                            <span className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}>
                                {getPlanLabel(subscription.plan)}
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
                        {t('superAdminSubscriptionDetails:actions.edit')}
                    </button>
                    {subscription.status !== 'cancelled' && (
                        <button
                            className="btn btn-danger"
                            onClick={() => setShowCancelModal(true)}
                        >
                            <HiOutlineX size={20} />
                            {t('superAdminSubscriptionDetails:actions.cancel')}
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
                        {t('superAdminSubscriptionDetails:tabs.overview')}
                    </button>
                    <button
                        className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
                        onClick={() => setActiveTab('usage')}
                    >
                        <HiOutlineUsers size={20} />
                        {t('superAdminSubscriptionDetails:tabs.usage')}
                    </button>
                    <button
                        className={`tab ${activeTab === 'billing' ? 'active' : ''}`}
                        onClick={() => setActiveTab('billing')}
                    >
                        <HiOutlineCreditCard size={20} />
                        {t('superAdminSubscriptionDetails:tabs.billing')}
                    </button>
                    <button
                        className={`tab ${activeTab === 'features' ? 'active' : ''}`}
                        onClick={() => setActiveTab('features')}
                    >
                        <HiOutlineSparkles size={20} />
                        {t('superAdminSubscriptionDetails:tabs.features')}
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
                                <h3>{t('superAdminSubscriptionDetails:overview.subscriptionDetails')}</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.plan')}</label>
                                        <span className={`plan-badge ${getPlanBadgeColor(subscription.plan)}`}>
                                            {getPlanLabel(subscription.plan)}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.status')}</label>
                                        <span className={`status-badge ${getStatusColor(subscription.status)}`}>
                                            {getStatusIcon(subscription.status)}
                                            {getStatusLabel(subscription.status)}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.monthlyCost')}</label>
                                        <span className="cost">{formatCurrency(subscription.billing.amount)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.billingCycle')}</label>
                                        <span>{getIntervalLabel(subscription.billing.interval)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.created')}</label>
                                        <span>{formatDate(subscription.createdAt)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.trialEnds')}</label>
                                        <span>
                                            {subscription.trialEndsAt 
                                                ? formatDate(subscription.trialEndsAt)
                                                : t('superAdminSubscriptionDetails:common.na')
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="overview-card">
                                <h3>{t('superAdminSubscriptionDetails:overview.schoolInformation')}</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.schoolName')}</label>
                                        <span>{subscription.school?.name}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.adminName')}</label>
                                        <span>{subscription.school?.contact?.adminName}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.email')}</label>
                                        <span>{subscription.school?.contact?.adminEmail}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.phone')}</label>
                                        <span>{subscription.school?.contact?.phone || t('superAdminSubscriptionDetails:common.na')}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.address')}</label>
                                        <span>
                                            {subscription.school?.contact?.address 
                                                ? `${subscription.school.contact.address.street}, ${subscription.school.contact.address.city}, ${subscription.school.contact.address.state}`
                                                : t('superAdminSubscriptionDetails:common.na')
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="overview-card">
                                <h3>{t('superAdminSubscriptionDetails:overview.paymentInformation')}</h3>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.paymentMethod')}</label>
                                        <span>{getPaymentMethodLabel(subscription.paymentMethod)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.lastPayment')}</label>
                                        <span>{subscription.billing?.lastBilledAt ? formatDate(subscription.billing.lastBilledAt) : t('superAdminSubscriptionDetails:common.noPaymentsYet')}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.nextBilling')}</label>
                                        <span>{subscription.billing?.nextBillingAt ? formatDate(subscription.billing.nextBillingAt) : t('superAdminSubscriptionDetails:common.na')}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>{t('superAdminSubscriptionDetails:labels.totalInvoices')}</label>
                                        <span>{subscription.invoices?.length || 0}</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowPaymentModal(true)}
                                    >
                                        <HiOutlineCurrencyDollar size={20} />
                                        {t('superAdminSubscriptionDetails:actions.recordCashPayment')}
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
                                <h3>{t('superAdminSubscriptionDetails:usage.resourceUsage')}</h3>
                                <div className="usage-items">
                                    <div className="usage-item">
                                        <div className="usage-header">
                                            <div className="usage-info">
                                                <span className="usage-label">{t('superAdminSubscriptionDetails:usage.students')}</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentStudents} / {subscription.limits.maxStudents === -1 ? t('superAdminSubscriptionDetails:common.infinity') : subscription.limits.maxStudents}
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
                                                <span className="usage-label">{t('superAdminSubscriptionDetails:usage.teachers')}</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentTeachers} / {subscription.limits.maxTeachers === -1 ? t('superAdminSubscriptionDetails:common.infinity') : subscription.limits.maxTeachers}
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
                                                <span className="usage-label">{t('superAdminSubscriptionDetails:usage.classes')}</span>
                                                <span className="usage-count">
                                                    {subscription.usage.currentClasses} / {subscription.limits.maxClasses === -1 ? t('superAdminSubscriptionDetails:common.infinity') : subscription.limits.maxClasses}
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
                                                <span className="usage-label">{t('superAdminSubscriptionDetails:usage.storage')}</span>
                                                <span className="usage-count">
                                                    {Math.round(subscription.usage.currentStorage / 1024)}MB / {subscription.limits.maxStorage === -1 ? t('superAdminSubscriptionDetails:common.infinity') : subscription.limits.maxStorage}MB
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
                                <h3>{t('superAdminSubscriptionDetails:usage.usageTrends')}</h3>
                                <div className="trends-placeholder">
                                    <HiOutlineChartBar size={48} />
                                    <p>{t('superAdminSubscriptionDetails:usage.usageTrendsPlaceholder')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Billing Tab */}
                {activeTab === 'billing' && (
                    <div className="billing-content">
                        <div className="billing-header">
                            <h3>{t('superAdminSubscriptionDetails:billing.title')}</h3>
                            <button className="btn btn-secondary">
                                <HiOutlineDownload size={20} />
                                {t('superAdminSubscriptionDetails:actions.export')}
                            </button>
                        </div>
                        
                        <div className="billing-table-container">
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>{t('superAdminSubscriptionDetails:billing.table.invoiceNumber')}</th>
                                        <th>{t('superAdminSubscriptionDetails:billing.table.date')}</th>
                                        <th>{t('superAdminSubscriptionDetails:billing.table.amount')}</th>
                                        <th>{t('superAdminSubscriptionDetails:billing.table.status')}</th>
                                        <th>{t('superAdminSubscriptionDetails:billing.table.actions')}</th>
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
                                                    {getInvoiceStatusLabel(invoice.status)}
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
                                    <h3>{t('superAdminSubscriptionDetails:billing.empty.title')}</h3>
                                    <p>{t('superAdminSubscriptionDetails:billing.empty.description')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Features Tab */}
                {activeTab === 'features' && (
                    <div className="features-content">
                        <div className="features-header">
                            <p>{t('superAdminSubscriptionDetails:features.description')}</p>
                            <div className="features-actions">
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleResetFeatureDraft}
                                    disabled={!hasFeatureChanges || savingFeatures}
                                >
                                    {t('superAdminSubscriptionDetails:actions.reset')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveFeatures}
                                    disabled={!hasFeatureChanges || savingFeatures}
                                >
                                    {savingFeatures
                                        ? t('superAdminSubscriptionDetails:actions.saving')
                                        : t('superAdminSubscriptionDetails:actions.saveFeatureOverrides')}
                                </button>
                            </div>
                        </div>
                        <div className="features-grid">
                            {featureSections.map((section) => (
                                <div key={section.title} className="feature-category">
                                    <h3>{section.title}</h3>
                                    <div className="feature-list">
                                        {section.items.map((feature) => {
                                            const Icon = feature.icon;
                                            const isEnabled = Boolean(featureDraft?.[feature.key]);
                                            return (
                                                <button
                                                    key={feature.key}
                                                    type="button"
                                                    className={`feature-item feature-item-toggle ${isEnabled ? 'enabled' : 'disabled'}`}
                                                    onClick={() => handleFeatureToggle(feature.key)}
                                                    aria-pressed={isEnabled}
                                                >
                                                    <div className="feature-main">
                                                        <Icon size={20} />
                                                        <span>{feature.label}</span>
                                                    </div>
                                                    <div className="feature-toggle">
                                                        {isEnabled ? (
                                                            <HiOutlineCheckCircle size={20} />
                                                        ) : (
                                                            <HiOutlineXCircle size={20} />
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Subscription Modal */}
            {showEditModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{t('superAdminSubscriptionDetails:modal.edit.title')}</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowEditModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:labels.plan')}</label>
                                <select defaultValue={subscription.plan}>
                                    <option value="starter">{t('superAdminSubscriptionDetails:plan.starter')}</option>
                                    <option value="professional">{t('superAdminSubscriptionDetails:plan.professional')}</option>
                                    <option value="enterprise">{t('superAdminSubscriptionDetails:plan.enterprise')}</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:labels.status')}</label>
                                <select defaultValue={subscription.status}>
                                    <option value="trial">{t('superAdminSubscriptionDetails:status.trial')}</option>
                                    <option value="active">{t('superAdminSubscriptionDetails:status.active')}</option>
                                    <option value="suspended">{t('superAdminSubscriptionDetails:status.suspended')}</option>
                                    <option value="inactive">{t('superAdminSubscriptionDetails:status.inactive')}</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:labels.notes')}</label>
                                <textarea
                                    placeholder={t('superAdminSubscriptionDetails:modal.edit.notesPlaceholder')}
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
                                {t('superAdminSubscriptionDetails:actions.cancel')}
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
                                {t('superAdminSubscriptionDetails:actions.updateSubscription')}
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
                            <h2>{t('superAdminSubscriptionDetails:modal.cancel.title')}</h2>
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
                                <h3>{t('superAdminSubscriptionDetails:modal.cancel.confirmTitle')}</h3>
                                <p>{t('superAdminSubscriptionDetails:modal.cancel.confirmDescription', {
                                    schoolName: subscription.school?.name
                                })}</p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCancelModal(false)}
                            >
                                {t('superAdminSubscriptionDetails:actions.keepSubscription')}
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleCancelSubscription}
                            >
                                {t('superAdminSubscriptionDetails:actions.cancelSubscription')}
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
                            <h2>{t('superAdminSubscriptionDetails:modal.payment.title')}</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:modal.payment.amountLabel', {
                                    currency: subscription.billing?.currency || 'USD'
                                })}</label>
                                <input
                                    type="number"
                                    id="paymentAmount"
                                    defaultValue={subscription.billing?.amount || 0}
                                    min="0"
                                    step="0.01"
                                    placeholder={t('superAdminSubscriptionDetails:modal.payment.amountPlaceholder')}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:modal.payment.receiptLabel')}</label>
                                <input
                                    type="text"
                                    id="receiptNumber"
                                    placeholder={t('superAdminSubscriptionDetails:modal.payment.receiptPlaceholder')}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSubscriptionDetails:labels.notes')}</label>
                                <textarea
                                    id="paymentNotes"
                                    placeholder={t('superAdminSubscriptionDetails:modal.payment.notesPlaceholder')}
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                {t('superAdminSubscriptionDetails:actions.cancel')}
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
                                {t('superAdminSubscriptionDetails:actions.recordPayment')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminSubscriptionDetailsPage;
