import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowLeft,
    HiOutlineOfficeBuilding,
    HiOutlineMail,
    HiOutlinePhone,
    HiOutlineLocationMarker,
    HiOutlineCalendar,
    HiOutlineUsers,
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineChartBar,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineClock,
    HiOutlineCurrencyDollar,
    HiOutlineServer,
    HiOutlineShieldCheck,
    HiOutlineCog
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminSchoolDetailsPage.css';

const SuperAdminSchoolDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['superAdminSchoolDetails']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';
    const [school, setSchool] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchSchoolDetails();
    }, [id, t]);

    const fetchSchoolDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/schools/${id}`);
            const schoolData = response.data.data.school;
            setSchool(schoolData);
        } catch (error) {
            toast.error(error.response?.data?.message || t('superAdminSchoolDetails:toast.loadFailed'));
            console.error('Error fetching school details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusToggle = async () => {
        try {
            const newStatus = school.subscription?.status === 'active' ? 'suspended' : 'active';
            await api.patch(`/schools/${id}/status`, { status: newStatus });
            setSchool(prev => ({
                ...prev,
                subscription: { ...prev.subscription, status: newStatus }
            }));
            toast.success(
                newStatus === 'active'
                    ? t('superAdminSchoolDetails:toast.statusActivated')
                    : t('superAdminSchoolDetails:toast.statusSuspended')
            );
        } catch (error) {
            toast.error(error.response?.data?.message || t('superAdminSchoolDetails:toast.updateStatusFailed'));
        }
    };

    const formatDate = (value) => {
        if (!value) return t('superAdminSchoolDetails:common.na');
        return new Date(value).toLocaleDateString(locale);
    };

    const getStatusLabel = (status = 'active') => {
        const normalized = String(status || 'active').toLowerCase();
        return t(`superAdminSchoolDetails:status.${normalized}`, { defaultValue: normalized });
    };

    const getPlanLabel = (plan = 'starter') => {
        const normalized = String(plan || 'starter').toLowerCase();
        return t(`superAdminSchoolDetails:plan.${normalized}`, { defaultValue: normalized });
    };

    if (loading) {
        return (
            <div className="admin-school-details">
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (!school) {
        return (
            <div className="admin-school-details">
                <div className="empty-state">
                    <h3>{t('superAdminSchoolDetails:empty.schoolNotFound')}</h3>
                    <button className="admin-action-btn primary" onClick={() => navigate('/admin/schools')}>
                        {t('superAdminSchoolDetails:header.backToSchools')}
                    </button>
                </div>
            </div>
        );
    }

    // Add safety checks for missing data
    if (!school.subscription) {
        school.subscription = {
            plan: 'starter',
            status: 'active'
        };
    }

    if (!school.settings) {
        school.settings = {
            maxStudents: 50
        };
    }

    if (!school.contact) {
        school.contact = {};
    }

    // Add computed stats
    school.userCount = school.userCount || 0;
    school.studentCount = school.studentCount || school.usageStats?.currentStudentCount || 0;
    school.teacherCount = school.teacherCount || 0;
    school.classCount = school.classCount || 0;

    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'success';
            case 'suspended': return 'danger';
            case 'trial': return 'warning';
            default: return 'secondary';
        }
    };

    const getPlanColor = (plan) => {
        switch (plan) {
            case 'enterprise': return 'primary';
            case 'professional': return 'info';
            case 'starter': return 'secondary';
            default: return 'secondary';
        }
    };

    return (
        <div className="admin-school-details">
            {/* Header */}
            <div className="school-details-header">
                <button className="admin-action-btn" onClick={() => navigate('/admin/schools')}>
                    <HiOutlineArrowLeft size={16} />
                    {t('superAdminSchoolDetails:header.backToSchools')}
                </button>
                
                <div className="header-actions">
                    <button 
                        className={`admin-action-btn ${school.subscription?.status === 'active' ? 'danger' : 'success'}`}
                        onClick={handleStatusToggle}
                    >
                        {school.subscription?.status === 'active' ? (
                            <>
                                <HiOutlineXCircle size={14} />
                                {t('superAdminSchoolDetails:actions.suspend')}
                            </>
                        ) : (
                            <>
                                <HiOutlineCheckCircle size={14} />
                                {t('superAdminSchoolDetails:actions.activate')}
                            </>
                        )}
                    </button>
                    <button className="admin-action-btn primary">
                        <HiOutlineCog size={14} />
                        {t('superAdminSchoolDetails:actions.settings')}
                    </button>
                </div>
            </div>

            {/* School Info Card */}
            <div className="school-info-card">
                <div className="school-header">
                    <div className="school-avatar">
                        <HiOutlineOfficeBuilding size={48} />
                    </div>
                    <div className="school-meta">
                        <h1>{school.name}</h1>
                        <div className="school-badges">
                            <span className={`badge badge-${getPlanColor(school.subscription?.plan || 'starter')}`}>
                                {t('superAdminSchoolDetails:badge.plan', { plan: getPlanLabel(school.subscription?.plan || 'starter') })}
                            </span>
                            <span className={`badge badge-${getStatusColor(school.subscription?.status || 'active')}`}>
                                {getStatusLabel(school.subscription?.status || 'active')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="school-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        <HiOutlineChartBar size={16} />
                        {t('superAdminSchoolDetails:tabs.overview')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        <HiOutlineUsers size={16} />
                        {t('superAdminSchoolDetails:tabs.users')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'subscription' ? 'active' : ''}`}
                        onClick={() => setActiveTab('subscription')}
                    >
                        <HiOutlineCurrencyDollar size={16} />
                        {t('superAdminSchoolDetails:tabs.subscription')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <HiOutlineCog size={16} />
                        {t('superAdminSchoolDetails:tabs.settings')}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="tab-content">
                    {activeTab === 'overview' && (
                        <div className="overview-content">
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineUsers size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.userCount || 0}</h3>
                                        <p>{t('superAdminSchoolDetails:overview.totalUsers')}</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineAcademicCap size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.studentCount || 0}</h3>
                                        <p>{t('superAdminSchoolDetails:overview.students')}</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineUserGroup size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.teacherCount || 0}</h3>
                                        <p>{t('superAdminSchoolDetails:overview.teachers')}</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineServer size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.classCount || 0}</h3>
                                        <p>{t('superAdminSchoolDetails:overview.classes')}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="info-sections">
                                <div className="info-section">
                                    <h3><HiOutlineMail size={16} /> {t('superAdminSchoolDetails:contact.title')}</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:contact.adminEmail')}</label>
                                            <span>{school.contact?.adminEmail || t('superAdminSchoolDetails:common.na')}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:contact.supportEmail')}</label>
                                            <span>{school.contact?.supportEmail || t('superAdminSchoolDetails:common.na')}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:contact.phone')}</label>
                                            <span>{school.contact?.phone || t('superAdminSchoolDetails:common.na')}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:contact.address')}</label>
                                            <span>
                                                {school.contact?.address 
                                                    ? `${school.contact.address.street || ''}, ${school.contact.address.city || ''}, ${school.contact.address.state || ''} ${school.contact.address.zipCode || ''}, ${school.contact.address.country || ''}`.replace(/,\s*,/g, ',').replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '') || t('superAdminSchoolDetails:common.na')
                                                    : t('superAdminSchoolDetails:common.na')
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-section">
                                    <h3><HiOutlineCalendar size={16} /> {t('superAdminSchoolDetails:timeline.title')}</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:timeline.created')}</label>
                                            <span>{formatDate(school.createdAt)}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:timeline.lastUpdated')}</label>
                                            <span>{formatDate(school.updatedAt)}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:timeline.subscriptionStart')}</label>
                                            <span>{school.subscription?.startDate ? formatDate(school.subscription.startDate) : t('superAdminSchoolDetails:common.na')}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>{t('superAdminSchoolDetails:timeline.subscriptionEnd')}</label>
                                            <span>{school.subscription?.endDate ? formatDate(school.subscription.endDate) : t('superAdminSchoolDetails:common.na')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div className="users-content">
                            <div className="users-summary">
                                <div className="user-type-card">
                                    <h4>{t('superAdminSchoolDetails:users.administrators')}</h4>
                                    <div className="user-count">{school.adminCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>{t('superAdminSchoolDetails:users.teachers')}</h4>
                                    <div className="user-count">{school.teacherCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>{t('superAdminSchoolDetails:users.students')}</h4>
                                    <div className="user-count">{school.studentCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>{t('superAdminSchoolDetails:users.classes')}</h4>
                                    <div className="user-count">{school.classCount || 0}</div>
                                </div>
                            </div>
                            
                            <div className="recent-users">
                                <h3>{t('superAdminSchoolDetails:users.recentActivityTitle')}</h3>
                                <p>{t('superAdminSchoolDetails:users.recentActivityPlaceholder')}</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'subscription' && (
                        <div className="subscription-content">
                            <div className="subscription-info">
                                <div className="plan-details">
                                    <h3>{t('superAdminSchoolDetails:subscription.currentPlan', { plan: getPlanLabel(school.subscription?.plan || 'starter') })}</h3>
                                    <div className="plan-features">
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.maxStudents', { value: school.settings?.maxStudents || 50 })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.status', { status: getStatusLabel(school.subscription?.status || 'active') })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.currentStudents', { value: school.usageStats?.currentStudentCount || 0 })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.parentPortal', { value: school.settings?.features?.parentPortal ? t('superAdminSchoolDetails:common.enabled') : t('superAdminSchoolDetails:common.disabled') })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.advancedAnalytics', { value: school.settings?.features?.advancedAnalytics ? t('superAdminSchoolDetails:common.enabled') : t('superAdminSchoolDetails:common.disabled') })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.customReports', { value: school.settings?.features?.customReports ? t('superAdminSchoolDetails:common.enabled') : t('superAdminSchoolDetails:common.disabled') })}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>{t('superAdminSchoolDetails:subscription.emailNotifications', { value: school.settings?.features?.emailNotifications ? t('superAdminSchoolDetails:common.enabled') : t('superAdminSchoolDetails:common.disabled') })}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="billing-info">
                                    <h4>{t('superAdminSchoolDetails:subscription.infoTitle')}</h4>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.stripeCustomerId')}</label>
                                        <span>{school.subscription?.stripeCustomerId || t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.stripeSubscriptionId')}</label>
                                        <span>{school.subscription?.stripeSubscriptionId || t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.trialEnds')}</label>
                                        <span>{school.subscription?.trialEndsAt ? formatDate(school.subscription.trialEndsAt) : t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.currentPeriodEnd')}</label>
                                        <span>{school.subscription?.currentPeriodEnd ? formatDate(school.subscription.currentPeriodEnd) : t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.cancelAtPeriodEnd')}</label>
                                        <span>{school.subscription?.cancelAtPeriodEnd ? t('superAdminSchoolDetails:common.yes') : t('superAdminSchoolDetails:common.no')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.lastBilledAmount')}</label>
                                        <span>{school.usageStats?.lastBilledAmount ? `$${school.usageStats.lastBilledAmount}` : t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>{t('superAdminSchoolDetails:subscription.lastInvoiceDate')}</label>
                                        <span>{school.usageStats?.lastInvoiceDate ? formatDate(school.usageStats.lastInvoiceDate) : t('superAdminSchoolDetails:common.na')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="settings-content">
                            <h3>{t('superAdminSchoolDetails:settings.title')}</h3>
                            <p>{t('superAdminSchoolDetails:settings.placeholder')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminSchoolDetailsPage;
