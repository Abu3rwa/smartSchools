import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    BalancePill,
    EmptyState,
    Icon,
    KpiCard,
    PersonAvatar,
    Skeleton,
    Spinner,
    TrendChart
} from './ui';
import { money, relativeTime } from './utils';

const severityTone = (severity) => {
    if (severity === 'danger') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
};

const OverviewTab = ({ range, filters, refreshKey, onAction, onOpenStudent, onRecordPayment }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState(null);
    const [analysing, setAnalysing] = useState(false);

    const params = useMemo(() => ({ ...range, ...filters }), [range, filters]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/overview', { params });
            setData(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load the billing overview.');
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load, refreshKey]);

    useEffect(() => { setAnalysis(null); }, [params]);

    const currency = data?.settings?.currency || 'USD';
    const totals = data?.totals;

    const runAnalysis = async () => {
        setAnalysing(true);
        try {
            const response = await api.post('/finance/billing/insights/analysis', params);
            setAnalysis(response.data?.data || null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not analyse this period.');
        } finally {
            setAnalysing(false);
        }
    };

    if (loading) {
        return (
            <div className="sb-tab">
                <div className="sb-kpi-grid">
                    {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} rows={2} />)}
                </div>
                <div className="sb-split">
                    <Skeleton rows={6} />
                    <Skeleton rows={4} />
                </div>
            </div>
        );
    }
    if (error) return <div className="finance-error">{error}</div>;
    if (!data) return <EmptyState title="No billing data" body="Enable session billing and record a lesson to see the account picture." />;

    const change = (value) => {
        if (value === null || value === undefined) return null;
        return `${value > 0 ? '+' : ''}${value}%`;
    };

    return (
        <div className="sb-tab sb-overview">
            <div className="sb-kpi-grid">
                <KpiCard
                    label="Charged in this period"
                    value={totals.charged}
                    currency={currency}
                    icon="lessons"
                    tone="teal"
                    chip={change(totals.changes.charged)}
                    hint={`${totals.sessions} lesson${totals.sessions === 1 ? '' : 's'} · ${Math.round(totals.minutes)} min`}
                    delay={0}
                />
                <KpiCard
                    label="Collected"
                    value={totals.paid}
                    currency={currency}
                    icon="money"
                    tone="gold"
                    chip={change(totals.changes.paid)}
                    hint="Payments received in this period"
                    delay={60}
                />
                <KpiCard
                    label="Owed to the school"
                    value={totals.owed}
                    currency={currency}
                    icon="alert"
                    tone="danger"
                    hint={`${data.balanceStatus.owed.count} account${data.balanceStatus.owed.count === 1 ? '' : 's'} owing`}
                    delay={120}
                />
                <KpiCard
                    label="Credit held"
                    value={totals.credit}
                    currency={currency}
                    icon="check"
                    tone="violet"
                    hint={`${data.balanceStatus.credit.count} account${data.balanceStatus.credit.count === 1 ? '' : 's'} paid ahead`}
                    delay={180}
                />
                <KpiCard
                    label="Waiting to be billed"
                    value={totals.unbilledCount}
                    icon="warn"
                    tone="ink"
                    hint={`${Math.round(totals.unbilledMinutes)} min held in the review queue`}
                    delay={240}
                />
            </div>

            <div className="sb-split">
                <section className="sb-card sb-chart-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Cash and teaching flow</span>
                            <h2>Charges and payments</h2>
                        </div>
                        <Badge tone={totals.changes.charged === null ? 'neutral' : totals.changes.charged >= 0 ? 'good' : 'warning'}>
                            {totals.changes.charged === null ? 'New period' : `${change(totals.changes.charged)} charged`}
                        </Badge>
                    </header>
                    <TrendChart trend={data.trend} currency={currency} />
                    <div className="sb-chart-foot">
                        <div>
                            <span>Collection rate</span>
                            <strong>{totals.charged > 0 ? `${Math.round((totals.paid / totals.charged) * 100)}%` : '—'}</strong>
                        </div>
                        <div>
                            <span>Minutes taught</span>
                            <strong>{Math.round(totals.minutes)}</strong>
                        </div>
                        <div>
                            <span>Previous period</span>
                            <strong>{data.previousRange ? 'Compared above' : '—'}</strong>
                        </div>
                    </div>
                </section>

                <section className="sb-card sb-intel">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Billing intelligence</span>
                            <h2>What needs a decision</h2>
                        </div>
                        <button className="sb-ai-btn" onClick={runAnalysis} disabled={analysing}>
                            {analysing ? <Spinner /> : <Icon name="sparkles" size={16} />}
                            {analysing ? 'Analysing…' : 'Analyse'}
                        </button>
                    </header>
                    {analysis ? (
                        <div className="sb-ai-result">
                            <Badge tone={analysis.source === 'ai' ? 'violet' : 'neutral'} dot>
                                {analysis.source === 'ai' ? 'AI summary' : 'Rule-based summary'}
                            </Badge>
                            <p className="sb-ai-summary">{analysis.summary}</p>
                            {analysis.priorities?.length > 0 && (
                                <ol className="sb-ai-priorities">
                                    {analysis.priorities.map((priority, index) => (
                                        <li key={`${priority.title}-${index}`}>
                                            <span>{index + 1}</span>
                                            <div>
                                                <strong>{priority.title}</strong>
                                                <p>{priority.why}</p>
                                                {priority.action && <em>{priority.action}</em>}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            <small className="sb-ai-note">
                                Suggestions only. Nothing is charged or sent until a staff member confirms it.
                            </small>
                        </div>
                    ) : (
                        scores(data.attention, onAction)
                    )}
                </section>
            </div>

            <div className="sb-split sb-split-wide">
                <section className="sb-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Accounts</span>
                            <h2>Balance position</h2>
                        </div>
                        <button className="sb-link" onClick={() => onAction({ tab: 'students' })}>
                            All student accounts <Icon name="chevron" size={14} />
                        </button>
                    </header>
                    <div className="sb-balance-bar" aria-hidden="true">
                        {(() => {
                            const total = data.balanceStatus.owed.amount + data.balanceStatus.credit.amount + 1;
                            const owedPct = (data.balanceStatus.owed.amount / total) * 100;
                            const creditPct = (data.balanceStatus.credit.amount / total) * 100;
                            return (
                                <>
                                    <span className="sb-bar-owed" style={{ width: `${Math.max(owedPct, data.balanceStatus.owed.amount > 0 ? 6 : 0)}%` }} />
                                    <span className="sb-bar-credit" style={{ width: `${Math.max(creditPct, data.balanceStatus.credit.amount > 0 ? 6 : 0)}%` }} />
                                </>
                            );
                        })()}
                    </div>
                    <div className="sb-balance-legend">
                        <div><i className="sb-dot sb-dot-owed" /><span>Owed</span><strong>{money(data.balanceStatus.owed.amount, currency)}</strong><small>{data.balanceStatus.owed.count} accounts</small></div>
                        <div><i className="sb-dot sb-dot-credit" /><span>Credit</span><strong>{money(data.balanceStatus.credit.amount, currency)}</strong><small>{data.balanceStatus.credit.count} accounts</small></div>
                        <div><i className="sb-dot sb-dot-settled" /><span>Settled</span><strong>{data.balanceStatus.settled.count}</strong><small>accounts</small></div>
                    </div>

                    <div className="sb-mini-table">
                        {data.students.slice(0, 6).map((student) => (
                            <button key={student.studentId} className="sb-mini-row" onClick={() => onOpenStudent(student.studentId)}>
                                <PersonAvatar name={student.name} />
                                <span className="sb-mini-person">
                                    <strong>{student.name}</strong>
                                    <small>{student.classes.join(' · ') || 'No class'} · {student.rangeSessions} lesson{student.rangeSessions === 1 ? '' : 's'}</small>
                                </span>
                                <span className="sb-mini-amount">
                                    <BalancePill balance={student.balance} currency={currency} />
                                    <small>{money(student.rangeCharged, currency)} charged</small>
                                </span>
                                <Icon name="chevron" size={15} />
                            </button>
                        ))}
                        {data.students.length === 0 && (
                            <EmptyState title="No student activity" body="No lesson time or payments were recorded for this period." />
                        )}
                    </div>
                </section>

                <section className="sb-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Teaching</span>
                            <h2>Class performance</h2>
                        </div>
                    </header>
                    {data.classes.length === 0 ? (
                        <EmptyState icon="lessons" title="No classes billed" body="Class revenue appears once lessons are charged." />
                    ) : (
                        <ul className="sb-class-list">
                            {data.classes.slice(0, 7).map((klass) => {
                                const max = Math.max(1, ...data.classes.map((row) => row.charged));
                                return (
                                    <li key={klass.classId || klass.name}>
                                        <div className="sb-class-row">
                                            <strong>{klass.name}</strong>
                                            <span>{klass.sessions} lesson{klass.sessions === 1 ? '' : 's'} · {Math.round(klass.minutes)} min</span>
                                            <em>{money(klass.charged, currency)}</em>
                                        </div>
                                        <div className="sb-class-track">
                                            <span style={{ width: `${(klass.charged / max) * 100}%` }} />
                                        </div>
                                        <small>
                                            {money(klass.effectiveHourlyRate, currency)}/hr effective
                                            {klass.outstanding > 0 ? ` · ${money(klass.outstanding, currency)} outstanding` : ''}
                                        </small>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            <div className="sb-split">
                <section className="sb-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Ledger</span>
                            <h2>Recent activity</h2>
                        </div>
                    </header>
                    {data.recent.length === 0 ? (
                        <EmptyState title="Nothing recorded" body="Charges, payments and family emails will appear here." />
                    ) : (
                        <ul className="sb-activity">
                            {data.recent.map((entry) => (
                                <li key={entry.id}>
                                    <span className={`sb-activity-icon sb-activity-${entry.type}`}>
                                        <Icon name={entry.type === 'payment' ? 'money' : entry.type === 'email' ? 'mail' : entry.type === 'audit' ? 'check' : 'lessons'} size={16} />
                                    </span>
                                    <div>
                                        <strong>{entry.title}</strong>
                                        <small>{entry.detail} · {relativeTime(entry.at)}</small>
                                    </div>
                                    {entry.amount !== null && (
                                        <em className={entry.direction === 'in' ? 'positive' : ''}>
                                            {entry.direction === 'in' ? '+' : entry.direction === 'out' ? '−' : ''}{money(entry.amount, currency)}
                                        </em>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="sb-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Review queue</span>
                            <h2>Needs attention</h2>
                        </div>
                        <Badge tone={data.attention.length ? 'warning' : 'good'}>{data.attention.length}</Badge>
                    </header>
                    {data.attention.length === 0 ? (
                        <EmptyState icon="check" title="All clear" body="No unbilled lessons, failed emails or unusual payments in this period." />
                    ) : (
                        <ul className="sb-attention">
                            {data.attention.map((item) => (
                                <li key={item.id}>
                                    <span className={`sb-attention-mark sb-tone-${severityTone(item.severity)}`} />
                                    <div>
                                        <strong>{item.title}</strong>
                                        <small>{item.detail}</small>
                                    </div>
                                    {item.action && (
                                        <button className="sb-link" onClick={() => {
                                            if (item.action.studentId) onOpenStudent(item.action.studentId);
                                            else onAction(item.action);
                                        }}>
                                            {item.action.label} <Icon name="chevron" size={13} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="sb-card-actions">
                        <button className="btn-secondary" onClick={() => onRecordPayment()}>
                            <Icon name="plus" size={15} /> Record payment
                        </button>
                        <button className="btn-secondary" onClick={() => onAction({ tab: 'lessons', status: 'unbilled' })}>
                            <Icon name="lessons" size={15} /> Unbilled queue
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};

const scores = (attention, onAction) => {
    if (!attention.length) {
        return <EmptyState icon="check" title="Nothing urgent" body="Run an analysis to get a plain-language summary of the period." />;
    }
    return (
        <ul className="sb-signal-list">
            {attention.slice(0, 5).map((item) => (
                <li key={item.id}>
                    <span className={`sb-signal sb-tone-${severityTone(item.severity)}`}>{severityTone(item.severity) === 'danger' ? '!' : severityTone(item.severity) === 'warning' ? '•' : 'i'}</span>
                    <div>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                    </div>
                </li>
            ))}
            <li className="sb-signal-cta">
                <button className="sb-link" onClick={() => onAction({ tab: 'lessons', status: 'unbilled' })}>
                    Review every open item <Icon name="chevron" size={13} />
                </button>
            </li>
        </ul>
    );
};

export default OverviewTab;
