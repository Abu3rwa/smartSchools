import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import sbrService from '../../../services/sbrService';
import './SBRConfigPage.css';

const defaultSpecialCodes = () => [{ code: 'NA', label: 'Not Assessed', labelAr: '' }];

const normalizeLevel = (level, fallbackValue = 1) => ({
    value: Number(level?.value ?? fallbackValue),
    label: String(level?.label || '').trim(),
    labelAr: String(level?.labelAr || '').trim(),
    description: String(level?.description || '').trim(),
    minPercent: Number(level?.minPercent ?? 0),
    maxPercent: Number(level?.maxPercent ?? 100),
    color: String(level?.color || '').trim()
});

const normalizeCode = (code) => ({
    code: String(code?.code || '').trim().toUpperCase(),
    label: String(code?.label || '').trim(),
    labelAr: String(code?.labelAr || '').trim()
});

const createInitialForm = () => ({
    name: '',
    description: '',
    levels: sbrService.getDefaultLevels().map((level) => normalizeLevel(level, level.value)),
    specialCodes: defaultSpecialCodes()
});

const SBRConfigPage = () => {
    const [scales, setScales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(createInitialForm);
    const [editingScaleId, setEditingScaleId] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const activeScales = useMemo(
        () => scales.filter((scale) => scale.isActive !== false),
        [scales]
    );

    const loadScales = async () => {
        try {
            setLoading(true);
            const items = await sbrService.getScales(true);
            setScales(items);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to load SBR scales');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadScales();
    }, []);

    const updateFormLevel = (rowIndex, field, value) => {
        setForm((prev) => {
            const nextLevels = [...prev.levels];
            const row = { ...nextLevels[rowIndex] };
            row[field] = ['value', 'minPercent', 'maxPercent'].includes(field) ? Number(value) : value;
            nextLevels[rowIndex] = row;
            return { ...prev, levels: nextLevels };
        });
    };

    const updateFormSpecialCode = (rowIndex, field, value) => {
        setForm((prev) => {
            const nextCodes = [...prev.specialCodes];
            const row = { ...nextCodes[rowIndex] };
            row[field] = field === 'code' ? String(value).toUpperCase() : value;
            nextCodes[rowIndex] = row;
            return { ...prev, specialCodes: nextCodes };
        });
    };

    const addFormLevel = () => {
        setForm((prev) => ({
            ...prev,
            levels: [...prev.levels, normalizeLevel({ value: 1, label: 'New Level', minPercent: 0, maxPercent: 0 }, 1)]
        }));
    };

    const removeFormLevel = (rowIndex) => {
        setForm((prev) => {
            if (prev.levels.length <= 1) return prev;
            return {
                ...prev,
                levels: prev.levels.filter((_, idx) => idx !== rowIndex)
            };
        });
    };

    const addFormSpecialCode = () => {
        setForm((prev) => ({
            ...prev,
            specialCodes: [...prev.specialCodes, { code: '', label: '', labelAr: '' }]
        }));
    };

    const removeFormSpecialCode = (rowIndex) => {
        setForm((prev) => ({
            ...prev,
            specialCodes: prev.specialCodes.filter((_, idx) => idx !== rowIndex)
        }));
    };

    const beginEditScale = (scale) => {
        setEditingScaleId(scale.id);
        setEditForm({
            name: scale.name || '',
            description: scale.description || '',
            levels: (scale.levels || []).map((level, idx) => normalizeLevel(level, idx + 1)),
            specialCodes: (scale.specialCodes || defaultSpecialCodes()).map(normalizeCode)
        });
    };

    const cancelEditScale = () => {
        setEditingScaleId(null);
        setEditForm(null);
    };

    const updateEditLevel = (rowIndex, field, value) => {
        setEditForm((prev) => {
            const nextLevels = [...(prev?.levels || [])];
            const row = { ...nextLevels[rowIndex] };
            row[field] = ['value', 'minPercent', 'maxPercent'].includes(field) ? Number(value) : value;
            nextLevels[rowIndex] = row;
            return { ...prev, levels: nextLevels };
        });
    };

    const updateEditSpecialCode = (rowIndex, field, value) => {
        setEditForm((prev) => {
            const nextCodes = [...(prev?.specialCodes || [])];
            const row = { ...nextCodes[rowIndex] };
            row[field] = field === 'code' ? String(value).toUpperCase() : value;
            nextCodes[rowIndex] = row;
            return { ...prev, specialCodes: nextCodes };
        });
    };

    const addEditLevel = () => {
        setEditForm((prev) => ({
            ...prev,
            levels: [...(prev?.levels || []), normalizeLevel({ value: 1, label: 'New Level', minPercent: 0, maxPercent: 0 }, 1)]
        }));
    };

    const removeEditLevel = (rowIndex) => {
        setEditForm((prev) => {
            if ((prev?.levels || []).length <= 1) return prev;
            return {
                ...prev,
                levels: prev.levels.filter((_, idx) => idx !== rowIndex)
            };
        });
    };

    const addEditSpecialCode = () => {
        setEditForm((prev) => ({
            ...prev,
            specialCodes: [...(prev?.specialCodes || []), { code: '', label: '', labelAr: '' }]
        }));
    };

    const removeEditSpecialCode = (rowIndex) => {
        setEditForm((prev) => ({
            ...prev,
            specialCodes: (prev?.specialCodes || []).filter((_, idx) => idx !== rowIndex)
        }));
    };

    const handleCreate = async (event) => {
        event.preventDefault();
        const name = form.name.trim();
        if (!name) {
            toast.error('Scale name is required');
            return;
        }

        try {
            setSaving(true);
            await sbrService.createScale({
                name,
                description: form.description.trim(),
                levels: (form.levels || []).map((level, idx) => normalizeLevel(level, idx + 1)),
                specialCodes: (form.specialCodes || []).map(normalizeCode)
            });
            setForm(createInitialForm());
            toast.success('Scale created');
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to create scale');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (scaleId) => {
        if (!editForm) return;

        try {
            setSaving(true);
            await sbrService.updateScale(scaleId, {
                name: String(editForm.name || '').trim(),
                description: String(editForm.description || '').trim(),
                levels: (editForm.levels || []).map((level, idx) => normalizeLevel(level, idx + 1)),
                specialCodes: (editForm.specialCodes || []).map(normalizeCode)
            });
            toast.success('Scale updated');
            cancelEditScale();
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to update scale');
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (id) => {
        try {
            await sbrService.setDefaultScale(id);
            toast.success('Default scale updated');
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to set default scale');
        }
    };

    const handleDelete = async (id) => {
        const confirmed = window.confirm('Delete this scale? This cannot be undone.');
        if (!confirmed) return;

        try {
            await sbrService.deleteScale(id);
            toast.success('Scale deleted');
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to delete scale');
        }
    };

    return (
        <div className="sbr-config-page">
            <div className="sbr-config-header">
                <h2>SBR Scale Configuration</h2>
                <p>Set up standards-based grading scales used by report card generation.</p>
            </div>

            <form className="sbr-config-create card" onSubmit={handleCreate}>
                <h3>Create New Scale</h3>
                <div className="sbr-config-grid">
                    <div className="form-group">
                        <label htmlFor="scaleName">Name</label>
                        <input
                            id="scaleName"
                            value={form.name}
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="Example: 4-Level Mastery"
                            maxLength={100}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="scaleDescription">Description</label>
                        <input
                            id="scaleDescription"
                            value={form.description}
                            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="Optional"
                            maxLength={240}
                        />
                    </div>
                </div>
                <div className="sbr-editor-block">
                    <div className="sbr-editor-head">
                        <h4>Levels</h4>
                        <button type="button" className="btn-secondary" onClick={addFormLevel}>Add Level</button>
                    </div>
                    {(form.levels || []).map((level, idx) => (
                        <div className="sbr-editor-row" key={`create-level-${idx}`}>
                            <input type="number" value={level.value} onChange={(event) => updateFormLevel(idx, 'value', event.target.value)} placeholder="Value" />
                            <input value={level.label} onChange={(event) => updateFormLevel(idx, 'label', event.target.value)} placeholder="Label" />
                            <input type="number" value={level.minPercent} onChange={(event) => updateFormLevel(idx, 'minPercent', event.target.value)} placeholder="Min %" />
                            <input type="number" value={level.maxPercent} onChange={(event) => updateFormLevel(idx, 'maxPercent', event.target.value)} placeholder="Max %" />
                            <button type="button" className="btn-danger" onClick={() => removeFormLevel(idx)} disabled={(form.levels || []).length <= 1}>Remove</button>
                        </div>
                    ))}
                </div>
                <div className="sbr-editor-block">
                    <div className="sbr-editor-head">
                        <h4>Special Codes</h4>
                        <button type="button" className="btn-secondary" onClick={addFormSpecialCode}>Add Code</button>
                    </div>
                    {(form.specialCodes || []).map((code, idx) => (
                        <div className="sbr-editor-row" key={`create-code-${idx}`}>
                            <input value={code.code} onChange={(event) => updateFormSpecialCode(idx, 'code', event.target.value)} placeholder="Code" maxLength={10} />
                            <input value={code.label} onChange={(event) => updateFormSpecialCode(idx, 'label', event.target.value)} placeholder="Label" />
                            <input value={code.labelAr || ''} onChange={(event) => updateFormSpecialCode(idx, 'labelAr', event.target.value)} placeholder="Arabic label (optional)" />
                            <button type="button" className="btn-danger" onClick={() => removeFormSpecialCode(idx)} disabled={(form.specialCodes || []).length <= 1}>Remove</button>
                        </div>
                    ))}
                </div>
                <div className="sbr-inline-note">
                    Define levels and special codes directly here. Changes are validated on save.
                </div>
                <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Creating...' : 'Create Scale'}
                </button>
            </form>

            <div className="card sbr-scale-list">
                <h3>Configured Scales ({activeScales.length})</h3>
                {loading ? (
                    <div className="sbr-muted">Loading scales...</div>
                ) : activeScales.length === 0 ? (
                    <div className="sbr-muted">No scales found.</div>
                ) : (
                    <div className="sbr-scale-grid">
                        {activeScales.map((scale) => (
                            <article key={scale.id} className="sbr-scale-card">
                                {editingScaleId === scale.id && editForm ? (
                                    <>
                                        <div className="sbr-scale-card-header">
                                            <h4>Editing Scale</h4>
                                            {scale.isDefault && <span className="sbr-badge">Default</span>}
                                        </div>
                                        <div className="sbr-config-grid">
                                            <div className="form-group">
                                                <label>Name</label>
                                                <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label>Description</label>
                                                <input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="sbr-editor-block">
                                            <div className="sbr-editor-head">
                                                <h4>Levels</h4>
                                                <button type="button" className="btn-secondary" onClick={addEditLevel}>Add Level</button>
                                            </div>
                                            {(editForm.levels || []).map((level, idx) => (
                                                <div className="sbr-editor-row" key={`edit-level-${scale.id}-${idx}`}>
                                                    <input type="number" value={level.value} onChange={(event) => updateEditLevel(idx, 'value', event.target.value)} placeholder="Value" />
                                                    <input value={level.label} onChange={(event) => updateEditLevel(idx, 'label', event.target.value)} placeholder="Label" />
                                                    <input type="number" value={level.minPercent} onChange={(event) => updateEditLevel(idx, 'minPercent', event.target.value)} placeholder="Min %" />
                                                    <input type="number" value={level.maxPercent} onChange={(event) => updateEditLevel(idx, 'maxPercent', event.target.value)} placeholder="Max %" />
                                                    <button type="button" className="btn-danger" onClick={() => removeEditLevel(idx)} disabled={(editForm.levels || []).length <= 1}>Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="sbr-editor-block">
                                            <div className="sbr-editor-head">
                                                <h4>Special Codes</h4>
                                                <button type="button" className="btn-secondary" onClick={addEditSpecialCode}>Add Code</button>
                                            </div>
                                            {(editForm.specialCodes || []).map((code, idx) => (
                                                <div className="sbr-editor-row" key={`edit-code-${scale.id}-${idx}`}>
                                                    <input value={code.code} onChange={(event) => updateEditSpecialCode(idx, 'code', event.target.value)} placeholder="Code" maxLength={10} />
                                                    <input value={code.label} onChange={(event) => updateEditSpecialCode(idx, 'label', event.target.value)} placeholder="Label" />
                                                    <input value={code.labelAr || ''} onChange={(event) => updateEditSpecialCode(idx, 'labelAr', event.target.value)} placeholder="Arabic label (optional)" />
                                                    <button type="button" className="btn-danger" onClick={() => removeEditSpecialCode(idx)} disabled={(editForm.specialCodes || []).length <= 1}>Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="sbr-scale-actions">
                                            <button type="button" className="btn-primary" onClick={() => handleSaveEdit(scale.id)} disabled={saving}>Save Changes</button>
                                            <button type="button" className="btn-secondary" onClick={cancelEditScale}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="sbr-scale-card-header">
                                            <h4>{scale.name}</h4>
                                            {scale.isDefault && <span className="sbr-badge">Default</span>}
                                        </div>
                                        {scale.description && <p className="sbr-scale-description">{scale.description}</p>}
                                        <div className="sbr-levels">
                                            {(scale.levels || []).map((level) => (
                                                <div key={`${scale.id}-${level.value}`} className="sbr-level-row">
                                                    <span className="level-pill">{level.value}</span>
                                                    <span>{level.label}</span>
                                                    <span className="sbr-muted">
                                                        {level.minPercent}% - {level.maxPercent}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        {(scale.specialCodes || []).length > 0 && (
                                            <div className="sbr-codes-list">
                                                {(scale.specialCodes || []).map((code) => (
                                                    <div key={`${scale.id}-${code.code}`} className="sbr-code-chip">
                                                        <strong>{code.code}</strong> {code.label}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="sbr-scale-actions">
                                            <button type="button" className="btn-secondary" onClick={() => beginEditScale(scale)}>
                                                Edit
                                            </button>
                                            {!scale.isDefault && (
                                                <button type="button" className="btn-secondary" onClick={() => handleSetDefault(scale.id)}>
                                                    Set Default
                                                </button>
                                            )}
                                            {!scale.isDefault && (
                                                <button type="button" className="btn-danger" onClick={() => handleDelete(scale.id)}>
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SBRConfigPage;
