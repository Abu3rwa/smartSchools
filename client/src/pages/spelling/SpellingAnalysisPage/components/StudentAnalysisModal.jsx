import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineX } from 'react-icons/hi';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import spellingAnalysisService from '../../../../services/spellingAnalysisService';

const ERROR_COLORS = ['#14b8a6', '#0ea5e9', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#ef4444', '#8b5cf6'];

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const StatTile = ({ label, value, tone = '' }) => (
    <div className={`sa-stat${tone ? ` is-${tone}` : ''}`}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

export default function StudentAnalysisModal({ language, onClose, studentId, window }) {
    const { t, i18n } = useTranslation(['spellingAnalysis']);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [draftForm, setDraftForm] = useState({ subject: '', body: '', language });
    const [draftBusy, setDraftBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);
    const [confirmSend, setConfirmSend] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await spellingAnalysisService.getStudent({ studentId, window });
            setData(result.data);
            const draft = result.data?.draft;
            setDraftForm({
                subject: draft?.subject || '',
                body: draft?.body || '',
                language: draft?.language || language
            });
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.load')));
        } finally {
            setLoading(false);
        }
    }, [studentId, window, language, t]);

    useEffect(() => {
        load();
    }, [load]);

    const runAnalysis = async () => {
        setRunning(true);
        try {
            const result = await spellingAnalysisService.runStudent({ studentId, window, language });
            if (result.data?.cached) toast.success(t('spellingAnalysis:run.cached'));
            await load();
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.run')));
        } finally {
            setRunning(false);
        }
    };

    const generateDraft = async () => {
        setDraftBusy(true);
        try {
            const result = await spellingAnalysisService.createParentDraft({
                studentId,
                window,
                language: draftForm.language
            });
            setData((current) => ({ ...current, draft: result.data }));
            setDraftForm({
                subject: result.data.subject || '',
                body: result.data.body || '',
                language: result.data.language || draftForm.language
            });
            setConfirmSend(false);
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.draft')));
        } finally {
            setDraftBusy(false);
        }
    };

    const saveDraft = async () => {
        if (!data?.draft) return;
        setSaving(true);
        try {
            const result = await spellingAnalysisService.updateParentDraft({
                draftId: data.draft._id,
                subject: draftForm.subject,
                body: draftForm.body
            });
            setData((current) => ({ ...current, draft: result.data }));
            toast.success(t('spellingAnalysis:draft.saved'));
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.draft')));
        } finally {
            setSaving(false);
        }
    };

    const sendDraft = async () => {
        if (!data?.draft) return;
        setSending(true);
        try {
            const result = await spellingAnalysisService.sendParentDraft(data.draft._id);
            setData((current) => ({ ...current, draft: result.data }));
            setConfirmSend(false);
            toast.success(t('spellingAnalysis:draft.sentToast'));
        } catch (error) {
            toast.error(errorMessage(error, t('spellingAnalysis:errors.send')));
        } finally {
            setSending(false);
        }
    };

    const analysis = data?.analysis || null;
    const metrics = analysis?.metrics || {};
    const draft = data?.draft || null;
    const sent = draft?.status === 'sent';
    const noParents = data && data.parentEmailCount === 0;

    return (
        <div className="modal-overlay">
            <div className="modal sa-modal">
                <div className="modal-header">
                    <div>
                        <h2>{data?.student?.studentName || t('spellingAnalysis:analysis.title')}</h2>
                        <p className="sa-sub">
                            {window.kind === 'all' ? t('spellingAnalysis:period.allTime') : window.key}
                        </p>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('spellingAnalysis:actions.close')}>
                        <HiOutlineX size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="sa-loading"><div className="spinner" /></div>
                    ) : !analysis ? (
                        <div className="sa-empty-block">
                            <p>{t('spellingAnalysis:analysis.notAnalyzed')}</p>
                            <button type="button" className="btn btn-primary btn-sm" disabled={running} onClick={runAnalysis}>
                                {running ? t('spellingAnalysis:run.running') : t('spellingAnalysis:actions.analyze')}
                            </button>
                        </div>
                    ) : (
                        <>
                            {analysis.status === 'failed' && (
                                <div className="sa-warning">
                                    <span>{t('spellingAnalysis:analysis.failed')}</span>
                                    <button type="button" className="btn btn-primary btn-sm" disabled={running} onClick={runAnalysis}>
                                        {running ? t('spellingAnalysis:run.running') : t('spellingAnalysis:actions.rerun')}
                                    </button>
                                </div>
                            )}

                            <div className="sa-stats">
                                <StatTile label={t('spellingAnalysis:analysis.accuracy')} value={`${metrics.accuracy || 0}%`} tone="primary" />
                                <StatTile label={t('spellingAnalysis:analysis.recovery')} value={`${metrics.recoveryRate || 0}%`} tone="success" />
                                <StatTile label={t('spellingAnalysis:analysis.flagged')} value={metrics.flagged || 0} />
                                <StatTile label={t('spellingAnalysis:analysis.resolved')} value={metrics.resolved || 0} />
                                <StatTile label={t('spellingAnalysis:analysis.practiceMastered')} value={metrics.practiceMastered || 0} />
                                <StatTile
                                    label={t('spellingAnalysis:analysis.overdue')}
                                    value={metrics.overdue || 0}
                                    tone={metrics.overdue > 0 ? 'danger' : ''}
                                />
                                <StatTile label={t('spellingAnalysis:analysis.recurrence')} value={metrics.recurrence || 0} />
                                <StatTile
                                    label={t('spellingAnalysis:analysis.avgDays')}
                                    value={metrics.averageRecoveryDays == null ? t('spellingAnalysis:common.dash') : metrics.averageRecoveryDays}
                                />
                            </div>

                            {metrics.months?.length > 1 && (
                                <div className="sa-chart">
                                    <h3>{t('spellingAnalysis:analysis.monthsChart')}</h3>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <LineChart data={metrics.months} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="key" tick={{ fontSize: 12 }} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                                            <Tooltip formatter={(value) => `${value}%`} />
                                            <Legend />
                                            <Line
                                                type="monotone"
                                                dataKey="accuracy"
                                                name={t('spellingAnalysis:analysis.accuracy')}
                                                stroke="#14b8a6"
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="recoveryRate"
                                                name={t('spellingAnalysis:analysis.recovery')}
                                                stroke="#f59e0b"
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {metrics.errorTypes?.length > 0 && (
                                <div className="sa-chart">
                                    <h3>{t('spellingAnalysis:analysis.errorTypes')}</h3>
                                    <ResponsiveContainer width="100%" height={Math.max(160, metrics.errorTypes.length * 34)}>
                                        <BarChart
                                            data={metrics.errorTypes.map((row) => ({
                                                ...row,
                                                label: t(`spellingAnalysis:errorTypes.${row.type}`, row.type)
                                            }))}
                                            layout="vertical"
                                            margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                                            <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12 }} />
                                            <Tooltip />
                                            <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18}>
                                                {metrics.errorTypes.map((row, index) => (
                                                    <Cell key={row.type} fill={ERROR_COLORS[index % ERROR_COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {metrics.categories?.length > 0 && (
                                <div className="sa-table-wrap">
                                    <h3>{t('spellingAnalysis:analysis.categories')}</h3>
                                    <table className="sa-table">
                                        <thead>
                                            <tr>
                                                <th>{t('spellingAnalysis:analysis.columns.category')}</th>
                                                <th>{t('spellingAnalysis:analysis.columns.words')}</th>
                                                <th>{t('spellingAnalysis:analysis.columns.misses')}</th>
                                                <th>{t('spellingAnalysis:analysis.columns.accuracy')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metrics.categories.slice(0, 8).map((row) => (
                                                <tr key={row.label}>
                                                    <td className="sa-strong">{row.label}</td>
                                                    <td className="sa-num">{row.attempts}</td>
                                                    <td className="sa-num">{row.misses}</td>
                                                    <td className="sa-num">{row.accuracy}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {(analysis.strengths?.length > 0 || analysis.gaps?.length > 0) && (
                                <div className="sa-two-col">
                                    {analysis.strengths?.length > 0 && (
                                        <div className="sa-list-block is-good">
                                            <h3>{t('spellingAnalysis:analysis.strengths')}</h3>
                                            <ul>{analysis.strengths.map((row) => <li key={row}>{row}</li>)}</ul>
                                        </div>
                                    )}
                                    {analysis.gaps?.length > 0 && (
                                        <div className="sa-list-block is-warn">
                                            <h3>{t('spellingAnalysis:analysis.gaps')}</h3>
                                            <ul>{analysis.gaps.map((row) => <li key={row}>{row}</li>)}</ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {analysis.recommendation && (
                                <div className="sa-recommend">
                                    <h3>{t('spellingAnalysis:analysis.recommendation')}</h3>
                                    <p>{analysis.recommendation}</p>
                                </div>
                            )}

                            {analysis.narrative && <p className="sa-body-text">{analysis.narrative}</p>}

                            <div className="sa-draft">
                                <div className="sa-draft-head">
                                    <div>
                                        <h3>{t('spellingAnalysis:draft.title')}</h3>
                                        <p>{t('spellingAnalysis:draft.hint')}</p>
                                    </div>
                                    <label className="sa-field is-inline">
                                        <span>{t('spellingAnalysis:draft.language')}</span>
                                        <select
                                            value={draftForm.language}
                                            disabled={sent}
                                            onChange={(event) => setDraftForm((current) => ({ ...current, language: event.target.value }))}
                                        >
                                            <option value="en">{t('spellingAnalysis:draft.langEn')}</option>
                                            <option value="ar">{t('spellingAnalysis:draft.langAr')}</option>
                                        </select>
                                    </label>
                                </div>

                                {noParents && <p className="sa-error">{t('spellingAnalysis:draft.noParents')}</p>}

                                {!draft ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        disabled={draftBusy || noParents || analysis.status !== 'ready'}
                                        onClick={generateDraft}
                                    >
                                        {draftBusy ? t('spellingAnalysis:draft.generating') : t('spellingAnalysis:draft.generate')}
                                    </button>
                                ) : (
                                    <div className="sa-draft-editor">
                                        <label className="sa-field">
                                            <span>{t('spellingAnalysis:draft.subject')}</span>
                                            <input
                                                type="text"
                                                value={draftForm.subject}
                                                readOnly={sent}
                                                onChange={(event) => setDraftForm((current) => ({ ...current, subject: event.target.value }))}
                                            />
                                        </label>
                                        <label className="sa-field">
                                            <span>{t('spellingAnalysis:draft.body')}</span>
                                            <textarea
                                                rows={9}
                                                value={draftForm.body}
                                                readOnly={sent}
                                                onChange={(event) => setDraftForm((current) => ({ ...current, body: event.target.value }))}
                                            />
                                        </label>
                                        <p className="sa-sub">
                                            {t('spellingAnalysis:draft.recipients', { value: draft.recipients?.length || 0 })}
                                            {sent && draft.sentAt && (
                                                <> · {t('spellingAnalysis:draft.sentOn', {
                                                    date: new Date(draft.sentAt).toLocaleDateString(i18n.language, {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })
                                                })}</>
                                            )}
                                        </p>
                                        {!sent && (
                                            <div className="sa-draft-actions">
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    disabled={draftBusy}
                                                    onClick={generateDraft}
                                                >
                                                    {draftBusy ? t('spellingAnalysis:draft.generating') : t('spellingAnalysis:draft.regenerate')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    disabled={saving || !draftForm.subject.trim() || !draftForm.body.trim()}
                                                    onClick={saveDraft}
                                                >
                                                    {saving ? t('spellingAnalysis:draft.saving') : t('spellingAnalysis:draft.save')}
                                                </button>
                                                {confirmSend ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary btn-sm"
                                                            disabled={sending}
                                                            onClick={sendDraft}
                                                        >
                                                            {sending ? t('spellingAnalysis:draft.sending') : t('spellingAnalysis:draft.confirmSend')}
                                                        </button>
                                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmSend(false)}>
                                                            {t('spellingAnalysis:actions.cancel')}
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        disabled={sending}
                                                        onClick={() => setConfirmSend(true)}
                                                    >
                                                        {t('spellingAnalysis:draft.send')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
