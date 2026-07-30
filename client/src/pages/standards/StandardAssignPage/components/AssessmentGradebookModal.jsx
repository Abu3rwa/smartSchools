import { useState, useEffect } from 'react';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineEye, HiOutlineArrowLeft } from 'react-icons/hi';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import { useTranslation } from 'react-i18next';
import api from '../../../../config/api';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const openPrintDocument = ({ title, htmlBody, isRtl = false }) => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!printWindow) return;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(title)}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 24px;
                    color: #111827;
                }

                h1, h2, h3 {
                    margin: 0 0 10px;
                    color: #0f172a;
                }

                h1 {
                    font-size: 1.4rem;
                }

                h2 {
                    margin-top: 18px;
                    font-size: 1.1rem;
                }

                .meta {
                    color: #4b5563;
                    margin-bottom: 12px;
                    font-size: 0.92rem;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 10px;
                    margin: 10px 0 14px;
                }

                .card {
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    padding: 10px;
                    background: #f9fafb;
                }

                .card .label {
                    display: block;
                    font-size: 0.78rem;
                    color: #6b7280;
                    margin-bottom: 4px;
                }

                .card .value {
                    font-size: 1rem;
                    font-weight: 700;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }

                th,
                td {
                    border: 1px solid #d1d5db;
                    padding: 8px;
                    text-align: ${isRtl ? 'right' : 'left'};
                    font-size: 0.85rem;
                    vertical-align: top;
                }

                th {
                    background: #f3f4f6;
                    font-weight: 700;
                }

                .muted {
                    color: #6b7280;
                }

                .section {
                    margin-top: 16px;
                }

                @media print {
                    body {
                        margin: 12mm;
                    }

                    .section {
                        page-break-inside: avoid;
                    }
                }
            </style>
        </head>
        <body>
            ${htmlBody}
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
    }, 150);
};

const EditableScale4Cell = ({ value, isManual, onSave }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    const handleClick = () => {
        setDraft(value != null ? String(value) : '');
        setEditing(true);
    };

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed === '') {
            onSave(null);
            return;
        }
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num < 0 || num > 4) return;
        const rounded = Number(num.toFixed(2));
        if (rounded !== value) onSave(rounded);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
    };

    if (editing) {
        return (
            <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                autoFocus
                style={{ width: 56, textAlign: 'center', fontSize: 13, padding: '2px 4px' }}
            />
        );
    }

    return (
        <span
            onClick={handleClick}
            title="Click to override"
            style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-muted)', display: 'inline-block', minWidth: 28, textAlign: 'center' }}
        >
            {value != null ? value : '—'}
            {isManual && <span style={{ fontSize: 10, marginLeft: 3, color: 'var(--primary)' }}>✎</span>}
        </span>
    );
};

/** Student Attempt Detail Panel — shows full questions + teacher override */
const StudentAttemptDetailPanel = ({ studentId, assignmentId, studentName, onBack }) => {
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;
    const isRtl = i18n.resolvedLanguage === 'ar';
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [overriding, setOverriding] = useState(null);

    useEffect(() => {
        if (!studentId || !assignmentId) return;
        setLoading(true);
        setError('');
        api.get(`/practice/attempts/student/${studentId}/assessment/${assignmentId}`)
            .then((res) => {
                setAttempts(res?.data?.data?.attempts || []);
            })
            .catch((err) => {
                setError(err?.response?.data?.message || 'Failed to load attempts');
            })
            .finally(() => setLoading(false));
    }, [studentId, assignmentId]);

    const handleOverride = async (attemptId, newIsCorrect) => {
        setOverriding(attemptId);
        try {
            await api.put(`/practice/attempts/${attemptId}/override`, {
                isCorrect: newIsCorrect,
                reason: newIsCorrect ? 'Teacher marked correct' : 'Teacher marked incorrect',
            });
            setAttempts((prev) =>
                prev.map((a) =>
                    a._id === attemptId
                        ? {
                              ...a,
                              effectiveIsCorrect: newIsCorrect,
                              teacherOverride: {
                                  ...a.teacherOverride,
                                  isCorrect: newIsCorrect,
                                  overriddenAt: new Date().toISOString(),
                              },
                          }
                        : a,
                ),
            );
        } catch (err) {
            alert(err?.response?.data?.message || 'Override failed');
        } finally {
            setOverriding(null);
        }
    };

    const handlePrintStudentReport = () => {
        const generatedAt = new Date().toLocaleString(locale);
        const attemptsRows = attempts
            .map((attempt, index) => {
                const isCorrect = attempt.effectiveIsCorrect ?? attempt.isCorrect;
                const statusLabel = isCorrect
                    ? t('standardAssign:progress.correct', { defaultValue: 'Correct' })
                    : t('standardAssign:progress.needsReview', { defaultValue: 'Incorrect' });

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHtml(statusLabel)}</td>
                        <td>${escapeHtml(String(attempt.questionType || '').replace(/_/g, ' '))}</td>
                        <td>${escapeHtml(attempt.difficulty || 'N/A')}</td>
                        <td>${escapeHtml(attempt.studentAnswer || '—')}</td>
                        <td>${escapeHtml(attempt.correctAnswer || '—')}</td>
                        <td>${escapeHtml(attempt.questionText || '')}</td>
                    </tr>
                `;
            })
            .join('');

        const reportTitle = t('standardAssign:reports.studentReportTitle', {
            defaultValue: 'Student Test Result'
        });

        openPrintDocument({
            title: `${reportTitle} - ${studentName}`,
            isRtl,
            htmlBody: `
                <h1>${escapeHtml(reportTitle)}</h1>
                <div class="meta">${escapeHtml(studentName)} • ${escapeHtml(
                    t('standardAssign:reports.assignmentId', {
                        defaultValue: 'Assignment'
                    })
                )}: ${escapeHtml(assignmentId)}</div>
                <div class="meta">${escapeHtml(
                    t('standardAssign:reports.generatedAt', {
                        defaultValue: 'Generated at'
                    })
                )}: ${escapeHtml(generatedAt)}</div>

                <div class="section">
                    <h2>${escapeHtml(
                        t('standardAssign:reports.studentAttempts', {
                            defaultValue: 'Student Attempts'
                        })
                    )}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.status'))}</th>
                                <th>${escapeHtml(t('standardAssign:questionPool.labels.questionType'))}</th>
                                <th>${escapeHtml(t('standardAssign:questionPool.labels.difficulty'))}</th>
                                <th>${escapeHtml(
                                    t('standardAssign:reports.studentAnswer', {
                                        defaultValue: 'Student Answer'
                                    })
                                )}</th>
                                <th>${escapeHtml(
                                    t('standardAssign:reports.correctAnswer', {
                                        defaultValue: 'Correct Answer'
                                    })
                                )}</th>
                                <th>${escapeHtml(
                                    t('standardAssign:questionPool.labels.questionTextRequired', {
                                        defaultValue: 'Question Text'
                                    })
                                )}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${attemptsRows || `<tr><td colspan="7">${escapeHtml(
                                t('standardAssign:reports.noAttemptRows', {
                                    defaultValue: 'No attempts available.'
                                })
                            )}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `
        });
    };

    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} />;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                <button
                    onClick={onBack}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        padding: 0,
                    }}
                >
                    <HiOutlineArrowLeft size={16} />
                    {t('standardAssign:actions.backToGradebook', {
                        defaultValue: 'Back to gradebook'
                    })}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handlePrintStudentReport}>
                    {t('standardAssign:actions.printStudentResult', {
                        defaultValue: 'Print Student Result'
                    })}
                </button>
            </div>
            <h4 style={{ marginBottom: 'var(--spacing-md)' }}>
                {studentName} — Attempt Details
            </h4>
            {attempts.length === 0 ? (
                <p className="text-muted">No answered attempts found.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', maxHeight: 500, overflowY: 'auto' }}>
                    {attempts.map((a, idx) => {
                        const isCorrect = a.effectiveIsCorrect ?? a.isCorrect;
                        const hasOverride = a.teacherOverride?.isCorrect != null;
                        return (
                            <div
                                key={a._id}
                                style={{
                                    border: `1px solid ${isCorrect ? 'var(--status-success)' : 'var(--status-error)'}`,
                                    borderRadius: 'var(--radius-md, 8px)',
                                    padding: 'var(--spacing-md, 1rem)',
                                    background: 'var(--bg-secondary)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                            #{a.attemptNumber || idx + 1}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '2px 8px',
                                            borderRadius: 9999,
                                            fontWeight: 600,
                                            background: isCorrect ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                                            color: isCorrect ? 'var(--status-success)' : 'var(--status-error)',
                                        }}>
                                            {isCorrect ? 'Correct' : 'Incorrect'}
                                        </span>
                                        {hasOverride && (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                padding: '2px 6px',
                                                borderRadius: 9999,
                                                fontWeight: 600,
                                                background: 'rgba(var(--brand-rgb-end, 13, 148, 136), 0.15)',
                                                color: 'var(--primary)',
                                            }}>
                                                ✎ Teacher Override
                                            </span>
                                        )}
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {a.difficulty} · {a.questionType?.replace('_', ' ')}
                                            {a.timeSpentSeconds ? ` · ${a.timeSpentSeconds}s` : ''}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                        <button
                                            onClick={() => handleOverride(a._id, true)}
                                            disabled={overriding === a._id}
                                            title="Mark as correct"
                                            style={{
                                                background: isCorrect && hasOverride ? 'var(--status-success)' : 'transparent',
                                                color: isCorrect && hasOverride ? '#fff' : 'var(--status-success)',
                                                border: '1px solid var(--status-success)',
                                                borderRadius: 6,
                                                padding: '4px 8px',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 3,
                                            }}
                                        >
                                            <HiOutlineCheckCircle size={14} /> Correct
                                        </button>
                                        <button
                                            onClick={() => handleOverride(a._id, false)}
                                            disabled={overriding === a._id}
                                            title="Mark as incorrect"
                                            style={{
                                                background: !isCorrect && hasOverride ? 'var(--status-error)' : 'transparent',
                                                color: !isCorrect && hasOverride ? '#fff' : 'var(--status-error)',
                                                border: '1px solid var(--status-error)',
                                                borderRadius: 6,
                                                padding: '4px 8px',
                                                cursor: 'pointer',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 3,
                                            }}
                                        >
                                            <HiOutlineXCircle size={14} /> Incorrect
                                        </button>
                                    </div>
                                </div>

                                {/* Full Question */}
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.5 }}>
                                    <strong>Q:</strong> {a.questionText}
                                </div>

                                {/* Options (MC / T-F) */}
                                {a.options?.length > 0 && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 12 }}>
                                        {a.options.map((opt) => (
                                            <div key={opt.label} style={{
                                                padding: '2px 0',
                                                fontWeight: opt.label === a.correctAnswer ? 700 : 400,
                                                color: opt.label === a.studentAnswer
                                                    ? (isCorrect ? 'var(--status-success)' : 'var(--status-error)')
                                                    : opt.label === a.correctAnswer
                                                        ? 'var(--status-success)'
                                                        : undefined,
                                            }}>
                                                {opt.label}. {opt.text}
                                                {opt.label === a.studentAnswer && ' ← student'}
                                                {opt.label === a.correctAnswer && opt.label !== a.studentAnswer && ' ✓'}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Student Answer + Correct Answer */}
                                <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Student Answer: </span>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.studentAnswer || '—'}</span>
                                </div>
                                <div style={{ fontSize: '0.82rem', marginBottom: 4 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Correct Answer: </span>
                                    <span style={{ color: 'var(--status-success)', fontWeight: 500 }}>{a.correctAnswer || '—'}</span>
                                </div>

                                {/* AI Feedback */}
                                {a.feedbackParts?.correctionOrConfirmation && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                                        {a.feedbackParts.correctionOrConfirmation}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const AssessmentGradebookModal = ({
    show,
    onClose,
    assessmentGradebookLoading,
    assessmentGradebookError,
    assessmentGradebookData,
    assessmentStandardAverageLoading,
    assessmentStandardAverageError,
    assessmentStandardAverageData,
    assessmentGradebookAssignmentId,
    releasingAssessmentResults,
    onRetry,
    onRelease,
    onScoreOverride
}) => {
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;
    const isRtl = i18n.resolvedLanguage === 'ar';
    const [detailStudent, setDetailStudent] = useState(null);

    if (!show) return null;

    const releaseMode = assessmentGradebookData?.assignment?.assessmentConfig?.resultsVisibility;
    const isManualRelease = releaseMode === 'manual_release';
    const submittedCount = Number(assessmentGradebookData?.summary?.submitted || 0);
    const canRelease = isManualRelease && submittedCount > 0;
    const resultsReleaseAt = assessmentGradebookData?.assignment?.assessmentConfig?.resultsReleaseAt
        ? new Date(assessmentGradebookData.assignment.assessmentConfig.resultsReleaseAt).toLocaleString(locale)
        : null;

    const getRowStatusLabel = (status = '') => {
        const normalized = String(status || 'not_started').toLowerCase();
        return t(`standardAssign:progressStatus.${normalized}`, {
            defaultValue: normalized.replace(/_/g, ' ')
        });
    };

    const handlePrintGradebookReport = () => {
        if (!assessmentGradebookData) return;

        const assignment = assessmentGradebookData.assignment || {};
        const summary = assessmentGradebookData.summary || {};
        const rows = Array.isArray(assessmentGradebookData.rows) ? assessmentGradebookData.rows : [];
        const repeatedRows = Array.isArray(assessmentStandardAverageData?.rows)
            ? assessmentStandardAverageData.rows
            : [];

        const totalStudents = Number(summary.totalStudents || 0);
        const released = Number(summary.released || 0);
        const submitted = Number(summary.submitted || 0);
        const inProgress = Number(summary.inProgress || 0);
        const notStarted = Number(summary.notStarted || 0);
        const completionRate =
            totalStudents > 0
                ? Number((((released + submitted) / totalStudents) * 100).toFixed(1))
                : 0;

        const percentageValue = Number(summary.averagePercentage || 0);
        const averagePercentage = Number.isFinite(percentageValue) ? percentageValue : 0;
        const scaleValue = Number(summary.averageScale4 || 0);
        const averageScale4 = Number.isFinite(scaleValue) ? scaleValue : 0;

        const generatedAt = new Date().toLocaleString(locale);
        const assignmentTitle = assignment?.title || assignment?.standard?.name || '-';
        const standardLabel = [assignment?.standard?.code, assignment?.standard?.name]
            .filter(Boolean)
            .join(' - ');
        const classLabel = assignment?.class?.name || '-';
        const subjectLabel = assignment?.subject?.name || '-';

        const studentRowsHtml = rows
            .map((row) => {
                const fullName = `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.trim();
                return `
                    <tr>
                        <td>${escapeHtml(fullName || '-')}</td>
                        <td>${escapeHtml(getRowStatusLabel(row.status || 'not_started'))}</td>
                        <td>${escapeHtml(row.totalAnswered ?? 0)}</td>
                        <td>${escapeHtml(
                            row.score !== null && row.score !== undefined
                                ? `${row.score}/${row.maxScore || 100}`
                                : t('standardAssign:common.na')
                        )}</td>
                        <td>${escapeHtml(
                            row.percentage !== null && row.percentage !== undefined
                                ? `${row.percentage}%`
                                : t('standardAssign:common.na')
                        )}</td>
                        <td>${escapeHtml(
                            row.scale4 !== null && row.scale4 !== undefined
                                ? row.scale4
                                : t('standardAssign:common.na')
                        )}</td>
                        <td>${escapeHtml(row.tabSwitchCount || 0)}</td>
                    </tr>
                `;
            })
            .join('');

        const repeatedRowsHtml = repeatedRows
            .map((row) => {
                const fullName = `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.trim();
                return `
                    <tr>
                        <td>${escapeHtml(fullName || '-')}</td>
                        <td>${escapeHtml(row.attemptCount ?? 0)}</td>
                        <td>${escapeHtml(row.gradedAttemptCount ?? 0)}</td>
                        <td>${escapeHtml(
                            row.averagePercentage !== null && row.averagePercentage !== undefined
                                ? `${row.averagePercentage}%`
                                : t('standardAssign:common.na')
                        )}</td>
                        <td>${escapeHtml(
                            row.averageScale4 !== null && row.averageScale4 !== undefined
                                ? row.averageScale4
                                : t('standardAssign:common.na')
                        )}</td>
                    </tr>
                `;
            })
            .join('');

        openPrintDocument({
            title: t('standardAssign:reports.classReportTitle', {
                defaultValue: 'Assessment Class Progress Report'
            }),
            isRtl,
            htmlBody: `
                <h1>${escapeHtml(
                    t('standardAssign:reports.classReportTitle', {
                        defaultValue: 'Assessment Class Progress Report'
                    })
                )}</h1>
                <div class="meta">${escapeHtml(
                    t('standardAssign:reports.generatedAt', {
                        defaultValue: 'Generated at'
                    })
                )}: ${escapeHtml(generatedAt)}</div>
                <div class="meta">${escapeHtml(
                    t('standardAssign:form.summary.name')
                )}: ${escapeHtml(assignmentTitle)}</div>
                <div class="meta">${escapeHtml(
                    t('standardAssign:form.summary.class')
                )}: ${escapeHtml(classLabel)} • ${escapeHtml(
                    t('standardAssign:form.summary.subject')
                )}: ${escapeHtml(subjectLabel)} • ${escapeHtml(
                    t('standardAssign:form.summary.standard')
                )}: ${escapeHtml(standardLabel || '-')}</div>

                <div class="section">
                    <h2>${escapeHtml(
                        t('standardAssign:reports.overallProgress', {
                            defaultValue: 'Overall Progress'
                        })
                    )}</h2>
                    <div class="grid">
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.total')
                        )}</span><span class="value">${escapeHtml(totalStudents)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.released')
                        )}</span><span class="value">${escapeHtml(released)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.submitted')
                        )}</span><span class="value">${escapeHtml(submitted)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.inProgress')
                        )}</span><span class="value">${escapeHtml(inProgress)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.notStarted')
                        )}</span><span class="value">${escapeHtml(notStarted)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.avgPercentage')
                        )}</span><span class="value">${escapeHtml(`${averagePercentage}%`)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:assessmentGradebook.summary.avgScale')
                        )}</span><span class="value">${escapeHtml(averageScale4)}</span></div>
                    </div>
                </div>

                <div class="section">
                    <h2>${escapeHtml(
                        t('standardAssign:reports.classProgress', {
                            defaultValue: 'Class Progress'
                        })
                    )}</h2>
                    <div class="grid">
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:reports.completionRate', {
                                defaultValue: 'Completion Rate'
                            })
                        )}</span><span class="value">${escapeHtml(`${completionRate}%`)}</span></div>
                        <div class="card"><span class="label">${escapeHtml(
                            t('standardAssign:reports.pendingStudents', {
                                defaultValue: 'Pending Students'
                            })
                        )}</span><span class="value">${escapeHtml(Math.max(totalStudents - (released + submitted), 0))}</span></div>
                    </div>
                </div>

                <div class="section">
                    <h2>${escapeHtml(
                        t('standardAssign:reports.studentResults', {
                            defaultValue: 'Student Test Results'
                        })
                    )}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.student'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.status'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.answered'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.score'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.table.percentage'))}</th>
                                <th>0-4</th>
                                <th>${escapeHtml(
                                    t('standardAssign:reports.tabSwitches', {
                                        defaultValue: 'Tab Switches'
                                    })
                                )}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentRowsHtml || `<tr><td colspan="7">${escapeHtml(
                                t('standardAssign:assessmentGradebook.noData')
                            )}</td></tr>`}
                        </tbody>
                    </table>
                </div>

                <div class="section">
                    <h2>${escapeHtml(
                        t('standardAssign:reports.testSpecificProgress', {
                            defaultValue: 'Test-Specific Progress (Repeated Attempts)'
                        })
                    )}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.averageTable.student'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.averageTable.attempts'))}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.averageTable.graded'))}</th>
                                <th>${escapeHtml(
                                    t('standardAssign:assessmentGradebook.averageTable.averagePercentage')
                                )}</th>
                                <th>${escapeHtml(t('standardAssign:assessmentGradebook.averageTable.averageScale'))}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${repeatedRowsHtml || `<tr><td colspan="5">${escapeHtml(
                                t('standardAssign:assessmentGradebook.noRepeatedData')
                            )}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 820 }}>
                <div className="modal-header">
                    <h3>{t('standardAssign:assessmentGradebook.title')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {assessmentGradebookLoading ? (
                        <LoadingState />
                    ) : assessmentGradebookError ? (
                        <ErrorState
                            message={assessmentGradebookError}
                            onRetry={onRetry}
                            disableRetry={!assessmentGradebookAssignmentId}
                        />
                    ) : !assessmentGradebookData ? (
                        <ErrorState emptyText={t('standardAssign:assessmentGradebook.noData')} />
                    ) : (
                        <>
                            {detailStudent ? (
                                <StudentAttemptDetailPanel
                                    studentId={detailStudent.id}
                                    assignmentId={assessmentGradebookAssignmentId}
                                    studentName={detailStudent.name}
                                    onBack={() => setDetailStudent(null)}
                                />
                            ) : (
                            <>
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <strong>
                                    {assessmentGradebookData.assignment?.title ||
                                        assessmentGradebookData.assignment?.standard?.name}
                                </strong>
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: '0.82rem',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    (
                                    {assessmentGradebookData.assignment?.standard?.code ||
                                        t('standardAssign:assessmentGradebook.assessmentFallback')}
                                    )
                                </span>
                                <p className="text-muted" style={{ marginTop: 6 }}>
                                    {t('standardAssign:assessmentGradebook.subtitle')}
                                </p>
                                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                                    {t('standardAssign:assessmentGradebook.resultsMode')}{' '}
                                    <strong>
                                        {isManualRelease
                                            ? t('standardAssign:assessmentGradebook.manualRelease')
                                            : t('standardAssign:assessmentGradebook.immediateVisibility')}
                                    </strong>
                                    {resultsReleaseAt ? (
                                        <span style={{ marginLeft: 8 }}>
                                            {t('standardAssign:assessmentGradebook.releaseAt')} <strong>{resultsReleaseAt}</strong>
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 'var(--spacing-lg)',
                                    marginBottom: 'var(--spacing-md)',
                                    fontSize: '0.85rem',
                                    flexWrap: 'wrap'
                                }}
                            >
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.total')}{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.totalStudents || 0}
                                    </strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.released')}{' '}
                                    <strong>{assessmentGradebookData.summary?.released || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.submitted')}{' '}
                                    <strong>{assessmentGradebookData.summary?.submitted || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.inProgress')}{' '}
                                    <strong>{assessmentGradebookData.summary?.inProgress || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.notStarted')}{' '}
                                    <strong>{assessmentGradebookData.summary?.notStarted || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.avgPercentage')}{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.averagePercentage || 0}
                                    </strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.avgScale')}{' '}
                                    <strong>{assessmentGradebookData.summary?.averageScale4 || 0}</strong>
                                </span>
                            </div>

                            <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
                                <table className="practice-table">
                                    <thead>
                                        <tr>
                                            <th>{t('standardAssign:assessmentGradebook.table.student')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.status')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.answered')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.score')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.percentage')}</th>
                                            <th>0-4</th>
                                            <th title="Tab switches detected during assessment">⚠ Tab</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(assessmentGradebookData.rows || []).map((row) => (
                                            <tr key={row.student?._id || row.student?.studentId}>
                                                <td>
                                                    {row.student?.firstName} {row.student?.lastName}
                                                </td>
                                                <td>
                                                    {getRowStatusLabel(row.status)}
                                                </td>
                                                <td>{row.totalAnswered ?? 0}</td>
                                                <td>
                                                    {row.score !== null && row.score !== undefined
                                                        ? `${row.score}/${row.maxScore || 100}`
                                                        : t('standardAssign:common.na')}
                                                </td>
                                                <td>
                                                    {row.percentage !== null &&
                                                    row.percentage !== undefined
                                                        ? `${row.percentage}%`
                                                        : t('standardAssign:common.na')}
                                                </td>
                                                <td>
                                                    <EditableScale4Cell
                                                        value={row.scale4}
                                                        isManual={row.isManualEntry}
                                                        onSave={(score) => onScoreOverride && onScoreOverride(row.student?._id, score)}
                                                    />
                                                </td>
                                                <td style={row.tabSwitchCount > 0 ? { color: 'var(--error)', fontWeight: 600 } : undefined}>
                                                    {row.tabSwitchCount || 0}
                                                </td>
                                                <td>
                                                    {row.totalAnswered > 0 && (
                                                        <button
                                                            onClick={() => setDetailStudent({
                                                                id: row.student?._id,
                                                                name: `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.trim(),
                                                            })}
                                                            title="View attempt details & override"
                                                            style={{
                                                                background: 'none',
                                                                border: '1px solid var(--border-color)',
                                                                borderRadius: 6,
                                                                padding: '3px 8px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.75rem',
                                                                color: 'var(--primary)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 3,
                                                            }}
                                                        >
                                                            <HiOutlineEye size={14} /> View
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                <h4 style={{ margin: '0 0 8px' }}>
                                    {t('standardAssign:assessmentGradebook.standardAverageTitle')}
                                </h4>
                                {assessmentStandardAverageLoading ? (
                                    <p className="text-muted">{t('standardAssign:assessmentGradebook.loadingStandardAverage')}</p>
                                ) : assessmentStandardAverageError ? (
                                    <p className="text-danger">{assessmentStandardAverageError}</p>
                                ) : (
                                    <div className="table-container" style={{ maxHeight: 260, overflow: 'auto' }}>
                                        <table className="practice-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.student')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.attempts')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.graded')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.averagePercentage')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.averageScale')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(assessmentStandardAverageData?.rows || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5}>{t('standardAssign:assessmentGradebook.noRepeatedData')}</td>
                                                    </tr>
                                                ) : (
                                                    (assessmentStandardAverageData?.rows || []).map((row) => (
                                                        <tr
                                                            key={
                                                                row.student?._id ||
                                                                row.student?.studentId ||
                                                                JSON.stringify(row.student)
                                                            }
                                                        >
                                                            <td>
                                                                {row.student?.firstName} {row.student?.lastName}
                                                            </td>
                                                            <td>{row.attemptCount ?? 0}</td>
                                                            <td>{row.gradedAttemptCount ?? 0}</td>
                                                            <td>
                                                                {row.averagePercentage !== null &&
                                                                row.averagePercentage !== undefined
                                                                    ? `${row.averagePercentage}%`
                                                                    : t('standardAssign:common.na')}
                                                            </td>
                                                            <td>
                                                                {row.averageScale4 !== null &&
                                                                row.averageScale4 !== undefined
                                                                    ? row.averageScale4
                                                                    : t('standardAssign:common.na')}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                            )}
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handlePrintGradebookReport}
                        disabled={assessmentGradebookLoading || !assessmentGradebookData}
                    >
                        {t('standardAssign:actions.printReport', {
                            defaultValue: 'Print Report'
                        })}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onRetry}
                        disabled={!assessmentGradebookAssignmentId || assessmentGradebookLoading}
                    >
                        {t('standardAssign:actions.refresh')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onRelease}
                        disabled={
                            !assessmentGradebookAssignmentId ||
                            releasingAssessmentResults ||
                            assessmentGradebookLoading ||
                            !canRelease
                        }
                        title={
                            !isManualRelease
                                ? t('standardAssign:assessmentGradebook.releaseDisabledImmediate')
                                : submittedCount <= 0
                                  ? t('standardAssign:assessmentGradebook.releaseDisabledNoSubmitted')
                                  : ''
                        }
                    >
                        {releasingAssessmentResults
                            ? t('standardAssign:actions.releasing')
                            : t('standardAssign:actions.releaseResults')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssessmentGradebookModal;
