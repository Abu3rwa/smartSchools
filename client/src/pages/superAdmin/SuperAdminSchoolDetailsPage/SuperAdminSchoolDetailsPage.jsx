import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
    const [school, setSchool] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        fetchSchoolDetails();
    }, [id]);

    const fetchSchoolDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/schools/${id}`);
            const schoolData = response.data.data.school;
            console.log('School data:', schoolData);
            setSchool(schoolData);
        } catch (error) {
            toast.error('Failed to load school details');
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
            toast.success(`School ${newStatus === 'active' ? 'activated' : 'suspended'} successfully`);
        } catch (error) {
            toast.error('Failed to update school status');
        }
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
                    <h3>School not found</h3>
                    <button className="admin-action-btn primary" onClick={() => navigate('/admin/schools')}>
                        Back to Schools
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
                    Back to Schools
                </button>
                
                <div className="header-actions">
                    <button 
                        className={`admin-action-btn ${school.subscription?.status === 'active' ? 'danger' : 'success'}`}
                        onClick={handleStatusToggle}
                    >
                        {school.subscription?.status === 'active' ? (
                            <>
                                <HiOutlineXCircle size={14} />
                                Suspend
                            </>
                        ) : (
                            <>
                                <HiOutlineCheckCircle size={14} />
                                Activate
                            </>
                        )}
                    </button>
                    <button className="admin-action-btn primary">
                        <HiOutlineCog size={14} />
                        Settings
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
                                {school.subscription?.plan || 'starter'} plan
                            </span>
                            <span className={`badge badge-${getStatusColor(school.subscription?.status || 'active')}`}>
                                {school.subscription?.status || 'active'}
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
                        Overview
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        <HiOutlineUsers size={16} />
                        Users
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'subscription' ? 'active' : ''}`}
                        onClick={() => setActiveTab('subscription')}
                    >
                        <HiOutlineCurrencyDollar size={16} />
                        Subscription
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <HiOutlineCog size={16} />
                        Settings
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
                                        <p>Total Users</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineAcademicCap size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.studentCount || 0}</h3>
                                        <p>Students</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineUserGroup size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.teacherCount || 0}</h3>
                                        <p>Teachers</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">
                                        <HiOutlineServer size={24} />
                                    </div>
                                    <div className="stat-info">
                                        <h3>{school.classCount || 0}</h3>
                                        <p>Classes</p>
                                    </div>
                                </div>
                            </div>

                            <div className="info-sections">
                                <div className="info-section">
                                    <h3><HiOutlineMail size={16} /> Contact Information</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <label>Admin Email</label>
                                            <span>{school.contact?.adminEmail || 'N/A'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Support Email</label>
                                            <span>{school.contact?.supportEmail || 'N/A'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Phone</label>
                                            <span>{school.contact?.phone || 'N/A'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Address</label>
                                            <span>
                                                {school.contact?.address 
                                                    ? `${school.contact.address.street || ''}, ${school.contact.address.city || ''}, ${school.contact.address.state || ''} ${school.contact.address.zipCode || ''}, ${school.contact.address.country || ''}`.replace(/,\s*,/g, ',').replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '') || 'N/A'
                                                    : 'N/A'
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-section">
                                    <h3><HiOutlineCalendar size={16} /> Timeline</h3>
                                    <div className="info-grid">
                                        <div className="info-item">
                                            <label>Created</label>
                                            <span>{new Date(school.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Last Updated</label>
                                            <span>{new Date(school.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Subscription Start</label>
                                            <span>{school.subscription?.startDate ? new Date(school.subscription.startDate).toLocaleDateString() : 'N/A'}</span>
                                        </div>
                                        <div className="info-item">
                                            <label>Subscription End</label>
                                            <span>{school.subscription?.endDate ? new Date(school.subscription.endDate).toLocaleDateString() : 'N/A'}</span>
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
                                    <h4>Administrators</h4>
                                    <div className="user-count">{school.adminCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>Teachers</h4>
                                    <div className="user-count">{school.teacherCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>Students</h4>
                                    <div className="user-count">{school.studentCount || 0}</div>
                                </div>
                                <div className="user-type-card">
                                    <h4>Classes</h4>
                                    <div className="user-count">{school.classCount || 0}</div>
                                </div>
                            </div>
                            
                            <div className="recent-users">
                                <h3>Recent Activity</h3>
                                <p>User activity and login history would be displayed here</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'subscription' && (
                        <div className="subscription-content">
                            <div className="subscription-info">
                                <div className="plan-details">
                                    <h3>Current Plan: {school.subscription?.plan || 'starter'}</h3>
                                    <div className="plan-features">
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>Max Students: {school.settings?.maxStudents || 50}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>Status: {school.subscription?.status || 'active'}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineCheckCircle size={16} className="feature-icon" />
                                            <span>Current Students: {school.usageStats?.currentStudentCount || 0}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>Parent Portal: {school.settings?.features?.parentPortal ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>Advanced Analytics: {school.settings?.features?.advancedAnalytics ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>Custom Reports: {school.settings?.features?.customReports ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                        <div className="feature-item">
                                            <HiOutlineShieldCheck size={16} className="feature-icon" />
                                            <span>Email Notifications: {school.settings?.features?.emailNotifications ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="billing-info">
                                    <h4>Subscription Information</h4>
                                    <div className="billing-item">
                                        <label>Stripe Customer ID</label>
                                        <span>{school.subscription?.stripeCustomerId || 'N/A'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Stripe Subscription ID</label>
                                        <span>{school.subscription?.stripeSubscriptionId || 'N/A'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Trial Ends</label>
                                        <span>{school.subscription?.trialEndsAt ? new Date(school.subscription.trialEndsAt).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Current Period End</label>
                                        <span>{school.subscription?.currentPeriodEnd ? new Date(school.subscription.currentPeriodEnd).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Cancel at Period End</label>
                                        <span>{school.subscription?.cancelAtPeriodEnd ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Last Billed Amount</label>
                                        <span>${school.usageStats?.lastBilledAmount || 'N/A'}</span>
                                    </div>
                                    <div className="billing-item">
                                        <label>Last Invoice Date</label>
                                        <span>{school.usageStats?.lastInvoiceDate ? new Date(school.usageStats.lastInvoiceDate).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="settings-content">
                            <h3>School Settings</h3>
                            <p>Configuration and advanced settings would be displayed here</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminSchoolDetailsPage;
