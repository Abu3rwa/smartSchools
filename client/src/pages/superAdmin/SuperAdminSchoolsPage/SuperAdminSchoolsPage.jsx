import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { impersonateUser } from '../../../store/slices/authSlice';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineX,
    HiOutlineLogin
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';

const SuperAdminSchoolsPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t } = useTranslation(['superAdminSchools']);
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        schoolName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        plan: 'starter',
        maxStudents: 50
    });

    useEffect(() => {
        fetchSchools();
    }, []);

    const fetchSchools = async () => {
        try {
            const response = await api.get('/schools');
            setSchools(response.data.data.schools);
        } catch (error) {
            toast.error(error.response?.data?.message || t('superAdminSchools:toast.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.post('/schools', formData);
            toast.success(t('superAdminSchools:toast.schoolCreated'));
            setShowCreateModal(false);
            setFormData({ schoolName: '', adminName: '', adminEmail: '', adminPassword: '', plan: 'starter', maxStudents: 50 });
            fetchSchools();
        } catch (error) {
            toast.error(error.response?.data?.message || t('superAdminSchools:toast.createFailed'));
        } finally {
            setCreating(false);
        }
    };

    const getStatusLabel = (status = 'active') => {
        const normalized = String(status || 'active').toLowerCase();
        return t(`superAdminSchools:status.${normalized}`, { defaultValue: normalized });
    };

    const getPlanLabel = (plan = 'starter') => {
        const normalized = String(plan || 'starter').toLowerCase();
        return t(`superAdminSchools:plan.${normalized}`, { defaultValue: normalized });
    };

    const handleImpersonate = async (userId) => {
        if (!window.confirm(t('superAdminSchools:confirm.impersonateAdmin'))) return;

        const toastId = toast.loading(t('superAdminSchools:toast.impersonationStarting'));
        try {
            await dispatch(impersonateUser(userId)).unwrap();
            toast.success(t('superAdminSchools:toast.redirecting'), { id: toastId });
            navigate('/'); // Redirect to the main dashboard, which will now be the impersonated user's dashboard
        } catch (error) {
            toast.error(error, { id: toastId });
        }
    };

    const filtered = schools.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.contact?.adminEmail?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-dashboard">
            <h1>{t('superAdminSchools:page.title')}</h1>

            {/* Actions Bar */}
            <div className="admin-toolbar">
                <div className="search-input-wrapper admin-toolbar-search">
                    <HiOutlineSearch className="search-icon" size={18} />
                    <input
                        className="admin-toolbar-input"
                        type="text"
                        placeholder={t('superAdminSchools:search.placeholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button className="admin-action-btn primary" onClick={() => setShowCreateModal(true)}>
                    <HiOutlinePlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {t('superAdminSchools:actions.createSchool')}
                </button>
            </div>

            {/* Schools Table */}
            <div className="admin-section">
                {loading ? (
                    <div className="admin-empty"><div className="spinner"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="admin-empty">
                        <HiOutlineOfficeBuilding size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                        <p>{t('superAdminSchools:empty.noSchoolsFound')}</p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>{t('superAdminSchools:table.school')}</th>
                                    <th>{t('superAdminSchools:table.adminEmail')}</th>
                                    <th>{t('superAdminSchools:table.users')}</th>
                                    <th>{t('superAdminSchools:table.students')}</th>
                                    <th>{t('superAdminSchools:table.plan')}</th>
                                    <th>{t('superAdminSchools:table.status')}</th>
                                    <th>{t('superAdminSchools:table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((school) => (
                                    <tr key={school._id}>
                                        <td style={{ fontWeight: 500 }}>{school.name}</td>
                                        <td>{school.contact?.adminEmail}</td>
                                        <td>{school.userCount || 0}</td>
                                        <td>{school.studentCount || 0}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{getPlanLabel(school.subscription?.plan || 'starter')}</td>
                                        <td>
                                            <span className={`status-badge ${school.subscription?.status || 'active'}`}>
                                                {getStatusLabel(school.subscription?.status || 'active')}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="admin-actions">
                                                <button className="admin-action-btn" title={t('superAdminSchools:actions.loginAsAdmin')} onClick={() => handleImpersonate(school.adminId)}>
                                                    <HiOutlineLogin size={14} />
                                                </button>
                                                <button className="admin-action-btn" title={t('superAdminSchools:actions.viewDetails')} onClick={() => navigate(`/admin/schools/${school._id}`)}>
                                                    <HiOutlineEye size={14} />
                                                </button>
                                                <button className="admin-action-btn" title={t('superAdminSchools:actions.editSchool')}>
                                                    <HiOutlinePencil size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: 'var(--spacing-xl)', overflowY: 'auto'
                }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
                        padding: 'var(--spacing-2xl)', width: '100%', maxWidth: 480,
                        border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
                        margin: 'var(--spacing-md) 0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('superAdminSchools:modal.createSchoolTitle')}</h2>
                            <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="register-form" style={{ gap: 'var(--spacing-md)' }}>
                            <div className="form-group">
                                <label>{t('superAdminSchools:form.schoolNameLabel')}</label>
                                <input type="text" required value={formData.schoolName}
                                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                                    placeholder={t('superAdminSchools:form.schoolNamePlaceholder')} />
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSchools:form.adminNameLabel')}</label>
                                <input type="text" required value={formData.adminName}
                                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                                    placeholder={t('superAdminSchools:form.adminNamePlaceholder')} />
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSchools:form.adminEmailLabel')}</label>
                                <input type="email" required value={formData.adminEmail}
                                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                                    placeholder={t('superAdminSchools:form.adminEmailPlaceholder')} />
                            </div>
                            <div className="form-group">
                                <label>{t('superAdminSchools:form.adminPasswordLabel')}</label>
                                <input type="password" required value={formData.adminPassword}
                                    onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                                    placeholder={t('superAdminSchools:form.adminPasswordPlaceholder')} />
                            </div>
                            <div className="admin-form-row">
                                <div className="form-group">
                                    <label>{t('superAdminSchools:form.planLabel')}</label>
                                    <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })}>
                                        <option value="starter">{t('superAdminSchools:plan.starter')}</option>
                                        <option value="professional">{t('superAdminSchools:plan.professional')}</option>
                                        <option value="enterprise">{t('superAdminSchools:plan.enterprise')}</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{t('superAdminSchools:form.maxStudentsLabel')}</label>
                                    <input type="number" value={formData.maxStudents}
                                        onChange={(e) => setFormData({ ...formData, maxStudents: parseInt(e.target.value) })} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', marginTop: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                                <button type="button" className="admin-action-btn" onClick={() => setShowCreateModal(false)}>{t('superAdminSchools:actions.cancel')}</button>
                                <button type="submit" className="admin-action-btn primary" disabled={creating}>
                                    {creating ? t('superAdminSchools:actions.creating') : t('superAdminSchools:actions.createSchool')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminSchoolsPage;
