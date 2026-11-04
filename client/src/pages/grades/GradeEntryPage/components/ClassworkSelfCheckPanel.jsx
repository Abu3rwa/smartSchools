import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import { buildSelfCheckPatch, withRemovedTicks } from '../utils/selfCheckMarks';
import './ClassworkSelfCheckPanel.css';

const ClassworkSelfCheckPanel = ({
    classId,
    subjectId,
    date,
    maxMarks,
    grades,
    onApplyMarks,
    onStudentsChange,
    disabled = false
}) => {
    const { t, i18n } = useTranslation(['grades']);
    const [check, setCheck] = useState(null);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [lastRefreshed, setLastRefreshed] = useState(null);
    // Ticks the teacher removed, by student id; they survive Refresh until the class, subject or date changes.
    const [removed, setRemoved] = useState({});

    const load = useCallback(async () => {
        if (!classId || !subjectId) return;
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/classwork-checks/current', {
                params: { classId, subjectId, date }
            });
            const data = response.data?.data || {};
            const rows = Array.isArray(data.students) ? data.students : [];
            setCheck(data.check || null);
            setStudents(rows);
            setLastRefreshed(new Date());
        } catch {
            setError(t('grades:selfCheck.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [classId, date, subjectId, t]);

    useEffect(() => {
        setCheck(null);
        setStudents([]);
        setRemoved({});
        setLastRefreshed(null);
        setError('');
        load();
    }, [load]);

    const adjusted = useMemo(
        () => students.map((row) => withRemovedTicks(row, removed[row.student?.id], check?.maxMarks ?? maxMarks)),
        [students, removed, check?.maxMarks, maxMarks]
    );

    useEffect(() => {
        onStudentsChange?.(adjusted);
    }, [adjusted, onStudentsChange]);

    const toggleTick = (studentId, ruleId) => {
        setRemoved((current) => {
            const list = current[studentId] || [];
            return {
                ...current,
                [studentId]: list.includes(ruleId) ? list.filter((id) => id !== ruleId) : [...list, ruleId]
            };
        });
    };

    const isOpen = check?.status === 'open';
    const submittedCount = students.filter((row) => row.submitted).length;

    const toggleCheck = async (event) => {
        const nextOpen = event.target.checked;
        setBusy(true);
        setError('');
        try {
            const response = await api.put('/classwork-checks', {
                classId,
                subjectId,
                date,
                open: nextOpen,
                maxMarks
            });
            const nextCheck = response.data?.data?.check || null;
            setCheck(nextCheck);
            if (nextOpen) {
                await load();
            } else {
                setLastRefreshed(new Date());
            }
        } catch {
            setError(t('grades:selfCheck.toggleFailed'));
        } finally {
            setBusy(false);
        }
    };

    const useMarks = () => {
        const rows = adjusted
            .filter((row) => row.submitted)
            .map((row) => ({
                studentId: row.student.id,
                marks: row.score,
                remarks: row.remark
            }));
        if (!rows.length) {
            toast.error(t('grades:selfCheck.nothingToApply'));
            return;
        }

        const fill = buildSelfCheckPatch({ rows, grades, overwrite: false });
        const overwrite = fill.conflicts > 0
            ? window.confirm(t('grades:selfCheck.confirmReplace'))
            : false;
        const result = overwrite
            ? buildSelfCheckPatch({ rows, grades, overwrite: true })
            : fill;

        if (!result.updated) {
            toast.error(t('grades:selfCheck.alreadyEntered'));
            return;
        }
        onApplyMarks(result.patch);
        toast.success(t('grades:selfCheck.applied'));
    };

    const refreshedLabel = lastRefreshed
        ? t('grades:selfCheck.refreshHint', {
            time: lastRefreshed.toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit'
            })
        })
        : t('grades:selfCheck.neverRefreshed');

    return (
        <section className="card self-check-panel">
            <div className="self-check-head">
                <div className="self-check-heading">
                    <h3 className="card-title">{t('grades:selfCheck.title')}</h3>
                    <p className="self-check-subtitle">{t('grades:selfCheck.subtitle')}</p>
                </div>
                <div className="self-check-controls">
                    <label className="self-check-switch">
                        <input
                            type="checkbox"
                            role="switch"
                            checked={isOpen}
                            onChange={toggleCheck}
                            disabled={busy || disabled}
                        />
                        <span className="self-check-switch-track" aria-hidden="true">
                            <span className="self-check-switch-thumb" />
                        </span>
                        <span className="self-check-switch-label">{t('grades:selfCheck.switchLabel')}</span>
                    </label>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={load}
                        disabled={loading || busy || !classId || !subjectId}
                    >
                        {loading ? t('grades:selfCheck.refreshing') : t('grades:selfCheck.refresh')}
                    </button>
                </div>
            </div>

            {error && <div className="self-check-error" role="alert">{error}</div>}

            {!error && !check && !loading && (
                <p className="self-check-hint">{t('grades:selfCheck.offHint')}</p>
            )}

            {check && (
                <>
                    <div className="self-check-meta">
                        <span>{t('grades:selfCheck.submittedCount', {
                            submitted: submittedCount,
                            total: students.length
                        })}</span>
                        <span>{refreshedLabel}</span>
                    </div>

                    {students.length > 0 ? (
                        <div className="self-check-table-wrap">
                            <table className="self-check-table">
                                <thead>
                                    <tr>
                                        <th>{t('grades:selfCheck.columns.student')}</th>
                                        <th>{t('grades:selfCheck.columns.ticked')}</th>
                                        <th>{t('grades:selfCheck.columns.mark')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((row, index) => {
                                        const view = adjusted[index] || row;
                                        const removedIds = removed[row.student.id] || [];
                                        return (
                                        <tr
                                            key={row.student.id}
                                            className={row.submitted ? '' : 'is-pending'}
                                        >
                                            <td className="self-check-student">{row.student.name}</td>
                                            <td>
                                                {row.submitted && row.selectedRules.length > 0 && (
                                                    <span className="self-check-chips">
                                                        {row.selectedRules.map((rule) => {
                                                            const isRemoved = removedIds.includes(rule.id);
                                                            return (
                                                                <span
                                                                    key={rule.id}
                                                                    className={`self-check-chip ${rule.value > 0 ? 'positive' : 'negative'}${isRemoved ? ' is-removed' : ''}`}
                                                                >
                                                                    {rule.label}
                                                                    <button
                                                                        type="button"
                                                                        className="self-check-chip-x"
                                                                        onClick={() => toggleTick(row.student.id, rule.id)}
                                                                        aria-label={t(
                                                                            isRemoved ? 'grades:selfCheck.restoreTick' : 'grades:selfCheck.removeTick',
                                                                            { label: rule.label }
                                                                        )}
                                                                        title={t(
                                                                            isRemoved ? 'grades:selfCheck.restoreTick' : 'grades:selfCheck.removeTick',
                                                                            { label: rule.label }
                                                                        )}
                                                                    >
                                                                        {isRemoved ? '↺' : '×'}
                                                                    </button>
                                                                </span>
                                                            );
                                                        })}
                                                    </span>
                                                )}
                                                {row.submitted && row.selectedRules.length === 0 && (
                                                    <span className="self-check-muted">
                                                        {t('grades:selfCheck.submitted')}
                                                    </span>
                                                )}
                                                {!row.submitted && (
                                                    <span className="self-check-muted">
                                                        {t('grades:selfCheck.notSubmitted')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="self-check-mark">
                                                {row.submitted
                                                    ? `${view.score} / ${check.maxMarks}`
                                                    : '—'}
                                                {row.submitted && view.originalScore !== undefined && (
                                                    <span className="self-check-was">
                                                        {t('grades:selfCheck.wasMark', { n: view.originalScore })}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="self-check-hint">{t('grades:selfCheck.noStudents')}</p>
                    )}

                    <div className="self-check-footer">
                        <span className="self-check-hint">{t('grades:selfCheck.useMarksHint')}</span>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={useMarks}
                            disabled={!submittedCount || loading || busy}
                        >
                            {t('grades:selfCheck.useMarks')}
                        </button>
                    </div>
                </>
            )}
        </section>
    );
};

export default ClassworkSelfCheckPanel;
