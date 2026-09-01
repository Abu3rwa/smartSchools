import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpMonthConfigs, createPlpMonthConfig, updatePlpMonthConfig,
    publishPlpMonthConfig, closePlpMonthConfig,
    fetchPlpCycles, createPlpCycle, updatePlpCycle, publishPlpCycle, closePlpCycle, deletePlpCycle,
    selectPlpCycles, selectPlpConfigs, selectPlpLoading, selectPlpError, clearPlpError,
    fetchPlpTraits, createPlpTrait, updatePlpTrait, setPlpTraitActive, seedPlpTraits,
    selectPlpTraits, selectPlpTraitLoading, selectPlpTraitError, clearPlpTraitError,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const blank = { secondaryTrait: '' };

const blankCycle = {
    cycleCode: '',
    title: '',
    startDate: '',
    endDate: '',
    printOrder: 0,
    spotlightTraits: [],
    minEvidenceCount: 2,
};

const blankTrait = {
    name: '',
    code: '',
    description: '',
    month: '',
    isActive: true,
    displayOrder: 0,
};

export default function PlpAdminConfigPage() {
    const dispatch = useDispatch();
    const configs = useSelector(selectPlpConfigs);
    const cycles = useSelector(selectPlpCycles);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const traits = useSelector(selectPlpTraits);
    const traitLoading = useSelector(selectPlpTraitLoading);
    const traitError = useSelector(selectPlpTraitError);

    const [showModal, setShowModal] = useState(false);
    const [editConfigId, setEditConfigId] = useState(null);
    const [editTraitId, setEditTraitId] = useState(null);
    const [form, setForm] = useState({ ...blank });
    const [traitForm, setTraitForm] = useState({ name: '', month: '' });
    const [showTraitModal, setShowTraitModal] = useState(false);
    const [showCycleModal, setShowCycleModal] = useState(false);
    const [editCycleId, setEditCycleId] = useState(null);
    const [cycleForm, setCycleForm] = useState({ ...blankCycle });

    useEffect(() => { dispatch(fetchPlpMonthConfigs({ academicYear })); }, [dispatch, academicYear]);
    useEffect(() => { dispatch(fetchPlpCycles({ academicYear })); }, [dispatch, academicYear]);
    useEffect(() => { dispatch(fetchPlpTraits()); }, [dispatch]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);
    useEffect(() => { if (traitError) { toast.error(traitError); dispatch(clearPlpTraitError()); } }, [traitError, dispatch]);;

    const secondaryTraitOptions = traits.filter((t) => t.isActive);
    const traitById = new Map(traits.map((t) => [String(t._id), t]));
    // Sep-first school-year order
    const schoolYearOrder = (m) => (m >= 9 ? m - 9 : m + 3);
    const sortedConfigs = [...configs].sort((a, b) => schoolYearOrder(a.month) - schoolYearOrder(b.month));
    const sortedTraits = [...traits].sort((a, b) => schoolYearOrder(a.month || 0) - schoolYearOrder(b.month || 0));

    const open = (cfg = null) => {
        setEditConfigId(cfg?._id || null);
        setForm(cfg ? {
            secondaryTrait: cfg.secondaryTrait?._id || cfg.secondaryTrait || '',
        } : { ...blank });
        setShowModal(true);
    };

    const save = async () => {
        if (!form.secondaryTrait) { toast.error('Select a character trait'); return; }
        const trait = traitById.get(String(form.secondaryTrait));
        if (!trait?.month) { toast.error('The selected trait has no month assigned. Edit the trait first.'); return; }
        const payload = { academicYear, month: Number(trait.month), secondaryTrait: form.secondaryTrait };
        const action = editConfigId
            ? await dispatch(updatePlpMonthConfig({ id: editConfigId, data: payload }))
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

    const openCycle = (cycle = null) => {
        setEditCycleId(cycle?._id || null);
        setCycleForm(cycle ? {
            cycleCode: cycle.cycleCode || '',
            title: cycle.title || '',
            startDate: cycle.startDate ? String(cycle.startDate).slice(0, 10) : '',
            endDate: cycle.endDate ? String(cycle.endDate).slice(0, 10) : '',
            printOrder: cycle.printOrder || 0,
            spotlightTraits: (cycle.spotlightTraits || []).map((trait) => trait._id || trait),
            minEvidenceCount: cycle.minEvidenceCount || 2,
        } : { ...blankCycle });
        setShowCycleModal(true);
    };

    const saveCycle = async () => {
        if (!cycleForm.cycleCode.trim() || !cycleForm.title.trim() || !cycleForm.startDate || !cycleForm.endDate) {
            toast.error('Round code, title, start date, and end date are required');
            return;
        }
        if (cycleForm.startDate > cycleForm.endDate) {
            toast.error('Round start date must be before its end date');
            return;
        }
        const payload = {
            ...cycleForm,
            academicYear,
            cycleCode: cycleForm.cycleCode.trim().toUpperCase(),
            title: cycleForm.title.trim(),
            printOrder: Number(cycleForm.printOrder) || 0,
            minEvidenceCount: Number(cycleForm.minEvidenceCount) || 2,
        };
        const action = editCycleId
            ? await dispatch(updatePlpCycle({ id: editCycleId, data: payload }))
            : await dispatch(createPlpCycle(payload));
        if (!action.error) {
            setShowCycleModal(false);
            toast.success(`Round ${editCycleId ? 'updated' : 'created'}`);
        }
    };

    const publishCycle = async (id) => {
        const result = await dispatch(publishPlpCycle(id));
        if (!result.error) toast.success('Round published');
    };

    const closeCycle = async (id) => {
        if (!window.confirm('Close this Round? New records cannot use it.')) return;
        const result = await dispatch(closePlpCycle(id));
        if (!result.error) toast.success('Round closed');
    };

    const removeCycle = async (id) => {
        if (!window.confirm('Delete this draft Round? This cannot be undone.')) return;
        const result = await dispatch(deletePlpCycle(id));
        if (!result.error) toast.success('Round deleted');
        else toast.error(result.payload || 'Failed to delete Round');
    };

    const openTrait = (trait = null) => {
        setEditTraitId(trait?._id || null);
        setTraitForm(trait ? { name: trait.name, month: trait.month || '' } : { name: '', month: '' });
        setShowTraitModal(true);
    };

    const saveTrait = async () => {
        if (!traitForm.name.trim()) { toast.error('Trait name is required'); return; }
        if (!traitForm.month) { toast.error('Month is required'); return; }
        const code = traitForm.name.trim().toUpperCase().replace(/\s+/g, '_');
        const payload = { name: traitForm.name.trim(), code, month: Number(traitForm.month), isActive: true, displayOrder: 0 };
        const action = editTraitId
            ? await dispatch(updatePlpTrait({ id: editTraitId, data: payload }))
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

    return (
        <div className="plp-page">
            <div className="plp-header">
                <h1>PLP Rounds</h1>
                <button className="btn btn-primary" onClick={() => openCycle()}>+ New Round</button>
            </div>
            {cycles.length === 0 && <div className="plp-empty">No PLP Rounds configured for {academicYear}.</div>}
            <div className="plp-grid">
                {cycles.map((cycle) => (
                    <div key={cycle._id} className="plp-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <h3>{cycle.title}</h3>
                            <span className={`plp-badge plp-badge-${cycle.status}`}>{cycle.status}</span>
                        </div>
                        <p>{cycle.cycleCode} · {cycle.academicYear}</p>
                        <p>{new Date(cycle.startDate).toLocaleDateString()} – {new Date(cycle.endDate).toLocaleDateString()}</p>
                        <div className="plp-action-row">
                            {cycle.status === 'draft' && (
                                <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => openCycle(cycle)}>Edit</button>
                                    <button className="btn btn-primary btn-sm" onClick={() => publishCycle(cycle._id)}>Publish</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => removeCycle(cycle._id)}>Delete</button>
                                </>
                            )}
                            {cycle.status === 'published' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => closeCycle(cycle._id)}>Close Round</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="plp-header">
                <h1>PLP – Monthly Award Config</h1>
                <button className="btn btn-primary" onClick={() => open()}>+ New Month</button>
            </div>

            {loading && <div className="plp-loading">Loading…</div>}
            {configs.length === 0 && !loading && <div className="plp-empty">No monthly configs yet for {academicYear}.</div>}
            <div className="plp-grid">
                {sortedConfigs.map((c) => {
                    const traitName = c.secondaryTrait?.name || traitById.get(String(c.secondaryTrait || ''))?.name || '—';
                    return (
                    <div key={c._id} className="plp-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h3>{MONTHS[c.month - 1]} – {traitName}</h3>
                            <span className={`plp-badge plp-badge-${c.status}`}>{c.status}</span>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{c.academicYear}</p>
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
                    );
                })}
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
                                <th>Month</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTraits.map((t) => (
                                <tr key={t._id}>
                                    <td>{t.displayOrder}</td>
                                    <td>{t.name}</td>
                                    <td><code>{t.code}</code></td>
                                    <td>{t.month ? MONTHS[t.month - 1] : '—'}</td>
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
                        <h2>{editConfigId ? 'Edit' : 'New'} Monthly Config</h2>
                        <div className="plp-form-group">
                            <label>Character Trait <span style={{ color: 'var(--error)' }}>*</span></label>
                            <select
                                value={form.secondaryTrait}
                                onChange={(e) => setForm({ ...form, secondaryTrait: e.target.value })}
                            >
                                <option value="">Select trait</option>
                                {sortedTraits.filter((t) => t.isActive).map((t) => (
                                    <option key={t._id} value={t._id}>{t.name}{t.month ? ` – ${MONTHS[t.month - 1]}` : ''}</option>
                                ))}
                            </select>
                            {form.secondaryTrait && (() => {
                                const t = traitById.get(String(form.secondaryTrait));
                                return t?.month
                                    ? <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>This will configure {MONTHS[t.month - 1]} awards.</p>
                                    : <p style={{ margin: '6px 0 0', color: 'var(--warning)', fontSize: '0.82rem' }}>⚠ This trait has no month assigned. Edit the trait first.</p>;
                            })()}
                        </div>
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={save}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {showCycleModal && (
                <div className="plp-modal-overlay" onClick={() => setShowCycleModal(false)}>
                    <div className="plp-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editCycleId ? 'Edit' : 'New'} PLP Round</h2>
                        <div className="plp-form-group">
                            <label>Round Code</label>
                            <input value={cycleForm.cycleCode} onChange={(e) => setCycleForm({ ...cycleForm, cycleCode: e.target.value })} placeholder="e.g. R1" />
                        </div>
                        <div className="plp-form-group">
                            <label>Title</label>
                            <input value={cycleForm.title} onChange={(e) => setCycleForm({ ...cycleForm, title: e.target.value })} placeholder="e.g. First Character Round" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div className="plp-form-group">
                                <label>Start Date</label>
                                <input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })} />
                            </div>
                            <div className="plp-form-group">
                                <label>End Date</label>
                                <input type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} />
                            </div>
                        </div>
                        <div className="plp-form-group">
                            <label>Spotlight Traits</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                                {secondaryTraitOptions.map((trait) => {
                                    const traitId = String(trait._id);
                                    const checked = cycleForm.spotlightTraits.includes(traitId);
                                    return (
                                        <label key={traitId} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setCycleForm((prev) => ({
                                                    ...prev,
                                                    spotlightTraits: checked
                                                        ? prev.spotlightTraits.filter((id) => id !== traitId)
                                                        : [...prev.spotlightTraits, traitId],
                                                }))}
                                            />
                                            <span>{trait.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="plp-form-group">
                            <label>Minimum Evidence Count</label>
                            <input type="number" min={1} max={10} value={cycleForm.minEvidenceCount} onChange={(e) => setCycleForm({ ...cycleForm, minEvidenceCount: e.target.value })} />
                        </div>
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowCycleModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveCycle}>Save Round</button>
                        </div>
                    </div>
                </div>
            )}

            {showTraitModal && (
                <div className="plp-modal-overlay" onClick={() => setShowTraitModal(false)}>
                    <div className="plp-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{editTraitId ? 'Edit' : 'New'} Character Trait</h2>
                        <div className="plp-form-group">
                            <label>Trait Name <span style={{ color: 'var(--error)' }}>*</span></label>
                            <input
                                value={traitForm.name}
                                onChange={(e) => setTraitForm({ ...traitForm, name: e.target.value })}
                                placeholder="e.g. Curiosity"
                            />
                        </div>
                        <div className="plp-form-group">
                            <label>Month <span style={{ color: 'var(--error)' }}>*</span></label>
                            <select value={traitForm.month} onChange={(e) => setTraitForm({ ...traitForm, month: e.target.value })}>
                                <option value="">Select month</option>
                                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
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
