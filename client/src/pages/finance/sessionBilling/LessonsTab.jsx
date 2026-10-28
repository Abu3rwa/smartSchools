import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    EmptyState,
    Icon,
    Modal,
    PersonAvatar,
    Skeleton
} from './ui';
import { money, niceDate } from './utils';

const STATUSES = [
    { value: '', label: 'All lessons' },
    { value: 'unbilled', label: 'Unbilled queue' },
    { value: 'review', label: 'Needs review' },
    { value: 'voided', label: 'Voided' }
];

const SOURCES = [
    { value: '', label: 'All sources' },
    { value: 'platform', label: 'Live lessons' },
    { value: 'manual', label: 'Manual entries' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'in-person', label: 'In person' },
    { value: 'other', label: 'Other' }
];

const sourceLabel = (entry) => {
    if (entry.source === 'manual') return 'Manual';
    if (entry.lessonSource === 'zoom') return 'Zoom';
    if (entry.lessonSource === 'in-person') return 'In person';
    if (entry.lessonSource === 'other') return 'Other';
    return 'Live lesson';
};

const fmtMinutes = (value) => `${Math.round(Number(value) || 0)} min`;

const CalculationPanel = ({ entry, currency }) => {
    const rule = entry.ruleSnapshot || {};
    const steps = [
        ['Session time', rule.rawMinutes !== undefined ? fmtMinutes(rule.rawMinutes) : '—'],
        ['Paused time excluded', rule.pausedMinutes ? fmtMinutes(rule.pausedMinutes) : 'None'],
        ['Attendance recorded', rule.attendanceMinutes !== undefined ? fmtMinutes(rule.attendanceMinutes) : '—'],
        ['Grace applied', rule.graceMinutes ? fmtMinutes(rule.graceMinutes) : 'None'],
        ['Minimum billable', rule.minimumBillableMinutes !== undefined ? fmtMinutes(rule.minimumBillableMinutes) : '—'],
        ['Rounded to', rule.roundingMinutes ? `Nearest ${rule.roundingMinutes} min` : '—'],
        ['Billed minutes', entry.minutes ? fmtMinutes(entry.minutes) : '0 min'],
        ['Rate', `${money(entry.hourlyRate || 0, currency)}/hr`],
        ['Basis', rule.billingBasis === 'session' ? 'Whole session' : 'Per student']
    ];
    return (
        <div className="sb-calc">
            <div className="sb-calc-head">
                <div>
                    <span className="sb-eyebrow">How this charge was calculated</span>
                    <h3>{entry.sessionTitle || 'Lesson charge'}</h3>
                </div>
                <div className="sb-calc-total">
                    <span>Charged</span>
                    <strong>{money(entry.amount, currency)}</strong>
                    {entry.grossAmount !== entry.amount && (
                        <small>{money(entry.grossAmount, currency)} before package</small>
                    )}
                </div>
            </div>
            <div className="sb-calc-steps">
                {steps.map(([label, value]) => (
                    <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                    </div>
                ))}
            </div>
            {entry.packageCoveredMinutes > 0 && (
                <p className="sb-calc-note">
                    <Icon name="check" size={14} /> {Math.round(entry.packageCoveredMinutes)} minutes were drawn from a prepaid package at {money(entry.hourlyRate, currency)}/hr.
                </p>
            )}
            {entry.rateSource && (
                <p className="sb-calc-note">
                    Rate source: {entry.rateSource === 'student' ? 'student override' : entry.rateSource === 'class' ? 'class rate' : entry.rateSource === 'package' ? 'package rate' : 'school default'}.
                </p>
            )}
        </div>
    );
};

const LessonsTab = ({ range, filters, refreshKey, onAction, onRecordPayment }) => {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState(filters.status || '');
    const [source, setSource] = useState('');
    const [expanded, setExpanded] = useState('');
    const [resolveTarget, setResolveTarget] = useState(null);
    const [resolveAction, setResolveAction] = useState('resolve');
    const [resolveNote, setResolveNote] = useState('');
    const [resolving, setResolving] = useState(false);
    const [generating, setGenerating] = useState('');

    const params = useMemo(() => ({
        ...range,
        ...filters,
        status,
        ...(source ? { source } : {})
    }), [range, filters, status, source]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/lessons', { params });
            setData(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load lessons.');
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const currency = data?.currency || 'USD';
    const entries = data?.entries || [];
    const issues = data?.issues || [];

    const resolveIssue = async () => {
        if (!resolveTarget) return;
        setResolving(true);
        try {
            await api.post(`/finance/billing/issues/${resolveTarget.id}/resolve`, {
                action: resolveAction,
                note: resolveNote
            });
            toast.success(resolveAction === 'ignore' ? 'Issue ignored.' : 'Issue resolved.');
            setResolveTarget(null);
            setResolveNote('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the issue.');
        } finally {
            setResolving(false);
        }
    };

    const regenerate = async (issue) => {
        if (!issue.sessionId) return;
        setGenerating(issue.id);
        try {
            const response = await api.post(`/finance/billing/sessions/${issue.sessionId}/generate`);
            const result = response.data?.data;
            const created = result?.created ?? 0;
            toast.success(created ? 'Charges created for this session.' : 'No new charges were needed.');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not bill this session.');
        } finally {
            setGenerating('');
        }
    };

    return (
        <div className="sb-tab">
            <div className="sb-toolbar">
                <div className="sb-chip-row">
                    {STATUSES.map((chip) => (
                        <button
                            key={chip.value}
                            className={`sb-chip ${status === chip.value ? 'is-active' : ''}`}
                            onClick={() => setStatus(chip.value)}
                        >
                            {chip.label}
                            {chip.value === 'unbilled' && data ? <b>{data.totals.unbilled}</b> : null}
                        </button>
                    ))}
                </div>
                <div className="sb-toolbar-filters">
                    <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="Lesson source">
                        {SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button className="btn-secondary btn-sm" onClick={() => onAction({ tab: 'settings' })}>
                        <Icon name="settings" size={14} /> Rate rules
                    </button>
                </div>
            </div>

            {error && <div className="finance-error">{error}</div>}

            {loading ? (
                <div className="sb-split">
                    <Skeleton rows={8} />
                    <Skeleton rows={4} />
                </div>
            ) : (
                <div className="sb-split">
                    <section className="sb-card sb-table-card">
                        <header className="sb-card-head">
                            <div>
                                <span className="sb-eyebrow">Charges</span>
                                <h2>Lessons and charges</h2>
                            </div>
                            {data && (
                                <div className="sb-head-metrics">
                                    <span><strong>{data.totals.lessons}</strong> lessons</span>
                                    <span><strong>{Math.round(data.totals.minutes)}</strong> min</span>
                                    <span><strong>{money(data.totals.charged, currency)}</strong> charged</span>
                                </div>
                            )}
                        </header>
                        {entries.length === 0 ? (
                            <EmptyState icon="lessons" title="No lessons in this view" body="Change the period, source, or status to find a recorded lesson." />
                        ) : (
                            <div className="sb-lesson-list">
                                {entries.map((entry) => (
                                    <div key={entry.id} className={`sb-lesson ${entry.status === 'void' ? 'is-void' : ''}`}>
                                        <button className="sb-lesson-summary" onClick={() => setExpanded(expanded === entry.id ? '' : entry.id)}>
                                            <PersonAvatar name={entry.studentName} size={30} />
                                            <span className="sb-lesson-who">
                                                <strong>{entry.studentName}</strong>
                                                <small>{entry.sessionTitle || entry.className} · {niceDate(entry.occurredAt)}</small>
                                            </span>
                                            <span className="sb-lesson-source">
                                                <Badge tone={entry.source === 'manual' ? 'neutral' : 'teal'}>{sourceLabel(entry)}</Badge>
                                                {entry.packageCoveredMinutes > 0 && <Badge tone="violet">Package</Badge>}
                                                {entry.status === 'void' && <Badge tone="danger">Voided</Badge>}
                                            </span>
                                            <span className="sb-lesson-time">
                                                <strong>{fmtMinutes(entry.minutes)}</strong>
                                                <small>{money(entry.hourlyRate, currency)}/hr</small>
                                            </span>
                                            <span className="sb-lesson-amount">
                                                <strong>{money(entry.amount, currency)}</strong>
                                                <small>{money(entry.grossAmount, currency)} before package</small>
                                            </span>
                                            <Icon name="chevron" size={16} className={expanded === entry.id ? 'is-open' : ''} />
                                        </button>
                                        {expanded === entry.id && (
                                            <CalculationPanel entry={entry} currency={currency} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <div className="sb-stack">
                        <section className="sb-card">
                            <header className="sb-card-head">
                                <div>
                                    <span className="sb-eyebrow">Unbilled queue</span>
                                    <h2>Needs a staff decision</h2>
                                </div>
                                <Badge tone={issues.length ? 'warning' : 'good'}>{issues.length}</Badge>
                            </header>
                            <p className="sb-card-note">
                                These lessons ended without a complete charge. Nothing is billed automatically until the underlying problem is fixed.
                            </p>
                            {issues.length === 0 ? (
                                <EmptyState icon="check" title="Queue is clear" body="Every lesson in this period was billed or deliberately left alone." />
                            ) : (
                                <ul className="sb-issue-list">
                                    {issues.map((issue) => (
                                        <li key={issue.id}>
                                            <span className="sb-issue-mark" />
                                            <div className="sb-issue-main">
                                                <strong>{issue.label}</strong>
                                                <small>
                                                    {issue.studentName || 'Roster student'} · {issue.className || issue.sessionTitle || 'Live lesson'} · {fmtMinutes(issue.minutes)}
                                                </small>
                                                {issue.detail && <p>{issue.detail}</p>}
                                            </div>
                                            <div className="sb-issue-actions">
                                                {issue.sessionId && (
                                                    <button className="btn-secondary btn-sm" onClick={() => regenerate(issue)} disabled={generating === issue.id}>
                                                        {generating === issue.id ? 'Billing…' : 'Bill session'}
                                                    </button>
                                                )}
                                                <button className="btn-secondary btn-sm" onClick={() => { setResolveTarget(issue); setResolveAction('resolve'); setResolveNote(''); }}>
                                                    Resolve
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="sb-card sb-stack-actions">
                            <button className="sb-action-tile" onClick={() => onRecordPayment()}>
                                <span><Icon name="money" /></span>
                                <strong>Record a payment</strong>
                                <small>Cash, transfer, cheque, or online</small>
                            </button>
                            <button className="sb-action-tile" onClick={() => onAction({ tab: 'messages' })}>
                                <span><Icon name="mail" /></span>
                                <strong>Message families</strong>
                                <small>Statements and reminders</small>
                            </button>
                            {import.meta.env.VITE_LIVE_LESSONS_ENABLED === 'true' && (
                                <button className="sb-action-tile" onClick={() => navigate('/portal/live-lessons')}>
                                    <span><Icon name="lessons" /></span>
                                    <strong>Live lessons</strong>
                                    <small>See sessions and attendance</small>
                                </button>
                            )}
                        </section>
                    </div>
                </div>
            )}

            <Modal
                open={Boolean(resolveTarget)}
                title={resolveAction === 'ignore' ? 'Ignore this issue' : 'Resolve this issue'}
                eyebrow="Unbilled queue"
                onClose={() => setResolveTarget(null)}
                footer={(
                    <>
                        <button className="btn-secondary" onClick={() => setResolveTarget(null)}>Cancel</button>
                        <button className="btn-primary" onClick={resolveIssue} disabled={resolving}>
                            {resolving ? 'Saving…' : resolveAction === 'ignore' ? 'Ignore issue' : 'Mark resolved'}
                        </button>
                    </>
                )}
            >
                {resolveTarget && (
                    <div className="sb-resolve">
                        <div className="sb-resolve-head">
                            <strong>{resolveTarget.label}</strong>
                            <span>{resolveTarget.studentName} · {fmtMinutes(resolveTarget.minutes)}</span>
                            {resolveTarget.detail && <p>{resolveTarget.detail}</p>}
                        </div>
                        <div className="sb-segmented">
                            <button className={resolveAction === 'resolve' ? 'is-active' : ''} onClick={() => setResolveAction('resolve')}>Resolved</button>
                            <button className={resolveAction === 'ignore' ? 'is-active' : ''} onClick={() => setResolveAction('ignore')}>Ignore</button>
                        </div>
                        <label className="sb-field">
                            <span>What did you do?</span>
                            <textarea rows={3} value={resolveNote} onChange={(event) => setResolveNote(event.target.value)} maxLength={500} placeholder="Optional, but useful for the next person." />
                        </label>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default LessonsTab;
