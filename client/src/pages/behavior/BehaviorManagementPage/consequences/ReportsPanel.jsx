import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineChartBar } from 'react-icons/hi';
import { fetchBehaviorReports } from '../../../../api/behaviorApi';
import { toIsoDateInput } from './consequenceUtils';

const startOfWeek = (row) => `${row.year}-W${String(row.week).padStart(2, '0')}`;

const BarList = ({ rows, labelKey, valueKey = 'incidents' }) => {
    const max = Math.max(...rows.map((row) => row[valueKey] || 0), 1);
    return (
        <div className="bc-bar-list">
            {rows.map((row, index) => (
                <div className="bc-bar-row" key={`${row[labelKey]}-${index}`}>
                    <span title={String(row[labelKey] ?? '')}>{row[labelKey] ?? '-'}</span>
                    <div className="bc-meter">
                        <span style={{ width: `${Math.round(((row[valueKey] || 0) / max) * 100)}%` }} />
                    </div>
                    <span className="bc-consequence-meta">{row[valueKey] || 0}</span>
                </div>
            ))}
        </div>
    );
};

const ReportsPanel = () => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [report, setReport] = useState(null);
    const [range, setRange] = useState({ from: '', to: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError('');
            try {
                const params = {};
                if (range.from) params.from = new Date(`${range.from}T00:00:00`).toISOString();
                if (range.to) params.to = new Date(`${range.to}T23:59:59`).toISOString();
                const payload = await fetchBehaviorReports(params);
                if (!cancelled) setReport(payload?.report || null);
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError?.response?.data?.message || t('reports.loadFailed'));
                    toast.error(t('reports.loadFailed'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [range, t]);

    const stats = useMemo(() => (report ? [
        { key: 'incidents', value: report.totals?.incidents ?? 0 },
        { key: 'counted', value: report.totals?.counted ?? 0 },
        { key: 'openTasks', value: report.totals?.openTasks ?? 0 },
        { key: 'overdueTasks', value: report.totals?.overdueTasks ?? 0 },
        { key: 'pendingApprovals', value: report.totals?.pendingApprovals ?? 0 },
        { key: 'flagged', value: report.totals?.flagged ?? 0 }
    ] : []), [report]);

    return (
        <div className="bc-panel">
            <div className="bc-panel-head">
                <div>
                    <h2>{t('reports.title')}</h2>
                    <p>{t('reports.subtitle')}</p>
                </div>
                <div className="bc-actions">
                    <input
                        type="date"
                        max={range.to || toIsoDateInput()}
                        value={range.from}
                        onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
                        aria-label={t('common.from')}
                    />
                    <input
                        type="date"
                        min={range.from || undefined}
                        max={toIsoDateInput()}
                        value={range.to}
                        onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
                        aria-label={t('common.to')}
                    />
                </div>
            </div>

            {loading && <div className="bc-loading">{t('common.loading')}</div>}
            {!loading && error && <div className="bc-error">{error}</div>}

            {!loading && !error && report && (
                <>
                    <div className="bc-stat-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        {stats.map((stat) => (
                            <div className="bc-stat" key={stat.key}>
                                <div className="bc-stat-value">{stat.value}</div>
                                <div className="bc-stat-label">{t(`reports.stats.${stat.key}`)}</div>
                            </div>
                        ))}
                    </div>

                    <div className="bc-sections">
                        <div className="bc-section">
                            <h3>{t('reports.byBehavior')}</h3>
                            {report.byBehavior?.length
                                ? <BarList rows={report.byBehavior} labelKey="name" />
                                : <p className="bc-hint">{t('reports.noData')}</p>}
                        </div>

                        <div className="bc-section">
                            <h3>{t('reports.byStep')}</h3>
                            {report.byStep?.length ? (
                                <table className="bc-table">
                                    <thead>
                                        <tr>
                                            <th>{t('reports.step')}</th>
                                            <th>{t('reports.incidents')}</th>
                                            <th>{t('reports.overrides')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.byStep.map((row) => (
                                            <tr key={row.order}>
                                                <td>{row.order}</td>
                                                <td>{row.incidents}</td>
                                                <td>{row.overrides}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="bc-hint">{t('reports.noData')}</p>}
                        </div>

                        <div className="bc-section">
                            <h3>{t('reports.byStatus')}</h3>
                            <div className="bc-audit">
                                {report.byStatus?.filter((row) => row.count > 0).map((row) => (
                                    <div className="bc-audit-row" key={row.status}>
                                        <span>{t(`statuses.${row.status}`)}</span>
                                        <span>{row.count}</span>
                                    </div>
                                ))}
                                {!report.byStatus?.filter((row) => row.count > 0).length && (
                                    <p className="bc-hint">{t('reports.noData')}</p>
                                )}
                            </div>
                        </div>

                        <div className="bc-section">
                            <h3>{t('reports.tasks')}</h3>
                            <div className="bc-audit">
                                {report.byTaskStatus?.map((row) => (
                                    <div className="bc-audit-row" key={row.status}>
                                        <span>{t(`taskStatuses.${row.status}`)}</span>
                                        <span>{row.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bc-section">
                            <h3>{t('reports.approval')}</h3>
                            <p className="bc-item-sub">
                                {t('reports.approvalDecided', { value: report.approval?.decided ?? 0 })}
                            </p>
                            <p className="bc-item-sub">
                                {t('reports.approvalSplit', {
                                    approved: report.approval?.approved ?? 0,
                                    rejected: report.approval?.rejected ?? 0
                                })}
                            </p>
                            <p className="bc-hint">
                                {report.approval?.avgHours
                                    ? t('reports.approvalLatency', { hours: Math.round(report.approval.avgHours) })
                                    : t('reports.noData')}
                            </p>
                        </div>

                        <div className="bc-section">
                            <h3>{t('reports.trend')}</h3>
                            {report.byWeek?.length ? (
                                <div className="bc-bar-list">
                                    {report.byWeek.slice(-12).map((row) => (
                                        <div className="bc-bar-row" key={startOfWeek(row)}>
                                            <span>{startOfWeek(row)}</span>
                                            <div className="bc-meter">
                                                <span style={{
                                                    width: `${Math.round((row.incidents / Math.max(...report.byWeek.map((entry) => entry.incidents), 1)) * 100)}%`
                                                }} />
                                            </div>
                                            <span className="bc-consequence-meta">{row.incidents}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="bc-hint">{t('reports.noData')}</p>}
                        </div>

                        <div className="bc-section" style={{ gridColumn: '1 / -1' }}>
                            <h3>{t('reports.topStudents')}</h3>
                            {report.topStudents?.length ? (
                                <table className="bc-table">
                                    <thead>
                                        <tr>
                                            <th>{t('ledger.student')}</th>
                                            <th>{t('reports.incidents')}</th>
                                            <th>{t('reports.distinctBehaviors')}</th>
                                            <th>{t('reports.serious')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.topStudents.map((row) => (
                                            <tr key={`${row.student}-${row.firstName}`}>
                                                <td>{[row.firstName, row.lastName].filter(Boolean).join(' ')}{row.studentId ? ` (${row.studentId})` : ''}</td>
                                                <td>{row.incidents}</td>
                                                <td>{row.distinctBehaviors}</td>
                                                <td>{row.serious}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p className="bc-hint">{t('reports.noData')}</p>}
                        </div>
                    </div>

                    <div
                        className={`bc-alert ${report.emailDelivery?.transportEnabled ? 'bc-alert-info' : 'bc-alert-warning'}`}
                        style={{ marginTop: 'var(--spacing-md)' }}
                    >
                        <HiOutlineChartBar />
                        <div>
                            <strong>
                                {report.emailDelivery?.transportEnabled
                                    ? t('reports.emailNoticeLive')
                                    : t('reports.emailNotice')}
                            </strong>
                            {report.emailDelivery?.transportEnabled
                                ? t('reports.emailNoticeLiveBody', {
                                    sent: report.emailDelivery?.counts?.sent ?? 0,
                                    queued: report.emailDelivery?.counts?.draft ?? 0,
                                    failed: report.emailDelivery?.counts?.failed ?? 0
                                })
                                : t('reports.emailNoticeBody', {
                                    value: report.emailDelivery?.draftedOrSuppressed ?? 0
                                })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ReportsPanel;
