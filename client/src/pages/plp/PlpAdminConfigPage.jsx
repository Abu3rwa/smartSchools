import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpMonthConfigs, createPlpMonthConfig, updatePlpMonthConfig,
    publishPlpMonthConfig, closePlpMonthConfig,
    selectPlpConfigs, selectPlpLoading, selectPlpError, clearPlpError,
    fetchPlpTraits, createPlpTrait, updatePlpTrait, setPlpTraitActive, seedPlpTraits,
    selectPlpTraits, selectPlpTraitLoading, selectPlpTraitError, clearPlpTraitError,
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

const blankTrait = { name: '', code: '', description: '', selSkills: [], isActive: true, displayOrder: 0, themeCode: '' };

export default function PlpAdminConfigPage() {
    const dispatch = useDispatch();
    const configs = useSelector(selectPlpConfigs);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const traits = useSelector(selectPlpTraits);
    const traitLoading = useSelector(selectPlpTraitLoading);
    const traitError = useSelector(selectPlpTraitError);

    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ ...blank });
    const [traitForm, setTraitForm] = useState({ ...blankTrait });
    const [showTraitModal, setShowTraitModal] = useState(false);
    const [skillInput, setSkillInput] = useState('');

    useEffect(() => { dispatch(fetchPlpMonthConfigs({ academicYear })); }, [dispatch, academicYear]);
    useEffect(() => { dispatch(fetchPlpTraits()); }, [dispatch]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);
    useEffect(() => { if (traitError) { toast.error(traitError); dispatch(clearPlpTraitError()); } }, [traitError, dispatch]);

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

    const openTrait = (trait = null) => {
        setEditId(trait?._id || null);
        setTraitForm(trait ? {
            name: trait.name,
            code: trait.code,
            description: trait.description || '',
            selSkills: trait.selSkills || [],
            isActive: trait.isActive,
            displayOrder: trait.displayOrder || 0,
            themeCode: trait.themeCode || '',
        } : { ...blankTrait });
        setSkillInput('');
        setShowTraitModal(true);
    };

    const saveTrait = async () => {
        if (!traitForm.name.trim() || !traitForm.code.trim()) {
            toast.error('Name and code are required');
            return;
        }
        const payload = {
            name: traitForm.name.trim(),
            code: traitForm.code.trim().toUpperCase(),
            description: traitForm.description.trim(),
            selSkills: traitForm.selSkills,
            isActive: traitForm.isActive,
            displayOrder: Number(traitForm.displayOrder) || 0,
            themeCode: traitForm.themeCode.trim(),
        };
        const action = editId
            ? await dispatch(updatePlpTrait({ id: editId, data: payload }))
            : await dispatch(createPlpTrait(payload));
        if (!action.error) { setShowTraitModal(false); toast.success('Trait saved'); }
    };

    const toggleTraitActive = async (id, current) => {
        const r = await dispatch(setPlpTraitActive({ id, isActive: !current }));
        if (!r.error) toast.success(current ? 'Trait deactivated' : 'Trait activated');
    };

    const handleSeed = async () => {
        const r = await dispatch(seedPlpTraits());
        if (!r.error) toast.success('Starter traits seeded');
    };

    const addSkill = () => {
        const val = skillInput.trim();
        if (!val) return;
        if (traitForm.selSkills.includes(val)) { setSkillInput(''); return; }
        setTraitForm({ ...traitForm, selSkills: [...traitForm.selSkills, val] });
        setSkillInput('');
    };

    const removeSkill = (skill) => {
        setTraitForm({ ...traitForm, selSkills: traitForm.selSkills.filter((s) => s !== skill) });
    };

    const handleSkillKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addSkill(); }
        if (e.key === 'Backspace' && !skillInput && traitForm.selSkills.length > 0) {
            setTraitForm({ ...traitForm, selSkills: traitForm.selSkills.slice(0, -1) });
        }
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

            <div style={{ marginTop: 40, borderTop: '1px solid var(--border-color)', paddingTop: 28 }}>
                <div className="plp-header" style={{ marginBottom: 12 }}>
                    <h1>PLP – Character Trait Management</h1>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {traits.length === 0 && (
                            <button className="btn btn-secondary" onClick={handleSeed} disabled={traitLoading}>
                                {traitLoading ? 'Seeding…' : 'Seed Starter Traits'}
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={() => openTrait()}>+ New Trait</button>
                    </div>
                </div>
                {traitLoading && <div className="plp-loading">Loading traits…</div>}
                {traits.length === 0 && !traitLoading && (
                    <div className="plp-empty">No traits configured yet. Seed starter traits or create a new one.</div>
                )}
                <div className="plp-section" style={{ marginTop: 0 }}>
                    <table className="plp-table">
                        <thead>
                            <tr>
                                <th>Order</th>
                                <th>Name</th>
                                <th>Code</th>
                                <th>Theme</th>
                                <th>SEL Skills</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {traits.map((t) => (
                                <tr key={t._id}>
                                    <td>{t.displayOrder}</td>
                                    <td>{t.name}</td>
                                    <td><code>{t.code}</code></td>
                                    <td>{t.themeCode ? t.themeCode.charAt(0).toUpperCase() + t.themeCode.slice(1) : '—'}</td>
                                    <td>
                                        {t.selSkills?.length
                                            ? t.selSkills.map((s) => (
                                                <span key={s} style={{ display: 'inline-block', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', marginRight: 4, marginBottom: 2 }}>
                                                    {s.replace(/_/g, ' ')}
                                                </span>
                                            ))
                                            : '—'}
                                    </td>
                                    <td>
                                        <span className={`plp-badge ${t.isActive ? 'plp-badge-published' : 'plp-badge-closed'}`}>
                                            {t.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => openTrait(t)}>Edit</button>
                                        <button className={`btn btn-sm ${t.isActive ? 'btn-secondary' : 'btn-primary'}`} style={{ marginLeft: 4 }} onClick={() => toggleTraitActive(t._id, t.isActive)}>
                                            {t.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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

            {showTraitModal && (
                <div className="plp-modal-overlay" onClick={() => setShowTraitModal(false)}>
                    <div className="plp-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editId ? 'Edit' : 'New'} Trait</h2>
                        <div className="plp-form-group">
                            <label>Name</label>
                            <input value={traitForm.name} onChange={(e) => setTraitForm({ ...traitForm, name: e.target.value })} placeholder="e.g. Confidence" />
                        </div>
                        <div className="plp-form-group">
                            <label>Code</label>
                            <input value={traitForm.code} onChange={(e) => setTraitForm({ ...traitForm, code: e.target.value.toUpperCase() })} placeholder="e.g. CONFIDENCE" />
                        </div>
                        <div className="plp-form-group">
                            <label>Description</label>
                            <textarea value={traitForm.description} onChange={(e) => setTraitForm({ ...traitForm, description: e.target.value })} placeholder="Optional description" />
                        </div>
                        <div className="plp-form-group">
                            <label>Theme</label>
                            <select value={traitForm.themeCode} onChange={(e) => setTraitForm({ ...traitForm, themeCode: e.target.value })}>
                                <option value="">—</option>
                                {THEMES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Display Order</label>
                            <input type="number" value={traitForm.displayOrder} onChange={(e) => setTraitForm({ ...traitForm, displayOrder: Number(e.target.value) })} />
                        </div>
                        <div className="plp-form-group">
                            <label>SEL Skills</label>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                <input
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    onKeyDown={handleSkillKeyDown}
                                    placeholder="Type skill and press Enter"
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={addSkill} type="button">Add</button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {traitForm.selSkills.map((s) => (
                                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem' }}>
                                        {s.replace(/_/g, ' ')}
                                        <button onClick={() => removeSkill(s)} type="button" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>×</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="plp-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" id="trait-active" checked={traitForm.isActive} onChange={(e) => setTraitForm({ ...traitForm, isActive: e.target.checked })} />
                            <label htmlFor="trait-active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
                        </div>
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowTraitModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveTrait}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
