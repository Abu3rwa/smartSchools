import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../config/api';
import { HiOutlineClipboardList, HiOutlineArrowLeft, HiOutlinePencil, HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './AdminAttendanceRequestTypesPage.css';

const AdminAttendanceRequestTypesPage = () => {
    const navigate = useNavigate();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({ labelEn: '', labelAr: '', code: '', order: 0, isActive: true, requiresProof: false, useDateRange: false });
    const [saving, setSaving] = useState(false);

    const fetchTypes = () => {
        setLoading(true);
        api.get('/attendance-request-types/all')
            .then((res) => {
                if (res.data.success) setTypes(res.data.data || []);
            })
            .catch(() => toast.error('Failed to load types'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchTypes();
    }, []);

    const openCreate = () => {
        setForm({ labelEn: '', labelAr: '', code: '', order: types.length, isActive: true, requiresProof: false, useDateRange: false });
        setModal('create');
    };

    const openEdit = (t) => {
        setForm({
            labelEn: t.labelEn || '',
            labelAr: t.labelAr || '',
            code: t.code || '',
            order: t.order ?? 0,
            isActive: t.isActive !== false,
            requiresProof: t.requiresProof === true,
            useDateRange: t.useDateRange === true,
        });
        setModal(t._id);
    };

    const save = () => {
        if (!form.labelEn.trim()) {
            toast.error('English label is required');
            return;
        }
        setSaving(true);
        const payload = {
            labelEn: form.labelEn.trim(),
            labelAr: form.labelAr.trim() || undefined,
            code: form.code.trim() || undefined,
            order: Number(form.order) || 0,
            isActive: form.isActive,
            requiresProof: form.requiresProof,
            useDateRange: form.useDateRange,
        };
        const then = () => {
            setSaving(false);
            setModal(null);
            fetchTypes();
            toast.success(modal === 'create' ? 'Type created' : 'Type updated');
        };
        if (modal === 'create') {
            api.post('/attendance-request-types', payload).then(() => then()).catch((err) => {
                setSaving(false);
                toast.error(err.response?.data?.message || 'Failed to create');
            });
        } else {
            api.put(`/attendance-request-types/${modal}`, payload).then(() => then()).catch((err) => {
                setSaving(false);
                toast.error(err.response?.data?.message || 'Failed to update');
            });
        }
    };

    const deactivate = (id) => {
        if (!window.confirm('Deactivate this request type? It will no longer appear in the form.')) return;
        api.patch(`/attendance-request-types/${id}/deactivate`)
            .then(() => {
                fetchTypes();
                toast.success('Type deactivated');
            })
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to deactivate'));
    };

    return (
        <div className="admin-attendance-request-types-page">
            <header className="page-header">
                <div>
                    <button type="button" className="back-btn" onClick={() => navigate('/portal/review-attendance-requests')}>
                        <HiOutlineArrowLeft /> Back
                    </button>
                    <h1><HiOutlineClipboardList className="header-icon" /> Request Types</h1>
                    <p className="page-subtitle">Manage the options shown in the attendance request form (Type of Request).</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                    <HiOutlinePlus /> Add type
                </button>
            </header>

            {loading ? (
                <div className="loading-state"><div className="spinner" /> Loading...</div>
            ) : types.length === 0 && !modal ? (
                <div className="empty-state">
                    <p>No request types yet. Add one so users can submit attendance requests.</p>
                    <button type="button" className="btn btn-primary" onClick={openCreate}><HiOutlinePlus /> Add type</button>
                </div>
            ) : (
                <div className="types-table-wrap">
                    <table className="types-table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Label (EN)</th>
                                <th>Label (AR)</th>
                                <th>Requires proof</th>
                                <th>Date range</th>
                                <th>Active</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {types.map((t) => (
                                <tr key={t._id} className={!t.isActive ? 'inactive' : ''}>
                                    <td>{t.order}</td>
                                    <td>{t.labelEn}</td>
                                    <td>{t.labelAr || '—'}</td>
                                    <td>{t.requiresProof ? 'Yes' : 'No'}</td>
                                    <td>{t.useDateRange ? 'Yes' : 'No'}</td>
                                    <td>{t.isActive ? 'Yes' : 'No'}</td>
                                    <td>
                                        <button type="button" className="btn-link" onClick={() => openEdit(t)}><HiOutlinePencil /> Edit</button>
                                        {t.isActive && (
                                            <button type="button" className="btn-link danger" onClick={() => deactivate(t._id)}>Deactivate</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && (
                <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>{modal === 'create' ? 'Add request type' : 'Edit request type'}</h3>
                        <label className="field"><span>English label *</span><input value={form.labelEn} onChange={(e) => setForm({ ...form, labelEn: e.target.value })} placeholder="e.g. Short Leave" /></label>
                        <label className="field"><span>Arabic label (optional)</span><input value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} placeholder="نوع الطلب" /></label>
                        <label className="field"><span>Code (optional)</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="short_leave" /></label>
                        <label className="field"><span>Order</span><input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></label>
                        <label className="field checkbox"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /><span>Active (show in form)</span></label>
                        <label className="field checkbox"><input type="checkbox" checked={form.requiresProof} onChange={(e) => setForm({ ...form, requiresProof: e.target.checked })} /><span>Requires proof document</span></label>
                        <label className="field checkbox"><input type="checkbox" checked={form.useDateRange} onChange={(e) => setForm({ ...form, useDateRange: e.target.checked })} /><span>Use date range (Start/End date instead of single date + times)</span></label>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => !saving && setModal(null)} disabled={saving}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAttendanceRequestTypesPage;
