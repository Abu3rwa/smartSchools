import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import sbrService from '../../../services/sbrService';
import './SBRConfigPage.css';

const defaultSpecialCodes = (t) => [{
    code: 'NA',
    label: t('gradebook:sbrConfig.defaults.notAssessed'),
    labelAr: ''
}];

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

const createInitialForm = (t) => ({
    name: '',
    description: '',
    levels: sbrService.getDefaultLevels().map((level) => normalizeLevel(level, level.value)),
    specialCodes: defaultSpecialCodes(t)
});

const SBRConfigPage = () => {
    const { t } = useTranslation(['gradebook']);
    const [scales, setScales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(createInitialForm(t));
    const [editingScaleId, setEditingScaleId] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const activeScales = useMemo(
        () => scales.filter((scale) => scale.isActive !== false),
        [scales]
    );

    const loadScales = useCallback(async () => {
        try {
            setLoading(true);
            const items = await sbrService.getScales(true);
            setScales(items);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('gradebook:sbrConfig.toast.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadScales();
    }, [loadScales]);

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
            levels: [...prev.levels, normalizeLevel({
                value: 1,
                label: t('gradebook:sbrConfig.defaults.newLevelLabel'),
                minPercent: 0,
                maxPercent: 0
            }, 1)]
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
            specialCodes: (scale.specialCodes || defaultSpecialCodes(t)).map(normalizeCode)
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
            levels: [...(prev?.levels || []), normalizeLevel({
                value: 1,
                label: t('gradebook:sbrConfig.defaults.newLevelLabel'),
                minPercent: 0,
                maxPercent: 0
            }, 1)]
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
            toast.error(t('gradebook:sbrConfig.toast.nameRequired'));
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
            setForm(createInitialForm(t));
            toast.success(t('gradebook:sbrConfig.toast.created'));
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('gradebook:sbrConfig.toast.createFailed'));
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
            toast.success(t('gradebook:sbrConfig.toast.updated'));
            cancelEditScale();
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('gradebook:sbrConfig.toast.updateFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (id) => {
        try {
            await sbrService.setDefaultScale(id);
            toast.success(t('gradebook:sbrConfig.toast.defaultUpdated'));
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('gradebook:sbrConfig.toast.defaultUpdateFailed'));
        }
    };

    const handleDelete = async (id) => {
        const confirmed = window.confirm(t('gradebook:sbrConfig.confirm.delete'));
        if (!confirmed) return;

        try {
            await sbrService.deleteScale(id);
            toast.success(t('gradebook:sbrConfig.toast.deleted'));
            await loadScales();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('gradebook:sbrConfig.toast.deleteFailed'));
        }
    };

    return (
        <div className="sbr-config-page">
            <div className="sbr-config-header">
                <h2>{t('gradebook:sbrConfig.header.title')}</h2>
                <p>{t('gradebook:sbrConfig.header.subtitle')}</p>
            </div>

            <form className="sbr-config-create card" onSubmit={handleCreate}>
                <h3>{t('gradebook:sbrConfig.create.title')}</h3>
                <div className="sbr-config-grid">
                    <div className="form-group">
                        <label htmlFor="scaleName">{t('gradebook:sbrConfig.fields.name')}</label>
                        <input
                            id="scaleName"
                            value={form.name}
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder={t('gradebook:sbrConfig.placeholders.name')}
                            maxLength={100}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="scaleDescription">{t('gradebook:sbrConfig.fields.description')}</label>
                        <input
                            id="scaleDescription"
                            value={form.description}
                            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder={t('gradebook:sbrConfig.placeholders.optional')}
                            maxLength={240}
                        />
                    </div>
                </div>
                <div className="sbr-editor-block">
                    <div className="sbr-editor-head">
                        <h4>{t('gradebook:sbrConfig.sections.levels')}</h4>
                        <button type="button" className="btn-secondary" onClick={addFormLevel}>{t('gradebook:sbrConfig.actions.addLevel')}</button>
                    </div>
                    {(form.levels || []).map((level, idx) => (
                        <div className="sbr-editor-row" key={`create-level-${idx}`}>
                            <input type="number" value={level.value} onChange={(event) => updateFormLevel(idx, 'value', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.value')} />
                            <input value={level.label} onChange={(event) => updateFormLevel(idx, 'label', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.label')} />
                            <input type="number" value={level.minPercent} onChange={(event) => updateFormLevel(idx, 'minPercent', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.minPercent')} />
                            <input type="number" value={level.maxPercent} onChange={(event) => updateFormLevel(idx, 'maxPercent', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.maxPercent')} />
                            <button type="button" className="btn-danger" onClick={() => removeFormLevel(idx)} disabled={(form.levels || []).length <= 1}>{t('gradebook:sbrConfig.actions.remove')}</button>
                        </div>
                    ))}
                </div>
                <div className="sbr-editor-block">
                    <div className="sbr-editor-head">
                        <h4>{t('gradebook:sbrConfig.sections.specialCodes')}</h4>
                        <button type="button" className="btn-secondary" onClick={addFormSpecialCode}>{t('gradebook:sbrConfig.actions.addCode')}</button>
                    </div>
                    {(form.specialCodes || []).map((code, idx) => (
                        <div className="sbr-editor-row" key={`create-code-${idx}`}>
                            <input value={code.code} onChange={(event) => updateFormSpecialCode(idx, 'code', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.code')} maxLength={10} />
                            <input value={code.label} onChange={(event) => updateFormSpecialCode(idx, 'label', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.label')} />
                            <input value={code.labelAr || ''} onChange={(event) => updateFormSpecialCode(idx, 'labelAr', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.labelAr')} />
                            <button type="button" className="btn-danger" onClick={() => removeFormSpecialCode(idx)} disabled={(form.specialCodes || []).length <= 1}>{t('gradebook:sbrConfig.actions.remove')}</button>
                        </div>
                    ))}
                </div>
                <div className="sbr-inline-note">
                    {t('gradebook:sbrConfig.note')}
                </div>
                <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? t('gradebook:sbrConfig.actions.creating') : t('gradebook:sbrConfig.actions.createScale')}
                </button>
            </form>

            <div className="card sbr-scale-list">
                <h3>{t('gradebook:sbrConfig.list.title', { count: activeScales.length })}</h3>
                {loading ? (
                    <div className="sbr-muted">{t('gradebook:sbrConfig.list.loading')}</div>
                ) : activeScales.length === 0 ? (
                    <div className="sbr-muted">{t('gradebook:sbrConfig.list.empty')}</div>
                ) : (
                    <div className="sbr-scale-grid">
                        {activeScales.map((scale) => (
                            <article key={scale.id} className="sbr-scale-card">
                                {editingScaleId === scale.id && editForm ? (
                                    <>
                                        <div className="sbr-scale-card-header">
                                            <h4>{t('gradebook:sbrConfig.list.editingScale')}</h4>
                                            {scale.isDefault && <span className="sbr-badge">{t('gradebook:sbrConfig.list.defaultBadge')}</span>}
                                        </div>
                                        <div className="sbr-config-grid">
                                            <div className="form-group">
                                                <label>{t('gradebook:sbrConfig.fields.name')}</label>
                                                <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
                                            </div>
                                            <div className="form-group">
                                                <label>{t('gradebook:sbrConfig.fields.description')}</label>
                                                <input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="sbr-editor-block">
                                            <div className="sbr-editor-head">
                                                <h4>{t('gradebook:sbrConfig.sections.levels')}</h4>
                                                <button type="button" className="btn-secondary" onClick={addEditLevel}>{t('gradebook:sbrConfig.actions.addLevel')}</button>
                                            </div>
                                            {(editForm.levels || []).map((level, idx) => (
                                                <div className="sbr-editor-row" key={`edit-level-${scale.id}-${idx}`}>
                                                    <input type="number" value={level.value} onChange={(event) => updateEditLevel(idx, 'value', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.value')} />
                                                    <input value={level.label} onChange={(event) => updateEditLevel(idx, 'label', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.label')} />
                                                    <input type="number" value={level.minPercent} onChange={(event) => updateEditLevel(idx, 'minPercent', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.minPercent')} />
                                                    <input type="number" value={level.maxPercent} onChange={(event) => updateEditLevel(idx, 'maxPercent', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.maxPercent')} />
                                                    <button type="button" className="btn-danger" onClick={() => removeEditLevel(idx)} disabled={(editForm.levels || []).length <= 1}>{t('gradebook:sbrConfig.actions.remove')}</button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="sbr-editor-block">
                                            <div className="sbr-editor-head">
                                                <h4>{t('gradebook:sbrConfig.sections.specialCodes')}</h4>
                                                <button type="button" className="btn-secondary" onClick={addEditSpecialCode}>{t('gradebook:sbrConfig.actions.addCode')}</button>
                                            </div>
                                            {(editForm.specialCodes || []).map((code, idx) => (
                                                <div className="sbr-editor-row" key={`edit-code-${scale.id}-${idx}`}>
                                                    <input value={code.code} onChange={(event) => updateEditSpecialCode(idx, 'code', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.code')} maxLength={10} />
                                                    <input value={code.label} onChange={(event) => updateEditSpecialCode(idx, 'label', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.label')} />
                                                    <input value={code.labelAr || ''} onChange={(event) => updateEditSpecialCode(idx, 'labelAr', event.target.value)} placeholder={t('gradebook:sbrConfig.placeholders.labelAr')} />
                                                    <button type="button" className="btn-danger" onClick={() => removeEditSpecialCode(idx)} disabled={(editForm.specialCodes || []).length <= 1}>{t('gradebook:sbrConfig.actions.remove')}</button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="sbr-scale-actions">
                                            <button type="button" className="btn-primary" onClick={() => handleSaveEdit(scale.id)} disabled={saving}>{t('gradebook:sbrConfig.actions.saveChanges')}</button>
                                            <button type="button" className="btn-secondary" onClick={cancelEditScale}>{t('gradebook:sbrConfig.actions.cancel')}</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="sbr-scale-card-header">
                                            <h4>{scale.name}</h4>
                                            {scale.isDefault && <span className="sbr-badge">{t('gradebook:sbrConfig.list.defaultBadge')}</span>}
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
                                                {t('gradebook:sbrConfig.actions.edit')}
                                            </button>
                                            {!scale.isDefault && (
                                                <button type="button" className="btn-secondary" onClick={() => handleSetDefault(scale.id)}>
                                                    {t('gradebook:sbrConfig.actions.setDefault')}
                                                </button>
                                            )}
                                            {!scale.isDefault && (
                                                <button type="button" className="btn-danger" onClick={() => handleDelete(scale.id)}>
                                                    {t('gradebook:sbrConfig.actions.delete')}
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
