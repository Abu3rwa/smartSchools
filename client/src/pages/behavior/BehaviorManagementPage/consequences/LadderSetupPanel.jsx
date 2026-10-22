import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineSave, HiOutlineTrash } from 'react-icons/hi';
import {
    createBehaviorType,
    fetchBehaviorLadder,
    fetchBehaviorLadders,
    fetchBehaviorTemplates,
    fetchBehaviorTypes,
    replaceBehaviorLadder,
    saveBehaviorTemplate,
    updateBehaviorType
} from '../../../../api/behaviorApi';
import {
    BEHAVIOR_LEVELS,
    BEHAVIOR_OVERFLOW_BEHAVIORS,
    BEHAVIOR_ROLE_OPTIONS,
    BEHAVIOR_TASK_TYPES,
    SUBMITTABLE_TASK_TYPES
} from './consequenceConstants';
import { fillTemplateTokens } from './consequenceUtils';

const SAMPLE_VARIABLES = {
    studentFirstName: 'Maya',
    schoolName: 'Our School',
    behavior: 'Using a device without permission',
    date: '12 March 2027',
    consequence: 'Written reflection',
    stepNumber: 2,
    dueDate: '14 March 2027',
    dueLine: '\nThe work is due by 14 March 2027.',
    teacherFirstName: 'Sara'
};

const TEMPLATE_VARIABLES = Object.keys(SAMPLE_VARIABLES);

const blankStep = (order) => ({
    order,
    title: '',
    summary: '',
    consequences: [],
    actions: { emailParents: false, showInPortal: true, ccRoles: [] },
    requiresApproval: null,
    approverRoles: [],
    emailTemplateKey: 'parent-notification'
});

const blankConsequence = () => ({
    taskType: 'written_warning',
    title: '',
    instructions: '',
    dueInDays: 3,
    minWords: 0,
    toWhom: 'school',
    questions: [],
    verifierRule: null,
    requiresHumanDecision: false
});

const reorder = (steps, index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return steps;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((step, position) => ({ ...step, order: position + 1 }));
};

const LadderSetupPanel = ({ isAdmin, onTypesChanged }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [types, setTypes] = useState([]);
    const [ladders, setLadders] = useState([]);
    const [ladderId, setLadderId] = useState('');
    const [ladder, setLadder] = useState(null);
    const [saving, setSaving] = useState(false);
    const [newType, setNewType] = useState({ name: '', level: 1, description: '' });

    const loadCatalog = async () => {
        const [typePayload, ladderPayload] = await Promise.all([fetchBehaviorTypes(), fetchBehaviorLadders()]);
        setTypes(typePayload?.items || []);
        setLadders(ladderPayload?.items || []);
    };

    useEffect(() => {
        loadCatalog().catch(() => toast.error(t('ladder.loadFailed')));
        // Only on mount: the catalog is refreshed explicitly after each write.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!ladderId) {
            setLadder(null);
            return;
        }
        fetchBehaviorLadder(ladderId)
            .then((payload) => setLadder(payload?.ladder || null))
            .catch(() => toast.error(t('ladder.loadFailed')));
    }, [ladderId, t]);

    const grouped = useMemo(() => BEHAVIOR_LEVELS.map((level) => ({
        level,
        rows: types.filter((type) => type.level === level)
    })).filter((group) => group.rows.length), [types]);

    const addType = async () => {
        if (!newType.name.trim()) {
            toast.error(t('ladder.typeNameRequired'));
            return;
        }
        try {
            await createBehaviorType({
                name: newType.name.trim(),
                description: newType.description.trim() || undefined,
                level: Number(newType.level)
            });
            toast.success(t('ladder.typeCreated'));
            setNewType({ name: '', level: 1, description: '' });
            loadCatalog();
            onTypesChanged?.();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('ladder.typeCreateFailed'));
        }
    };

    const toggleTypeActive = async (type) => {
        try {
            await updateBehaviorType(type._id, { active: !type.active });
            loadCatalog();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('ladder.typeUpdateFailed'));
        }
    };

    const patchLadder = (patch) => setLadder((prev) => ({ ...prev, ...patch }));

    const patchStep = (index, patch) => setLadder((prev) => ({
        ...prev,
        steps: prev.steps.map((step, position) => (position === index ? { ...step, ...patch } : step))
    }));

    const patchConsequence = (stepIndex, consequenceIndex, patch) => patchStep(stepIndex, {
        consequences: (ladder.steps[stepIndex].consequences || []).map((row, position) => (
            position === consequenceIndex ? { ...row, ...patch } : row
        ))
    });

    const saveLadder = async () => {
        setSaving(true);
        try {
            const payload = await replaceBehaviorLadder(ladder._id, {
                name: ladder.name,
                behaviorType: ladder.behaviorType?._id || ladder.behaviorType || null,
                overflowBehavior: ladder.overflowBehavior,
                steps: ladder.steps.map((step, index) => ({
                    ...step,
                    order: index + 1,
                    consequences: (step.consequences || []).map((row) => ({
                        ...row,
                        minWords: SUBMITTABLE_TASK_TYPES.includes(row.taskType) ? row.minWords : 0
                    }))
                }))
            });
            toast.success(t('ladder.savedToast'));
            setLadder(payload?.ladder || ladder);
            loadCatalog();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('ladder.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('ladder.title')}</h2>
                    <p>{isAdmin ? t('ladder.subtitle') : t('setup.readOnlyHint')}</p>
                </div>
            </div>

            <div className="bc-sections" style={{ marginBottom: 'var(--spacing-md)' }}>
                {grouped.map((group) => (
                    <div className="bc-section" key={group.level}>
                        <h3>{t(`levels.level${group.level}`)}</h3>
                        <div className="bc-list">
                            {group.rows.map((type) => (
                                <div className="bc-list-item" key={type._id}>
                                    <div>
                                        <p className="bc-item-title">{type.name}</p>
                                        <p className="bc-item-sub">
                                            {type.ladderSummary
                                                ? t('ladder.stepsCount', { value: type.ladderSummary.stepCount })
                                                : t('ladder.noLadder')}
                                            {!type.active ? ` · ${t('common.inactive')}` : ''}
                                        </p>
                                    </div>
                                    <div className="bc-item-side">
                                        <div className="bc-actions">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                disabled={!type.ladder}
                                                onClick={() => setLadderId(type.ladder || '')}
                                            >
                                                {t('ladder.openLadder')}
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="bc-icon-btn"
                                                    onClick={() => toggleTypeActive(type)}
                                                >
                                                    {type.active ? t('common.disable') : t('common.enable')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {isAdmin && (
                <div className="bc-section" style={{ marginBottom: 'var(--spacing-md)' }}>
                    <h3>{t('ladder.newTypeTitle')}</h3>
                    <div className="bc-form-grid">
                        <div className="bc-field">
                            <label htmlFor="bc-type-name">{t('ladder.typeName')}</label>
                            <input
                                id="bc-type-name"
                                value={newType.name}
                                onChange={(event) => setNewType((prev) => ({ ...prev, name: event.target.value }))}
                                maxLength={200}
                            />
                        </div>
                        <div className="bc-field">
                            <label htmlFor="bc-type-level">{t('ladder.typeLevel')}</label>
                            <select
                                id="bc-type-level"
                                value={newType.level}
                                onChange={(event) => setNewType((prev) => ({ ...prev, level: Number(event.target.value) }))}
                            >
                                {BEHAVIOR_LEVELS.map((level) => (
                                    <option key={level} value={level}>{t(`levels.level${level}`)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="bc-field bc-field-full">
                            <label htmlFor="bc-type-description">{t('ladder.typeDescription')}</label>
                            <input
                                id="bc-type-description"
                                value={newType.description}
                                onChange={(event) => setNewType((prev) => ({ ...prev, description: event.target.value }))}
                                maxLength={1000}
                            />
                        </div>
                    </div>
                    <div className="bc-actions" style={{ marginTop: 'var(--spacing-sm)' }}>
                        <button type="button" className="btn btn-sm btn-primary" onClick={addType}>
                            <HiOutlinePlus /> {t('ladder.addType')}
                        </button>
                    </div>
                </div>
            )}

            <div className="bc-section">
                <div className="bc-panel-head">
                    <h3>{t('ladder.editorTitle')}</h3>
                    <select value={ladderId} onChange={(event) => setLadderId(event.target.value)}>
                        <option value="">{t('ladder.pickLadder')}</option>
                        {ladders.map((ladderRow) => (
                            <option key={ladderRow._id} value={ladderRow._id}>
                                {ladderRow.name}
                            </option>
                        ))}
                    </select>
                </div>

                {!ladder && <p className="bc-hint">{t('ladder.pickHint')}</p>}

                {ladder && (
                    <div className="bc-ladder-editor">
                        <div className="bc-form-grid">
                            <div className="bc-field">
                                <label htmlFor="bc-ladder-name">{t('ladder.name')}</label>
                                <input
                                    id="bc-ladder-name"
                                    value={ladder.name}
                                    onChange={(event) => patchLadder({ name: event.target.value })}
                                    disabled={!isAdmin}
                                />
                            </div>
                            <div className="bc-field">
                                <label htmlFor="bc-ladder-overflow">{t('ladder.overflow')}</label>
                                <select
                                    id="bc-ladder-overflow"
                                    value={ladder.overflowBehavior}
                                    onChange={(event) => patchLadder({ overflowBehavior: event.target.value })}
                                    disabled={!isAdmin}
                                >
                                    {BEHAVIOR_OVERFLOW_BEHAVIORS.map((option) => (
                                        <option key={option} value={option}>{t(`overflow.${option}`)}</option>
                                    ))}
                                </select>
                                <p className="bc-hint">{t(`overflowHints.${ladder.overflowBehavior}`)}</p>
                            </div>
                        </div>

                        {(ladder.steps || []).map((step, index) => (
                            <div className="bc-step-card" key={step._id || index}>
                                <div className="bc-step-head">
                                    <span className="bc-step-order">{index + 1}</span>
                                    <input
                                        value={step.title}
                                        onChange={(event) => patchStep(index, { title: event.target.value })}
                                        placeholder={t('ladder.stepTitlePlaceholder')}
                                        style={{ flex: 1, minWidth: '8rem' }}
                                        disabled={!isAdmin}
                                    />
                                    <div className="bc-step-actions">
                                        <button
                                            type="button"
                                            className="bc-icon-btn"
                                            onClick={() => patchLadder({ steps: reorder(ladder.steps, index, -1) })}
                                            disabled={!isAdmin || index === 0}
                                            aria-label={t('ladder.moveUp')}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="bc-icon-btn"
                                            onClick={() => patchLadder({ steps: reorder(ladder.steps, index, 1) })}
                                            disabled={!isAdmin || index === ladder.steps.length - 1}
                                            aria-label={t('ladder.moveDown')}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="bc-icon-btn"
                                            onClick={() => patchLadder({
                                                steps: ladder.steps
                                                    .filter((unused, position) => position !== index)
                                                    .map((entry, position) => ({ ...entry, order: position + 1 }))
                                            })}
                                            disabled={!isAdmin}
                                            aria-label={t('ladder.removeStep')}
                                        >
                                            <HiOutlineTrash />
                                        </button>
                                    </div>
                                </div>

                                <input
                                    value={step.summary || ''}
                                    onChange={(event) => patchStep(index, { summary: event.target.value })}
                                    placeholder={t('ladder.stepSummaryPlaceholder')}
                                    disabled={!isAdmin}
                                />

                                <div className="bc-chips">
                                    <button
                                        type="button"
                                        className={`bc-chip ${step.actions?.emailParents ? 'is-on' : ''}`}
                                        onClick={() => patchStep(index, {
                                            actions: { ...(step.actions || {}), emailParents: !step.actions?.emailParents }
                                        })}
                                        disabled={!isAdmin}
                                    >
                                        {t('ladder.emailParents')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`bc-chip ${step.actions?.showInPortal ? 'is-on' : ''}`}
                                        onClick={() => patchStep(index, {
                                            actions: { ...(step.actions || {}), showInPortal: !step.actions?.showInPortal }
                                        })}
                                        disabled={!isAdmin}
                                    >
                                        {t('ladder.showInPortal')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`bc-chip ${step.requiresApproval === true ? 'is-on' : ''}`}
                                        onClick={() => patchStep(index, {
                                            requiresApproval: step.requiresApproval === true
                                                ? false
                                                : (step.requiresApproval === false ? null : true)
                                        })}
                                        disabled={!isAdmin}
                                    >
                                        {t(step.requiresApproval === true
                                            ? 'ladder.approvalAlways'
                                            : (step.requiresApproval === false
                                                ? 'ladder.approvalNever'
                                                : 'ladder.approvalInherit'))}
                                    </button>
                                </div>

                                {step.actions?.emailParents && (
                                    <div className="bc-field">
                                        <label>{t('setup.ccRoles')}</label>
                                        <div className="bc-chips">
                                            {BEHAVIOR_ROLE_OPTIONS.map((role) => {
                                                const selected = step.actions?.ccRoles || [];
                                                return (
                                                    <button
                                                        type="button"
                                                        key={role}
                                                        className={`bc-chip ${selected.includes(role) ? 'is-on' : ''}`}
                                                        onClick={() => patchStep(index, {
                                                            actions: {
                                                                ...(step.actions || {}),
                                                                ccRoles: selected.includes(role)
                                                                    ? selected.filter((entry) => entry !== role)
                                                                    : [...selected, role]
                                                            }
                                                        })}
                                                        disabled={!isAdmin}
                                                    >
                                                        {role}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {(step.consequences || []).map((row, rowIndex) => (
                                    <div key={row._id || rowIndex}>
                                        <div className="bc-consequence-row">
                                            <select
                                                value={row.taskType}
                                                onChange={(event) => patchConsequence(index, rowIndex, { taskType: event.target.value })}
                                                disabled={!isAdmin}
                                            >
                                                {BEHAVIOR_TASK_TYPES.map((taskType) => (
                                                    <option key={taskType} value={taskType}>
                                                        {t(`taskTypes.${taskType}`)}
                                                    </option>
                                                ))}
                                            </select>
                                            <input
                                                value={row.title}
                                                onChange={(event) => patchConsequence(index, rowIndex, { title: event.target.value })}
                                                placeholder={t('ladder.consequenceTitlePlaceholder')}
                                                disabled={!isAdmin}
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                max="120"
                                                value={row.dueInDays ?? 0}
                                                onChange={(event) => patchConsequence(index, rowIndex, { dueInDays: Number(event.target.value) })}
                                                title={t('ladder.dueInDays')}
                                                disabled={!isAdmin}
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                max="2000"
                                                value={row.minWords ?? 0}
                                                onChange={(event) => patchConsequence(index, rowIndex, { minWords: Number(event.target.value) })}
                                                title={t('ladder.minWords')}
                                                disabled={!isAdmin || !SUBMITTABLE_TASK_TYPES.includes(row.taskType)}
                                            />
                                            <button
                                                type="button"
                                                className="bc-icon-btn"
                                                onClick={() => patchStep(index, {
                                                    consequences: (step.consequences || []).filter((unused, position) => position !== rowIndex)
                                                })}
                                                disabled={!isAdmin}
                                                aria-label={t('ladder.removeConsequence')}
                                            >
                                                <HiOutlineTrash />
                                            </button>
                                        </div>
                                        <input
                                            value={row.instructions || ''}
                                            onChange={(event) => patchConsequence(index, rowIndex, { instructions: event.target.value })}
                                            placeholder={t('ladder.instructionsPlaceholder')}
                                            style={{ marginTop: '0.3rem' }}
                                            disabled={!isAdmin}
                                        />
                                        {row.taskType === 'suspension' && (
                                            <p className="bc-hint">{t('ladder.suspensionHint')}</p>
                                        )}
                                    </div>
                                ))}

                                {isAdmin && (
                                    <div className="bc-actions">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => patchStep(index, {
                                                consequences: [...(step.consequences || []), blankConsequence()]
                                            })}
                                        >
                                            <HiOutlinePlus /> {t('ladder.addConsequence')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {isAdmin && (
                            <div className="bc-actions">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => patchLadder({
                                        steps: [...(ladder.steps || []), blankStep(ladder.steps?.length + 1)]
                                    })}
                                >
                                    <HiOutlinePlus /> {t('ladder.addStep')}
                                </button>
                                <button type="button" className="btn btn-primary" onClick={saveLadder} disabled={saving}>
                                    <HiOutlineSave /> {saving ? t('common.saving') : t('ladder.saveLadder')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const TemplateSetupPanel = ({ isAdmin }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [rows, setRows] = useState([]);
    const [active, setActive] = useState(null);

    const load = () => fetchBehaviorTemplates()
        .then((payload) => setRows(payload?.items || []))
        .catch(() => toast.error(t('templates.loadFailed')));

    useEffect(() => {
        load();
        // Only on mount: the list is reloaded after each save.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const preview = active
        ? {
            subject: fillTemplateTokens(active.subject, SAMPLE_VARIABLES),
            body: fillTemplateTokens(active.body, SAMPLE_VARIABLES)
        }
        : null;

    const save = async () => {
        try {
            await saveBehaviorTemplate({
                key: active.key,
                language: active.language,
                label: active.label || '',
                subject: active.subject,
                body: active.body,
                variables: active.variables || TEMPLATE_VARIABLES,
                active: active.active !== false
            });
            toast.success(t('templates.savedToast'));
            load();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('templates.saveFailed'));
        }
    };

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('templates.title')}</h2>
                    <p>{isAdmin ? t('templates.subtitle') : t('setup.readOnlyHint')}</p>
                </div>
            </div>

            {!rows.length && <p className="bc-hint">{t('templates.empty')}</p>}

            {rows.length > 0 && (
                <div className="bc-split">
                    <div className="bc-list">
                        {rows.map((row) => (
                            <div className="bc-list-item" key={`${row.key}-${row.language}`}>
                                <div>
                                    <p className="bc-item-title">{row.label || row.key}</p>
                                    <p className="bc-item-sub">{row.subject}</p>
                                </div>
                                <div className="bc-item-side">
                                    <span className="badge badge-secondary">{row.language.toUpperCase()}</span>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setActive(row)}
                                    >
                                        {t('common.edit')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        {!active && <p className="bc-hint">{t('templates.pickHint')}</p>}
                        {active && (
                            <div className="bc-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                                <div className="bc-field">
                                    <label htmlFor="bc-template-subject">{t('templates.subject')}</label>
                                    <input
                                        id="bc-template-subject"
                                        value={active.subject}
                                        onChange={(event) => setActive({ ...active, subject: event.target.value })}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="bc-field">
                                    <label htmlFor="bc-template-body">{t('templates.body')}</label>
                                    <textarea
                                        id="bc-template-body"
                                        rows={10}
                                        value={active.body}
                                        onChange={(event) => setActive({ ...active, body: event.target.value })}
                                        disabled={!isAdmin}
                                    />
                                </div>
                                <div className="bc-chips">
                                    {TEMPLATE_VARIABLES.map((variable) => (
                                        <button
                                            type="button"
                                            key={variable}
                                            className="bc-chip"
                                            onClick={() => setActive({ ...active, body: `${active.body}{{${variable}}}` })}
                                            disabled={!isAdmin}
                                        >
                                            {`{{${variable}}}`}
                                        </button>
                                    ))}
                                </div>
                                {isAdmin && (
                                    <div className="bc-actions">
                                        <button type="button" className="btn btn-primary" onClick={save}>
                                            <HiOutlineSave /> {t('common.saveChanges')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {preview && (
                            <div className="bc-email-preview" style={{ marginTop: 'var(--spacing-md)' }}>
                                <p className="bc-email-subject">{preview.subject}</p>
                                <p className="bc-email-body">{preview.body}</p>
                                <p className="bc-hint">{t('templates.previewNotice')}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LadderSetupPanel;
export { TemplateSetupPanel };
