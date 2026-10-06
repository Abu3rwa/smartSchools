import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import './StudentSpellingPrintReport.css';

const GRADE_ORDER = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

const formatPercent = (value) => `${Number(value) || 0}%`;

const StudentSpellingPrintReport = ({ details }) => {
    const { t, i18n } = useTranslation('spelling');
    const { student, summary, byGrade = [], missedWords = [] } = details;
    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    const orderedGrades = useMemo(() => [...byGrade].sort((a, b) => {
        const aRank = GRADE_ORDER.indexOf(String(a.grade).toUpperCase());
        const bRank = GRADE_ORDER.indexOf(String(b.grade).toUpperCase());
        return (aRank === -1 ? GRADE_ORDER.length : aRank) - (bRank === -1 ? GRADE_ORDER.length : bRank);
    }), [byGrade]);
    const orderedMissedWords = useMemo(() => [...missedWords].sort(
        (a, b) => Number(b.pending) - Number(a.pending)
            || b.originalIncorrectCount - a.originalIncorrectCount
            || String(a.word).localeCompare(String(b.word), locale)
    ), [locale, missedWords]);
    const midpoint = Math.ceil(orderedMissedWords.length / 2);
    const missedWordsCol1 = orderedMissedWords.slice(0, midpoint);
    const missedWordsCol2 = orderedMissedWords.slice(midpoint);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

    const metricsOriginal = [
        { label: t('originalAttempts'), value: summary.originalAttempts },
        { label: t('originalCorrect'), value: summary.originalCorrect },
        { label: t('originalIncorrect'), value: summary.originalIncorrect },
        { label: t('originalAccuracy'), value: formatPercent(summary.originalAccuracy) }
    ];
    const metricsRetest = [
        { label: t('retestAttempts'), value: summary.retestAttempts },
        { label: t('retestCorrect'), value: summary.retestCorrect },
        { label: t('retestIncorrect'), value: summary.retestIncorrect },
        { label: t('retestRecoveryRate'), value: summary.retestAttempts ? formatPercent(summary.retestRecoveryRate) : '—' }
    ];

    const renderMissedWordsTable = (words) => (
        <table className="spelling-print-table spelling-print-missed-table">
            <thead>
                <tr>
                    <th>{t('word')} ({t('grade')})</th>
                    <th className="spelling-print-count">{t('originalIncorrect')}</th>
                    <th className="spelling-print-count">{t('retestCorrectOfAttempts')}</th>
                    <th>{t('status')}</th>
                </tr>
            </thead>
            <tbody>
                {words.map((item) => (
                    <tr key={`${item.grade}-${item.word}`}>
                        <td><span className="spelling-print-word-main">{item.word}</span> ({item.grade})</td>
                        <td className="spelling-print-count">{item.originalIncorrectCount}</td>
                        <td className="spelling-print-count">
                            {t('retestCounts', { correct: item.retestCorrect, attempts: item.retestAttempts })}
                        </td>
                        <td>
                            <span className={`spelling-print-badge ${item.pending ? 'is-pending' : 'is-resolved'}`}>
                                {item.pending ? t('pending') : t('resolved')}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <article className="spelling-print-report" dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}>
            <header className="spelling-print-header">
                <div>
                    <p className="spelling-print-eyebrow">{t('spellingReportTitle')}</p>
                    <h1>{studentName || t('student')}</h1>
                    <p className="spelling-print-subtitle">
                        {t('studentId', { id: student.studentId || t('notSet') })}
                        <span aria-hidden="true"> · </span>
                        {student.currentGrade || t('notSet')} · {student.currentWeek
                            ? t('weekWithNumber', { week: student.currentWeek })
                            : t('notSet')}
                    </p>
                </div>
            </header>

            <section className={`spelling-print-pending${summary.pendingRetests > 0 ? ' is-pending' : ''}`}>
                <strong>{t('pendingRetests')}:</strong> {summary.pendingRetests}
                {summary.overdueRetests > 0 && (
                    <span> · {t('overdueRetests')}: {summary.overdueRetests}</span>
                )}
                <span> · {t('uniqueWordsEverMissed')}: {summary.uniqueWordsEverMissed}</span>
            </section>

            <div className="spelling-print-split-layout spelling-print-metric-layout">
                <section className="spelling-print-section spelling-print-split-half">
                    <h2>{t('originalTests')}</h2>
                    <div className="spelling-print-metrics">
                        {metricsOriginal.map((metric) => (
                            <div className="spelling-print-metric" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="spelling-print-section spelling-print-split-half">
                    <h2>{t('retests')}</h2>
                    <div className="spelling-print-metrics">
                        {metricsRetest.map((metric) => (
                            <div className="spelling-print-metric" key={metric.label}>
                                <span>{metric.label}</span>
                                <strong>{metric.value}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className="spelling-print-section spelling-print-performance">
                <h2>{t('gradePerformance')}</h2>
                {orderedGrades.length ? (
                    <div className="spelling-print-performance-layout">
                        <div className="spelling-print-performance-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={orderedGrades} margin={{ top: 22, right: 12, left: 0, bottom: 4 }} barCategoryGap="25%">
                                    <CartesianGrid stroke="#d9dee4" strokeDasharray="3 3" />
                                    <XAxis dataKey="grade" />
                                    <YAxis allowDecimals={false} width={35} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="originalCorrect" name={t('originalCorrect')} fill="#2e7d32" isAnimationActive={false}>
                                        <LabelList dataKey="originalCorrect" position="top" />
                                    </Bar>
                                    <Bar dataKey="originalIncorrect" name={t('originalIncorrect')} fill="#c62828" isAnimationActive={false}>
                                        <LabelList dataKey="originalIncorrect" position="top" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="spelling-print-performance-table-wrapper">
                            <table className="spelling-print-table">
                                <thead>
                                    <tr>
                                        <th>{t('grade')}</th>
                                        <th className="spelling-print-count">{t('originalCorrect')}</th>
                                        <th className="spelling-print-count">{t('originalIncorrect')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderedGrades.map((item) => (
                                        <tr key={item.grade}>
                                            <td>{item.grade}</td>
                                            <td className="spelling-print-count">{item.originalCorrect}</td>
                                            <td className="spelling-print-count">{item.originalIncorrect}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : <p className="spelling-print-empty">{t('noData')}</p>}
            </section>

            <section className="spelling-print-section spelling-print-words">
                <h2>{t('missedWords')}</h2>
                {orderedMissedWords.length ? (
                    <div className="spelling-print-split-layout">
                        <div className="spelling-print-split-half">
                            {renderMissedWordsTable(missedWordsCol1)}
                        </div>
                        <div className="spelling-print-split-half">
                            {missedWordsCol2.length > 0 && renderMissedWordsTable(missedWordsCol2)}
                        </div>
                    </div>
                ) : <p className="spelling-print-empty">{t('noMissedWords')}</p>}
            </section>

        </article>
    );
};

export default StudentSpellingPrintReport;
