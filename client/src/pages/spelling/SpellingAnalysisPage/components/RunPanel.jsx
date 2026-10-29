import { useTranslation } from 'react-i18next';
import { HiOutlinePlay, HiOutlineEye } from 'react-icons/hi';

const statusOf = (student) => {
    if (!student.analysis) return 'not-analyzed';
    if (student.analysis.status === 'failed') return 'failed';
    if (student.analysis.stale) return 'stale';
    return 'ready';
};

export default function RunPanel({
    batch,
    loading,
    onRun,
    onRunMissing,
    onView,
    pendingCount,
    runningId,
    students
}) {
    const { t, i18n } = useTranslation(['spellingAnalysis']);
    const busy = Boolean(batch) || Boolean(runningId);

    return (
        <section className="sa-card">
            <header className="sa-card-head">
                <div>
                    <h2>{t('spellingAnalysis:students.title')}</h2>
                    <p>{t('spellingAnalysis:students.hint')}</p>
                </div>
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy || loading || pendingCount === 0}
                    onClick={onRunMissing}
                >
                    <HiOutlinePlay size={15} aria-hidden="true" />
                    {t('spellingAnalysis:actions.runMissing', { value: pendingCount })}
                </button>
            </header>

            {batch && (
                <p className="sa-progress" aria-live="polite">
                    {t('spellingAnalysis:run.progress', { done: batch.done, total: batch.total })}
                </p>
            )}

            {loading ? (
                <div className="sa-loading"><div className="spinner" /></div>
            ) : students.length === 0 ? (
                <p className="sa-empty">{t('spellingAnalysis:students.empty')}</p>
            ) : (
                <div className="sa-table-wrap">
                    <table className="sa-table">
                        <thead>
                            <tr>
                                <th>{t('spellingAnalysis:students.columns.student')}</th>
                                <th>{t('spellingAnalysis:students.columns.class')}</th>
                                <th>{t('spellingAnalysis:students.columns.words')}</th>
                                <th>{t('spellingAnalysis:students.columns.status')}</th>
                                <th aria-label={t('spellingAnalysis:students.columns.actions')} />
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student) => {
                                const status = statusOf(student);
                                return (
                                    <tr key={student.studentId}>
                                        <td className="sa-strong">{student.studentName}</td>
                                        <td>{student.className || t('spellingAnalysis:common.dash')}</td>
                                        <td className="sa-num">{student.attempts}</td>
                                        <td>
                                            <span className={`sa-pill is-${status}`}>
                                                {t(`spellingAnalysis:status.${status}`)}
                                            </span>
                                            {student.analysis?.generatedAt && status === 'ready' && (
                                                <span className="sa-sub">
                                                    {new Date(student.analysis.generatedAt).toLocaleDateString(i18n.language, {
                                                        day: '2-digit',
                                                        month: 'short'
                                                    })}
                                                </span>
                                            )}
                                        </td>
                                        <td className="sa-actions">
                                            {student.analysis && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => onView(student.studentId)}
                                                >
                                                    <HiOutlineEye size={15} aria-hidden="true" />
                                                    {t('spellingAnalysis:actions.view')}
                                                </button>
                                            )}
                                            {status !== 'ready' && (
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    disabled={busy}
                                                    onClick={() => onRun(student.studentId)}
                                                >
                                                    {runningId === student.studentId
                                                        ? t('spellingAnalysis:run.running')
                                                        : t(status === 'stale'
                                                            ? 'spellingAnalysis:actions.rerun'
                                                            : 'spellingAnalysis:actions.analyze')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
