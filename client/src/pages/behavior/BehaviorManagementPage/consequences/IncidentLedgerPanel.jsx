import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineArchive, HiOutlineEye } from 'react-icons/hi';
import {
    fetchBehaviorIncidents,
    fetchBehaviorIncidentBundle,
    fetchBehaviorIncidentAudit,
    fetchBehaviorTypes,
    resetBehaviorCounts,
    voidBehaviorIncident
} from '../../../../api/behaviorApi';
import { STATUS_TONE, TASK_TONE, formatDateTime, studentLabel, toIsoDateInput } from './consequenceUtils';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
    '', 'logged', 'pending_approval', 'approved', 'notified', 'in_progress',
    'closed', 'consequence_rejected', 'voided', 'merged'
];

const emptyFilters = () => ({ status: '', behaviorType: '', from: '', to: '', flagged: '', serious: '' });

const IncidentDetail = ({ incidentId, isAdmin, onClose, onChanged }) => {
    const { t, i18n } = useTranslation(['behaviorConsequences']);
    const [bundle, setBundle] = useState(null);
    const [audit, setAudit] = useState([]);
    const [voidReason, setVoidReason] = useState('');
    const [resetReason, setResetReason] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetchBehaviorIncidentBundle(incidentId),
            fetchBehaviorIncidentAudit(incidentId, { limit: 50 })
        ])
            .then(([bundlePayload, auditPayload]) => {
                if (cancelled) return;
                setBundle(bundlePayload);
                setAudit(auditPayload?.items || []);
            })
            .catch((error) => toast.error(error?.response?.data?.message || t('ledger.loadFailed')));
        return () => { cancelled = true; };
    }, [incidentId, t]);

    const incident = bundle?.incident;

    const voidIncident = async () => {
        if (!voidReason.trim()) {
            toast.error(t('ledger.voidReasonRequired'));
            return;
        }
        setBusy(true);
        try {
            await voidBehaviorIncident(incidentId, { reason: voidReason.trim() });
            toast.success(t('ledger.voidedToast'));
            onChanged?.();
            onClose();
        } catch (error) {
            toast.error(error?.response?.data?.message || t('ledger.voidFailed'));
        } finally {
            setBusy(false);
        }
    };

    const resetCounts = async () => {
        if (!resetReason.trim()) {
            toast.error(t('ledger.resetReasonRequired'));
            return;
        }
        setBusy(true);
        try {
            await resetBehaviorCounts({
                studentId: incident?.student?._id || incident?.student,
                reason: resetReason.trim()
            });
            toast.success(t('ledger.resetToast'));
            setResetReason('');
        } catch (error) {
            toast.error(error?.response?.data?.message || t('ledger.resetFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-large" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t('ledger.detailTitle')}</h3>
                    <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>&times;</button>
                </div>

                {!bundle && <div className="bc-loading">{t('common.loading')}</div>}

                {bundle && (
                    <div className="bc-modal-body">
                        <div className="detail-grid">
                            <div>
                                <strong>{t('ledger.student')}</strong>
                                {studentLabel(incident.student)}
                            </div>
                            <div>
                                <strong>{t('ledger.behavior')}</strong>
                                {incident.behaviorType?.name || t('common.unknownBehavior')}
                            </div>
                            <div>
                                <strong>{t('ledger.occurredAt')}</strong>
                                {formatDateTime(incident.occurredAt, i18n.resolvedLanguage)}
                            </div>
                            <div>
                                <strong>{t('common.status')}</strong>
                                <span className={`badge badge-${STATUS_TONE[incident.status] || 'secondary'}`}>
                                    {t(`statuses.${incident.status}`)}
                                </span>
                            </div>
                        </div>

                        <div className="bc-suggestion">
                            <p className="bc-occurrence">
                                {t('suggestion.occurrence', { value: incident.countSnapshot?.occurrence ?? '-' })}
                            </p>
                            <h3>
                                {t('ledger.appliedStep', {
                                    order: incident.appliedStep?.order ?? '-',
                                    title: incident.appliedStep?.title || t('common.noStep')
                                })}
                            </h3>
                            {incident.suggestedStep?.order !== incident.appliedStep?.order && (
                                <p className="bc-hint">
                                    {t('ledger.suggestedWas', {
                                        order: incident.suggestedStep?.order ?? '-',
                                        title: incident.suggestedStep?.title || ''
                                    })}
                                </p>
                            )}
                            {incident.overrideReason && (
                                <p className="bc-hint">{t('ledger.overrideReason')}: {incident.overrideReason}</p>
                            )}
                            {incident.countSnapshot?.windowKey && (
                                <p className="bc-hint">{t('ledger.window')}: {incident.countSnapshot.windowKey}</p>
                            )}
                        </div>

                        {bundle.ladder && (
                            <div className="bc-ladder-strip">
                                {bundle.ladder.steps.map((step) => (
                                    <span
                                        key={step.order}
                                        className={`bc-step-chip ${step.order === incident.appliedStep?.order ? 'is-applied' : ''}`}
                                    >
                                        {step.order}. {step.title}
                                    </span>
                                ))}
                            </div>
                        )}

                        {incident.staffNotes && (
                            <div className="bc-alert">
                                <div>
                                    <strong>{t('ledger.notes')}</strong>
                                    {incident.staffNotes}
                                </div>
                            </div>
                        )}

                        <div>
                            <strong>{t('ledger.tasks')}</strong>
                            {bundle.tasks.length === 0 && <p className="bc-hint">{t('ledger.noTasks')}</p>}
                            <div className="bc-list">
                                {bundle.tasks.map((task) => (
                                    <div className="bc-list-item" key={task._id}>
                                        <div>
                                            <p className="bc-item-title">{task.title}</p>
                                            <p className="bc-item-sub">
                                                {t(`taskTypes.${task.taskType}`)}
                                                {task.dueAt ? ` · ${t('tasks.due', { date: formatDateTime(task.dueAt, i18n.resolvedLanguage) })}` : ''}
                                            </p>
                                        </div>
                                        <div className="bc-item-side">
                                            <span className={`badge badge-${TASK_TONE[task.status] || 'secondary'}`}>
                                                {t(`taskStatuses.${task.status}`)}
                                            </span>
                                            {task.minWords > 0 && (
                                                <span className="bc-wait">
                                                    {t('tasks.words', { value: task.submission?.wordCount || 0, min: task.minWords })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <strong>{t('ledger.communications')}</strong>
                            {bundle.communications.length === 0 && <p className="bc-hint">{t('ledger.noCommunications')}</p>}
                            <div className="bc-audit">
                                {bundle.communications.map((row, index) => (
                                    <div className="bc-audit-row" key={`${row.channel}-${row.language || 'x'}-${index}`}>
                                        <span>{t(`channels.${row.channel}`)}{row.language ? ` · ${row.language.toUpperCase()}` : ''}</span>
                                        <span>
                                            {t(`notificationStatuses.${row.status}`)}
                                            {row.blockedReason ? ` (${row.blockedReason})` : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="bc-hint">{t('ledger.noTransportNotice')}</p>
                        </div>

                        <div>
                            <strong>{t('ledger.audit')}</strong>
                            <div className="bc-audit">
                                {audit.map((row) => (
                                    <div className="bc-audit-row" key={row._id}>
                                        <span>{t(`audit.${row.action}`, { defaultValue: row.action })}</span>
                                        <span>{formatDateTime(row.createdAt, i18n.resolvedLanguage)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {['logged', 'pending_approval', 'approved', 'notified', 'in_progress', 'closed'].includes(incident.status) && (
                            <div className="bc-section">
                                <h3>{t('ledger.voidTitle')}</h3>
                                <p className="bc-hint">{t('ledger.voidHint')}</p>
                                <input
                                    value={voidReason}
                                    onChange={(event) => setVoidReason(event.target.value)}
                                    placeholder={t('ledger.voidPlaceholder')}
                                    maxLength={1000}
                                />
                                <div className="bc-actions" style={{ marginTop: 'var(--spacing-sm)' }}>
                                    <button type="button" className="btn btn-sm btn-danger" onClick={voidIncident} disabled={busy}>
                                        {t('ledger.voidConfirm')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isAdmin && (
                            <div className="bc-section">
                                <h3>{t('ledger.resetTitle')}</h3>
                                <p className="bc-hint">{t('ledger.resetHint')}</p>
                                <input
                                    value={resetReason}
                                    onChange={(event) => setResetReason(event.target.value)}
                                    placeholder={t('ledger.resetPlaceholder')}
                                    maxLength={1000}
                                />
                                <div className="bc-actions" style={{ marginTop: 'var(--spacing-sm)' }}>
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={resetCounts} disabled={busy}>
                                        {t('ledger.resetConfirm')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const IncidentLedgerPanel = ({ isAdmin = false }) => {
    const { t, i18n } = useTranslation(['behaviorConsequences']);
    const [filters, setFilters] = useState(emptyFilters);
    const [types, setTypes] = useState([]);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [skip, setSkip] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [openId, setOpenId] = useState(null);

    const query = useMemo(() => {
        const params = { limit: PAGE_SIZE };
        Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
        return params;
    }, [filters]);

    useEffect(() => {
        let cancelled = false;
        fetchBehaviorTypes({ includeInactive: 'true' })
            .then((payload) => { if (!cancelled) setTypes(payload?.items || []); })
            .catch(() => { if (!cancelled) setTypes([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const payload = await fetchBehaviorIncidents({ ...query, skip });
                if (cancelled) return;
                setItems(payload?.items || []);
                setTotal(payload?.pagination?.total ?? 0);
            } catch (loadError) {
                if (!cancelled) setError(loadError?.response?.data?.message || t('ledger.loadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [query, skip, reload, t]);

    const setFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setSkip(0);
    };

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('ledger.title')}</h2>
                    <p>{t('ledger.subtitle')}</p>
                </div>
                <span className="badge badge-secondary">{t('ledger.total', { value: total })}</span>
            </div>

            <div className="bc-form-grid" style={{ marginBottom: 'var(--spacing-md)' }}>
                <div className="bc-field">
                    <label htmlFor="bc-filter-status">{t('common.status')}</label>
                    <select
                        id="bc-filter-status"
                        value={filters.status}
                        onChange={(event) => setFilter('status', event.target.value)}
                    >
                        {STATUS_OPTIONS.map((status) => (
                            <option key={status || 'all'} value={status}>
                                {status ? t(`statuses.${status}`) : t('filters.allStatuses')}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bc-field">
                    <label htmlFor="bc-filter-type">{t('ledger.behavior')}</label>
                    <select
                        id="bc-filter-type"
                        value={filters.behaviorType}
                        onChange={(event) => setFilter('behaviorType', event.target.value)}
                    >
                        <option value="">{t('filters.allBehaviors')}</option>
                        {types.map((type) => (
                            <option key={type._id} value={type._id}>{type.name}</option>
                        ))}
                    </select>
                </div>

                <div className="bc-field">
                    <label htmlFor="bc-filter-from">{t('common.from')}</label>
                    <input
                        id="bc-filter-from"
                        type="date"
                        max={toIsoDateInput()}
                        value={filters.from}
                        onChange={(event) => setFilter('from', event.target.value)}
                    />
                </div>

                <div className="bc-field">
                    <label htmlFor="bc-filter-to">{t('common.to')}</label>
                    <input
                        id="bc-filter-to"
                        type="date"
                        max={toIsoDateInput()}
                        value={filters.to}
                        onChange={(event) => setFilter('to', event.target.value)}
                    />
                </div>

                <div className="bc-field">
                    <label>{t('ledger.quickFilters')}</label>
                    <div className="bc-chips">
                        <button
                            type="button"
                            className={`bc-chip ${filters.flagged === 'true' ? 'is-on' : ''}`}
                            onClick={() => setFilter('flagged', filters.flagged === 'true' ? '' : 'true')}
                        >
                            {t('badges.flagged')}
                        </button>
                        <button
                            type="button"
                            className={`bc-chip ${filters.serious === 'true' ? 'is-on' : ''}`}
                            onClick={() => setFilter('serious', filters.serious === 'true' ? '' : 'true')}
                        >
                            {t('badges.serious')}
                        </button>
                    </div>
                </div>
            </div>

            {loading && <div className="bc-loading">{t('common.loading')}</div>}
            {!loading && error && (
                <div className="bc-error">
                    {error} <button type="button" className="btn btn-sm btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('common.retry')}</button>
                </div>
            )}
            {!loading && !error && !items.length && (
                <div className="bc-empty">
                    <HiOutlineArchive />
                    <h3>{t('ledger.emptyTitle')}</h3>
                    <p>{t('ledger.emptyBody')}</p>
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <>
                    <div className="bc-list">
                        {items.map((incident) => (
                            <div className="bc-list-item" key={incident._id}>
                                <div>
                                    <p className="bc-item-title">
                                        {studentLabel(incident.student)} · {incident.behaviorType?.name || t('common.unknownBehavior')}
                                    </p>
                                    <p className="bc-item-sub">
                                        {formatDateTime(incident.occurredAt, i18n.resolvedLanguage)}
                                        {' · '}
                                        {t('ledger.step', {
                                            order: incident.appliedStep?.order ?? '-',
                                            title: incident.appliedStep?.title || t('common.noStep')
                                        })}
                                    </p>
                                </div>
                                <div className="bc-item-side">
                                    <div className="bc-badges">
                                        <span className={`badge badge-${STATUS_TONE[incident.status] || 'secondary'}`}>
                                            {t(`statuses.${incident.status}`)}
                                        </span>
                                        <span className="badge badge-secondary">
                                            {t('suggestion.occurrence', { value: incident.countSnapshot?.occurrence ?? '-' })}
                                        </span>
                                        {incident.isSerious && <span className="badge badge-danger">{t('badges.serious')}</span>}
                                        {incident.flagForAdmin && <span className="badge badge-warning">{t('badges.flagged')}</span>}
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setOpenId(incident._id)}
                                    >
                                        <HiOutlineEye /> {t('common.view')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bc-pagination">
                        <span>{t('common.showing', { from: skip + 1, to: Math.min(skip + items.length, total), total })}</span>
                        <div className="bc-actions">
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setSkip(Math.max(skip - PAGE_SIZE, 0))}
                                disabled={skip === 0}
                            >
                                {t('common.previous')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => setSkip(skip + PAGE_SIZE)}
                                disabled={skip + PAGE_SIZE >= total}
                            >
                                {t('common.next')}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {openId && (
                <IncidentDetail
                    incidentId={openId}
                    isAdmin={isAdmin}
                    onClose={() => setOpenId(null)}
                    onChanged={() => setReload((value) => value + 1)}
                />
            )}
        </div>
    );
};

export default IncidentLedgerPanel;
