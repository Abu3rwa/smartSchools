import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    EmptyState,
    Icon,
    Skeleton,
    Spinner
} from './ui';
import { downloadFile, money, niceDate, relativeTime } from './utils';

const formatCell = (value, column, currency) => {
    if (value === null || value === undefined || value === '') return '—';
    if (column.type === 'money') return money(value, currency);
    if (column.type === 'date') return niceDate(value);
    return String(value);
};

const REPORT_GROUPS = ['Money', 'Families', 'Teaching', 'Controls'];

const ReportsTab = ({
    range,
    filters,
    refreshKey,
    onPrintReport,
    onReminder,
    onBulkReminders,
    onBulkStatements,
    onOpenStudent
}) => {
    const [catalog, setCatalog] = useState([]);
    const [reportKey, setReportKey] = useState('summary');
    const [report, setReport] = useState(null);
    const [reportLoading, setReportLoading] = useState(true);
    const [reportError, setReportError] = useState('');
    const [exporting, setExporting] = useState(false);

    const [messages, setMessages] = useState(null);
    const [messageLoading, setMessageLoading] = useState(true);
    const [messageError, setMessageError] = useState('');
    const [view, setView] = useState('statements');

    const reportParams = useMemo(() => ({ ...range, ...filters, report: reportKey }), [range, filters, reportKey]);

    useEffect(() => {
        let active = true;
        api.get('/finance/billing/reports/catalog')
            .then((response) => {
                if (active) setCatalog(response.data?.data?.catalog || []);
            })
            .catch(() => {
                if (active) setCatalog([]);
            });
        return () => { active = false; };
    }, []);

    const loadReport = useCallback(async () => {
        setReportLoading(true);
        setReportError('');
        try {
            const response = await api.get('/finance/billing/reports', { params: reportParams });
            setReport(response.data?.data?.report || null);
        } catch (err) {
            setReportError(err.response?.data?.message || 'Unable to load this report.');
        } finally {
            setReportLoading(false);
        }
    }, [reportParams]);

    const loadMessages = useCallback(async () => {
        setMessageLoading(true);
        setMessageError('');
        try {
            const response = await api.get('/finance/billing/messages', { params: { ...range, ...filters } });
            setMessages(response.data?.data || null);
        } catch (err) {
            setMessageError(err.response?.data?.message || 'Unable to load family messages.');
        } finally {
            setMessageLoading(false);
        }
    }, [range, filters]);

    useEffect(() => { loadReport(); }, [loadReport, refreshKey]);
    useEffect(() => { loadMessages(); }, [loadMessages, refreshKey]);

    const exportReport = async () => {
        setExporting(true);
        try {
            await downloadFile('/finance/billing/reports/export', reportParams, `${reportKey}.csv`);
            toast.success('Report downloaded.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not export this report.');
        } finally {
            setExporting(false);
        }
    };

    const currency = report?.currency || messages?.currency || 'USD';
    const eligible = (messages?.candidates || []).filter((candidate) => candidate.eligible);

    return (
        <div className="sb-tab">
            <div className="sb-segmented sb-segmented-lg">
                <button className={view === 'statements' ? 'is-active' : ''} onClick={() => setView('statements')}>
                    <Icon name="reports" size={15} /> Reports
                </button>
                <button className={view === 'messages' ? 'is-active' : ''} onClick={() => setView('messages')}>
                    <Icon name="mail" size={15} /> Messages
                    {eligible.length > 0 && <b>{eligible.length}</b>}
                </button>
            </div>

            {view === 'statements' && (
                <div className="sb-report-layout">
                    <aside className="sb-report-rail">
                        {REPORT_GROUPS.map((group) => {
                            const reports = catalog.filter((item) => item.category === group);
                            if (!reports.length) return null;
                            return (
                                <div key={group} className="sb-report-group">
                                    <span className="sb-eyebrow">{group}</span>
                                    {reports.map((item) => (
                                        <button
                                            key={item.key}
                                            className={`sb-report-link ${reportKey === item.key ? 'is-active' : ''}`}
                                            onClick={() => setReportKey(item.key)}
                                        >
                                            <strong>{item.title}</strong>
                                            <small>{item.description}</small>
                                        </button>
                                    ))}
                                </div>
                            );
                        })}
                    </aside>

                    <section className="sb-card sb-report-card">
                        <header className="sb-card-head">
                            <div>
                                <span className="sb-eyebrow">{report?.range ? `${niceDate(report.range.from)} — ${niceDate(report.range.to)}` : 'Report'}</span>
                                <h2>{report?.title || 'Report'}</h2>
                                {report?.description && <p className="sb-card-sub">{report.description}</p>}
                            </div>
                            <div className="sb-report-actions">
                                <button className="btn-secondary btn-sm" onClick={exportReport} disabled={exporting || !report}>
                                    {exporting ? <Spinner /> : <Icon name="down" size={14} />} CSV
                                </button>
                                <button className="btn-secondary btn-sm" onClick={() => onPrintReport(reportParams)} disabled={!report}>
                                    <Icon name="print" size={14} /> Print
                                </button>
                            </div>
                        </header>

                        {reportError && <div className="finance-error">{reportError}</div>}

                        {reportLoading ? <Skeleton rows={7} /> : report && (
                            <>
                                {report.rows.length === 0 ? (
                                    <EmptyState title="Nothing in this report" body="No records match the selected period and filters." />
                                ) : (
                                    <div className="sb-table-wrap">
                                        <table className="sb-table sb-report-table">
                                            <thead>
                                                <tr>
                                                    {report.columns.map((column) => (
                                                        <th key={column.key} className={column.type === 'money' || column.type === 'number' ? 'num' : ''}>
                                                            {column.label}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.rows.map((row, index) => (
                                                    <tr
                                                        key={`${index}-${row.studentId || row.student || ''}`}
                                                        className={row.studentId ? 'is-clickable' : ''}
                                                        onClick={() => row.studentId && onOpenStudent?.(row.studentId)}
                                                    >
                                                        {report.columns.map((column) => (
                                                            <td key={column.key} className={column.type === 'money' || column.type === 'number' ? 'num' : ''}>
                                                                {formatCell(row[column.key], column, currency)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {report.totals && Object.keys(report.totals).length > 0 && (
                                    <footer className="sb-report-totals">
                                        {Object.entries(report.totals)
                                            .filter(([key, value]) => key !== 'currency' && typeof value === 'number')
                                            .map(([key, value]) => (
                                                <span key={key}>
                                                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())}
                                                    <strong>{key.toLowerCase().includes('minute') ? Math.round(value) : money(value, currency)}</strong>
                                                </span>
                                            ))}
                                    </footer>
                                )}
                            </>
                        )}
                    </section>
                </div>
            )}

            {view === 'messages' && (
                <div className="sb-messages">
                    <div className="sb-kpi-grid sb-kpi-grid-four">
                        <div className="sb-message-stat">
                            <span className="sb-kpi-icon"><Icon name="alert" /></span>
                            <div>
                                <strong>{messages?.summary?.eligible ?? '—'}</strong>
                                <small>ready for a reminder</small>
                            </div>
                        </div>
                        <div className="sb-message-stat">
                            <span className="sb-kpi-icon"><Icon name="money" /></span>
                            <div>
                                <strong>{messages?.summary?.owed ?? '—'}</strong>
                                <small>accounts owing money</small>
                            </div>
                        </div>
                        <div className="sb-message-stat">
                            <span className="sb-kpi-icon"><Icon name="mail" /></span>
                            <div>
                                <strong>{messages?.deliverySummary?.sent ?? '—'}</strong>
                                <small>messages delivered</small>
                            </div>
                        </div>
                        <div className="sb-message-stat">
                            <span className="sb-kpi-icon"><Icon name="warn" /></span>
                            <div>
                                <strong>{messages?.deliverySummary?.failed ?? '—'}</strong>
                                <small>delivery failures</small>
                            </div>
                        </div>
                    </div>

                    <div className="sb-toolbar">
                        <div className="sb-chip-row">
                            <span className="sb-muted">
                                Quiet period: {messages?.reminderSettings?.quietDays ?? 14} days · reminders start after {messages?.reminderSettings?.afterDays ?? 7} days
                            </span>
                        </div>
                        <div className="sb-toolbar-filters">
                            <button className="btn-secondary btn-sm" onClick={onBulkStatements}>
                                <Icon name="mail" size={14} /> Email statements
                            </button>
                            <button className="btn-primary btn-sm" onClick={() => onBulkReminders(eligible)} disabled={!eligible.length}>
                                <Icon name="alert" size={14} /> Remind all eligible ({eligible.length})
                            </button>
                        </div>
                    </div>

                    {messageError && <div className="finance-error">{messageError}</div>}

                    {messageLoading ? <Skeleton rows={6} /> : (
                        <div className="sb-split">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Reminders</span>
                                        <h2>Who needs a nudge</h2>
                                    </div>
                                    <Badge tone={eligible.length ? 'warning' : 'good'}>{eligible.length} eligible</Badge>
                                </header>
                                <p className="sb-card-note">
                                    A family only appears here when they owe at least the minimum balance, have a reachable contact, and have not been reminded in the quiet period.
                                </p>
                                {(messages?.candidates || []).length === 0 ? (
                                    <EmptyState icon="check" title="No reminders needed" body="No family currently meets the reminder rules for this period." />
                                ) : (
                                    <ul className="sb-reminder-list">
                                        {messages.candidates.map((candidate) => (
                                            <li key={candidate.studentId} className={candidate.eligible ? '' : 'is-muted'}>
                                                <div className="sb-reminder-main">
                                                    <button className="sb-link" onClick={() => onOpenStudent(candidate.studentId)}>
                                                        <strong>{candidate.name}</strong>
                                                    </button>
                                                    <small>
                                                        {money(candidate.owed, currency)} owed ·{' '}
                                                        {candidate.lastReminderAt ? `last reminder ${relativeTime(candidate.lastReminderAt)}` : 'never reminded'}
                                                    </small>
                                                    {!candidate.eligible && <em>{candidate.reason}</em>}
                                                </div>
                                                <button
                                                    className="btn-secondary btn-sm"
                                                    disabled={!candidate.eligible}
                                                    onClick={() => onReminder({ studentId: candidate.studentId, name: candidate.name })}
                                                >
                                                    {candidate.eligible ? 'Send reminder' : 'Not eligible'}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Delivery</span>
                                        <h2>Recent messages</h2>
                                    </div>
                                </header>
                                {(messages?.recent || []).length === 0 ? (
                                    <EmptyState icon="mail" title="No messages yet" body="Statements and reminders you send will appear here." />
                                ) : (
                                    <ul className="sb-delivery-list">
                                        {messages.recent.map((delivery) => (
                                            <li key={delivery.id}>
                                                <span className={`sb-delivery-icon sb-delivery-${delivery.status}`}>
                                                    <Icon name={delivery.status === 'sent' ? 'check' : delivery.status === 'failed' ? 'warn' : 'mail'} size={14} />
                                                </span>
                                                <div>
                                                    <strong>{delivery.student || delivery.recipientEmail}</strong>
                                                    <small>{delivery.purpose} · {delivery.recipientEmail} · {delivery.language.toUpperCase()}</small>
                                                    {delivery.error && <em>{delivery.error}</em>}
                                                </div>
                                                <span className="sb-delivery-time">{relativeTime(delivery.sentAt)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportsTab;
