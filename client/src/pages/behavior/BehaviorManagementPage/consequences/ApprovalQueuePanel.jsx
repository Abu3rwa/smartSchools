import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineInboxIn, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import { decideBehaviorApproval, fetchPendingApprovals } from '../../../../api/behaviorApi';
import { elapsedHours, formatDateTime, formatElapsed, studentLabel } from './consequenceUtils';

const PAGE_SIZE = 25;

const ApprovalRow = ({ incident, locale, now, onDecision, busy }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [comment, setComment] = useState('');
    const [open, setOpen] = useState(false);

    const requestedAt = incident.approval?.requestedAt;
    const escalated = Boolean(incident.approval?.escalatedAt);
    const waitingHours = elapsedHours(requestedAt, now);

    const decide = async (decision) => {
        if (decision === 'rejected' && !comment.trim()) {
            toast.error(t('approvals.rejectReasonRequired'));
            return;
        }
        await onDecision(incident, decision, comment.trim());
        setComment('');
        setOpen(false);
    };

    return (
        <div className="bc-list-item">
            <div>
                <p className="bc-item-title">
                    {studentLabel(incident.student)} · {incident.behaviorType?.name || t('common.unknownBehavior')}
                </p>
                <p className="bc-item-sub">
                    {t('approvals.stepLine', {
                        order: incident.appliedStep?.order ?? '-',
                        title: incident.appliedStep?.title || t('common.noStep'),
                        occurrence: incident.countSnapshot?.occurrence ?? '-'
                    })}
                </p>
                <p className="bc-item-sub">
                    {t('approvals.loggedBy', {
                        when: formatDateTime(incident.occurredAt, locale),
                        staff: [incident.reportedBy?.firstName, incident.reportedBy?.lastName].filter(Boolean).join(' ')
                            || t('common.unknownStaff')
                    })}
                </p>
                {escalated && <p className="bc-item-sub text-warning">{t('approvals.escalated')}</p>}
            </div>

            <div className="bc-item-side">
                <span className={`bc-wait ${waitingHours >= 24 ? 'is-late' : ''}`}>
                    {formatElapsed(requestedAt, t, now)}
                </span>
                <div className="bc-badges">
                    {incident.isSerious && <span className="badge badge-danger">{t('badges.serious')}</span>}
                    {incident.flagForAdmin && <span className="badge badge-warning">{t('badges.flagged')}</span>}
                    <span className="badge badge-secondary">
                        {t('approvals.approvers', { roles: (incident.approval?.approverRoles || []).join(', ') || t('common.none') })}
                    </span>
                </div>
                <div className="bc-actions">
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setOpen((prev) => !prev)}
                        disabled={busy}
                    >
                        {t('approvals.addNote')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={() => decide('approved')}
                        disabled={busy}
                    >
                        <HiOutlineCheck /> {t('approvals.approve')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => decide('rejected')}
                        disabled={busy}
                    >
                        <HiOutlineX /> {t('approvals.reject')}
                    </button>
                </div>
            </div>

            {open && (
                <div className="bc-detail">
                    <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder={t('approvals.notePlaceholder')}
                        maxLength={1000}
                        rows={3}
                    />
                    <p className="bc-hint">{t('approvals.noteHint')}</p>
                </div>
            )}
        </div>
    );
};

const ApprovalQueuePanel = ({ onCountChange }) => {
    const { t, i18n } = useTranslation(['behaviorConsequences']);
    const locale = i18n.resolvedLanguage;
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [skip, setSkip] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    // Captured per fetch so "waiting for" stays stable across re-renders.
    const [now, setNow] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const payload = await fetchPendingApprovals({ limit: PAGE_SIZE, skip });
                if (cancelled) return;
                setItems(payload?.items || []);
                setTotal(payload?.pagination?.total ?? 0);
                setNow(Date.now());
                onCountChange?.(payload?.pagination?.total ?? 0);
            } catch (loadError) {
                if (!cancelled) setError(loadError?.response?.data?.message || t('approvals.loadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [skip, reload, onCountChange, t]);

    const decide = async (incident, decision, comment) => {
        try {
            const payload = await decideBehaviorApproval(incident._id, { decision, comment: comment || undefined });
            toast.success(decision === 'approved'
                ? t('approvals.approvedToast', { tasks: payload?.taskCount || 0 })
                : t('approvals.rejectedToast'));
            if (payload?.missingParentEmail) toast(t('log.missingParentEmail'), { icon: '✉️' });
            setReload((value) => value + 1);
        } catch (decisionError) {
            toast.error(decisionError?.response?.data?.message || t('approvals.decisionFailed'));
        }
    };

    if (loading) return <div className="bc-loading">{t('common.loading')}</div>;
    if (error) {
        return (
            <div className="bc-error">
                {error} <button type="button" className="btn btn-sm btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('common.retry')}</button>
            </div>
        );
    }

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('approvals.title')}</h2>
                    <p>{t('approvals.subtitle')}</p>
                </div>
                <span className="badge badge-secondary">{t('approvals.waiting', { value: total })}</span>
            </div>

            {!items.length ? (
                <div className="bc-empty">
                    <HiOutlineInboxIn />
                    <h3>{t('approvals.emptyTitle')}</h3>
                    <p>{t('approvals.emptyBody')}</p>
                </div>
            ) : (
                <>
                    <div className="bc-list">
                        {items.map((incident) => (
                            <ApprovalRow
                                key={incident._id}
                                incident={incident}
                                locale={locale}
                                now={now}
                                onDecision={decide}
                                busy={loading}
                            />
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
        </div>
    );
};

export default ApprovalQueuePanel;
