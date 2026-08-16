import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpMonthConfigs, createPlpMonthConfig, updatePlpMonthConfig,
    publishPlpMonthConfig, closePlpMonthConfig,
    selectPlpConfigs, selectPlpLoading, selectPlpError, clearPlpError,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const THEMES = ['confidence', 'hope', 'wisdom'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const blank = { month: '', theme: 'confidence', minEvidenceCount: 2 };

export default function PlpAdminConfigPage() {
    const dispatch = useDispatch();
    const configs = useSelector(selectPlpConfigs);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ ...blank });

    useEffect(() => { dispatch(fetchPlpMonthConfigs({ academicYear })); }, [dispatch, academicYear]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);

    const open = (cfg = null) => {
        setEditId(cfg?._id || null);
        setForm(cfg ? { month: cfg.month, theme: cfg.theme, minEvidenceCount: cfg.minEvidenceCount } : { ...blank });
        setShowModal(true);
    };

    const save = async () => {
        const payload = { ...form, academicYear, month: Number(form.month) };
        const action = editId
            ? await dispatch(updatePlpMonthConfig({ id: editId, data: payload }))
            : await dispatch(createPlpMonthConfig(payload));
        if (!action.error) { setShowModal(false); toast.success('Saved'); }
    };

    const publish = async (id) => {
        const r = await dispatch(publishPlpMonthConfig(id));
        if (!r.error) toast.success('Published');
    };

    const close = async (id) => {
        if (!window.confirm('Close this month? Records will be locked.')) return;
        const r = await dispatch(closePlpMonthConfig(id));
        if (!r.error) toast.success('Month closed');
    };

    return (
        <div className="plp-page">
            <div className="plp-header">
                <h1>PLP – Monthly Character Config</h1>
                <button className="btn btn-primary" onClick={() => open()}>+ New Month</button>
            </div>
            {loading && <div className="plp-loading">Loading…</div>}
            {configs.length === 0 && !loading && <div className="plp-empty">No monthly configs yet for {academicYear}.</div>}
            <div className="plp-grid">
                {configs.map((c) => (
                    <div key={c._id} className="plp-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h3>{MONTHS[c.month - 1]} – {c.theme.charAt(0).toUpperCase() + c.theme.slice(1)}</h3>
                            <span className={`plp-badge plp-badge-${c.status}`}>{c.status}</span>
                        </div>
                        <p>{c.academicYear} · Min evidence: {c.minEvidenceCount}</p>
                        <div className="plp-action-row">
                            {c.status === 'draft' && (
                                <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => open(c)}>Edit</button>
                                    <button className="btn btn-primary btn-sm" onClick={() => publish(c._id)}>Publish</button>
                                </>
                            )}
                            {c.status === 'published' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => close(c._id)}>Close Month</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="plp-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="plp-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editId ? 'Edit' : 'New'} Monthly Config</h2>
                        <div className="plp-form-group">
                            <label>Month</label>
                            <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
                                <option value="">Select month</option>
                                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Character Theme</label>
                            <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                                {THEMES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Min Evidence Count</label>
                            <input type="number" min={1} max={10} value={form.minEvidenceCount} onChange={(e) => setForm({ ...form, minEvidenceCount: Number(e.target.value) })} />
                        </div>
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={save}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
