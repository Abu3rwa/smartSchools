import { useEffect, useMemo, useState } from 'react';
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
    HiOutlineLogin,
    HiOutlineUpload,
    HiOutlineDownload,
    HiOutlineTrash
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';
import importTemplateService from '../../../services/importTemplateService';
import TablePagination from '../../../components/common/TablePagination';

const DEFAULT_SCHOOLS_PAGE_SIZE = 10;
const DEFAULT_TEMPLATES_PAGE_SIZE = 10;

const SuperAdminSchoolsPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t } = useTranslation(['superAdminSchools']);
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [schoolsPage, setSchoolsPage] = useState(1);
    const [schoolsPageSize, setSchoolsPageSize] = useState(DEFAULT_SCHOOLS_PAGE_SIZE);
    const [templatesPage, setTemplatesPage] = useState(1);
    const [templatesPageSize, setTemplatesPageSize] = useState(DEFAULT_TEMPLATES_PAGE_SIZE);
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [templateForm, setTemplateForm] = useState({
        entityType: 'students',
        version: 'v1',
        notes: '',
        changelog: '',
        status: 'inactive',
        file: null
    });
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
        fetchTemplates();
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

    const fetchTemplates = async () => {
        setTemplatesLoading(true);
        try {
            const data = await importTemplateService.listAdminTemplates();
            setTemplates(data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load import templates');
        } finally {
            setTemplatesLoading(false);
        }
    };

    const openCreateTemplateModal = () => {
        setEditingTemplate(null);
        setTemplateForm({
            entityType: 'students',
            version: 'v1',
            notes: '',
            changelog: '',
            status: 'inactive',
            file: null
        });
        setShowTemplateModal(true);
    };

    const openEditTemplateModal = (template) => {
        setEditingTemplate(template);
        setTemplateForm({
            entityType: template.entityType,
            version: template.version || 'v1',
            notes: template.notes || '',
            changelog: template.changelog || '',
            status: template.status || 'inactive',
            file: null
        });
        setShowTemplateModal(true);
    };

    const closeTemplateModal = () => {
        setShowTemplateModal(false);
        setEditingTemplate(null);
        setTemplateForm({
            entityType: 'students',
            version: 'v1',
            notes: '',
            changelog: '',
            status: 'inactive',
            file: null
        });
    };

    const submitTemplateForm = async (event) => {
        event.preventDefault();
        if (!editingTemplate && !templateForm.file) {
            toast.error('CSV file is required');
            return;
        }

        setSavingTemplate(true);
        try {
            const formData = new FormData();
            formData.append('entityType', templateForm.entityType);
            formData.append('version', templateForm.version || 'v1');
            formData.append('notes', templateForm.notes || '');
            formData.append('changelog', templateForm.changelog || '');
            formData.append('status', templateForm.status || 'inactive');
            if (templateForm.file) formData.append('file', templateForm.file);

            if (editingTemplate) {
                await importTemplateService.updateAdminTemplate(editingTemplate.id, formData);
                toast.success('Import template updated');
            } else {
                await importTemplateService.createAdminTemplate(formData);
                toast.success('Import template created');
            }

            closeTemplateModal();
            fetchTemplates();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save import template');
        } finally {
            setSavingTemplate(false);
        }
    };

    const handleToggleTemplateStatus = async (template) => {
        const nextStatus = template.status === 'active' ? 'inactive' : 'active';
        try {
            await importTemplateService.updateAdminTemplateStatus(template.id, nextStatus);
            toast.success(`Template ${nextStatus}`);
            fetchTemplates();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update template status');
        }
    };

    const handleDownloadTemplate = async (template) => {
        try {
            await importTemplateService.downloadAdminTemplate(template.id, template.filename || 'import-template.csv');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to download template');
        }
    };

    const handleDeleteTemplate = async (template) => {
        if (!window.confirm(`Delete template for ${template.entityType}?`)) return;
        try {
            await importTemplateService.deleteAdminTemplate(template.id);
            toast.success('Template deleted');
            fetchTemplates();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete template');
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

    const filtered = useMemo(() => (
        schools.filter((s) =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.contact?.adminEmail?.toLowerCase().includes(search.toLowerCase())
        )
    ), [schools, search]);

    const schoolsTotalPages = Math.max(1, Math.ceil(filtered.length / schoolsPageSize));
    const paginatedSchools = useMemo(() => {
        const startIndex = (schoolsPage - 1) * schoolsPageSize;
        return filtered.slice(startIndex, startIndex + schoolsPageSize);
    }, [filtered, schoolsPage, schoolsPageSize]);

    const templatesTotalPages = Math.max(1, Math.ceil(templates.length / templatesPageSize));
    const paginatedTemplates = useMemo(() => {
        const startIndex = (templatesPage - 1) * templatesPageSize;
        return templates.slice(startIndex, startIndex + templatesPageSize);
    }, [templates, templatesPage, templatesPageSize]);

    useEffect(() => {
        setSchoolsPage(1);
    }, [search]);

    useEffect(() => {
        if (schoolsPage > schoolsTotalPages) {
            setSchoolsPage(schoolsTotalPages);
        }
    }, [schoolsPage, schoolsTotalPages]);

    useEffect(() => {
        if (templatesPage > templatesTotalPages) {
            setTemplatesPage(templatesTotalPages);
        }
    }, [templatesPage, templatesTotalPages]);

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
                                {paginatedSchools.map((school) => (
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
                <TablePagination
                    page={schoolsPage}
                    pageSize={schoolsPageSize}
                    totalItems={filtered.length}
                    totalPages={schoolsTotalPages}
                    onPageChange={(nextPage) => setSchoolsPage(Math.max(1, Math.min(nextPage, schoolsTotalPages)))}
                    onPageSizeChange={(nextSize) => {
                        setSchoolsPageSize(nextSize);
                        setSchoolsPage(1);
                    }}
                />
            </div>

            <div className="admin-section" style={{ marginTop: 'var(--spacing-xl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Import Templates</h2>
                        <p className="text-muted" style={{ margin: '6px 0 0' }}>Manage global CSV sample templates for imports</p>
                    </div>
                    <button className="admin-action-btn primary" onClick={openCreateTemplateModal}>
                        <HiOutlineUpload size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Upload Template
                    </button>
                </div>

                {templatesLoading ? (
                    <div className="admin-empty"><div className="spinner"></div></div>
                ) : templates.length === 0 ? (
                    <div className="admin-empty">
                        <p>No templates uploaded yet</p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Entity</th>
                                    <th>Version</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    <th>Filename</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedTemplates.map((template) => (
                                    <tr key={template.id}>
                                        <td>{template.entityType}</td>
                                        <td>{template.version || 'v1'}</td>
                                        <td>
                                            <span className={`status-badge ${template.status}`}>{template.status}</span>
                                        </td>
                                        <td>{template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '-'}</td>
                                        <td>{template.filename}</td>
                                        <td>
                                            <div className="admin-actions">
                                                <button className="admin-action-btn" title="Download" onClick={() => handleDownloadTemplate(template)}>
                                                    <HiOutlineDownload size={14} />
                                                </button>
                                                <button className="admin-action-btn" title="Edit" onClick={() => openEditTemplateModal(template)}>
                                                    <HiOutlinePencil size={14} />
                                                </button>
                                                <button className="admin-action-btn" title={template.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => handleToggleTemplateStatus(template)}>
                                                    {template.status === 'active' ? 'Deactivate' : 'Activate'}
                                                </button>
                                                <button className="admin-action-btn" title="Delete" onClick={() => handleDeleteTemplate(template)}>
                                                    <HiOutlineTrash size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <TablePagination
                    page={templatesPage}
                    pageSize={templatesPageSize}
                    totalItems={templates.length}
                    totalPages={templatesTotalPages}
                    onPageChange={(nextPage) => setTemplatesPage(Math.max(1, Math.min(nextPage, templatesTotalPages)))}
                    onPageSizeChange={(nextSize) => {
                        setTemplatesPageSize(nextSize);
                        setTemplatesPage(1);
                    }}
                />
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

            {showTemplateModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: 'var(--spacing-xl)', overflowY: 'auto'
                }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
                        padding: 'var(--spacing-2xl)', width: '100%', maxWidth: 560,
                        border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)',
                        margin: 'var(--spacing-md) 0'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {editingTemplate ? 'Replace Import Template' : 'Upload Import Template'}
                            </h2>
                            <button onClick={closeTemplateModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>

                        <form onSubmit={submitTemplateForm} className="register-form" style={{ gap: 'var(--spacing-md)' }}>
                            <div className="form-group">
                                <label>Entity</label>
                                <select value={templateForm.entityType} onChange={(e) => setTemplateForm({ ...templateForm, entityType: e.target.value })} disabled={!!editingTemplate}>
                                    <option value="students">students</option>
                                    <option value="teachers">teachers</option>
                                    <option value="classes">classes</option>
                                    <option value="subjects">subjects</option>
                                    <option value="standards">standards</option>
                                    <option value="rooms">rooms</option>
                                    <option value="timetable_periods">timetable_periods</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Version</label>
                                <input type="text" value={templateForm.version} onChange={(e) => setTemplateForm({ ...templateForm, version: e.target.value })} placeholder="v1" />
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select value={templateForm.status} onChange={(e) => setTemplateForm({ ...templateForm, status: e.target.value })}>
                                    <option value="inactive">inactive</option>
                                    <option value="active">active</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>CSV File</label>
                                <input type="file" accept=".csv,text/csv" onChange={(e) => setTemplateForm({ ...templateForm, file: e.target.files?.[0] || null })} />
                                {editingTemplate && <small className="text-muted">Leave empty to keep current file</small>}
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea value={templateForm.notes} onChange={(e) => setTemplateForm({ ...templateForm, notes: e.target.value })} rows={3} />
                            </div>
                            <div className="form-group">
                                <label>Changelog</label>
                                <textarea value={templateForm.changelog} onChange={(e) => setTemplateForm({ ...templateForm, changelog: e.target.value })} rows={3} />
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', marginTop: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                                <button type="button" className="admin-action-btn" onClick={closeTemplateModal}>Cancel</button>
                                <button type="submit" className="admin-action-btn primary" disabled={savingTemplate}>
                                    {savingTemplate ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
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
