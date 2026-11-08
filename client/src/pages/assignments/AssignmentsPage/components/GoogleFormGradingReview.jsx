import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheck, HiOutlineExclamationCircle, HiOutlineSparkles } from 'react-icons/hi';

const round2 = (value) => Math.round(value * 100) / 100;

const STATUS_BADGE = {
    pending: 'gfr-tag--pending',
    suggested: 'gfr-tag--suggested',
    approved: 'gfr-tag--approved',
    stale: 'gfr-tag--stale',
    failed: 'gfr-tag--failed'
};

const GoogleFormGradingReview = ({ item, questions, maxMarks, onGrade, onApprove }) => {
    const { t } = useTranslation(['assignments']);
    const shortAnswerQuestions = useMemo(
        () => (questions || []).filter((question) => question.type === 'short_answer'),
        [questions]
    );
    const grading = item.grading || null;
    const status = item.gradingStatus || 'pending';
    const gradingById = useMemo(
        () => new Map((grading?.questions || []).map((entry) => [String(entry.questionId), entry])),
        [grading]
    );

    const [edits, setEdits] = useState(() => {
        const initial = {};
        for (const question of shortAnswerQuestions) {
            const entry = gradingById.get(String(question.questionId));
            const score = entry?.approvedScore ?? entry?.suggestedScore;
            initial[question.questionId] = {
                score: score === null || score === undefined ? '' : String(score),
                feedback: entry?.approvedFeedback || entry?.suggestedFeedback || ''
            };
        }
        return initial;
    });
    const [busy, setBusy] = useState(null);

    const answerFor = (questionId) => (item.answers || [])
        .find((answer) => String(answer.questionId) === String(questionId))
        ?.values?.filter((value) => String(value || '').trim())
        .join(', ') || '';

    const scoreIsValid = (question, edit) => {
        if (!edit || edit.score === '') return false;
        const value = Number(edit.score);
        return Number.isFinite(value) && value >= 0 && value <= Number(question.points);
    };

    if (shortAnswerQuestions.length === 0) return null;

    const objectiveMax = Number(item.possibleScore)
        || (questions || [])
            .filter((question) => question.type !== 'short_answer')
            .reduce((sum, question) => sum + Number(question.points || 0), 0);
    const objectiveScore = item.score === null || item.score === undefined ? null : Number(item.score);
    const shortAnswerMax = shortAnswerQuestions.reduce((sum, question) => sum + Number(question.points || 0), 0);
    const shortAnswerPreview = round2(shortAnswerQuestions.reduce((sum, question) => {
        const edit = edits[question.questionId];
        if (scoreIsValid(question, edit)) return sum + Number(edit.score);
        const entry = gradingById.get(String(question.questionId));
        return sum + Number(entry?.approvedScore ?? entry?.suggestedScore ?? 0);
    }, 0));
    const totalMax = objectiveMax + shortAnswerMax;
    const objectiveMissing = objectiveMax > 0 && objectiveScore === null;
    const totalPreview = objectiveMissing ? null : round2((objectiveScore || 0) + shortAnswerPreview);
    const scaledPreview = totalPreview === null || totalMax <= 0
        ? null
        : round2(Math.min(Number(maxMarks), Math.max(0, (totalPreview / totalMax) * Number(maxMarks))));

    const canApprove = !objectiveMissing
        && shortAnswerQuestions.every((question) => scoreIsValid(question, edits[question.questionId]));
    const approved = status === 'approved';

    const updateEdit = (questionId, patch) => {
        setEdits((previous) => ({
            ...previous,
            [questionId]: { ...previous[questionId], ...patch }
        }));
    };

    const handleGrade = async () => {
        if (busy) return;
        setBusy('grade');
        try {
            await onGrade(item);
        } finally {
            setBusy(null);
        }
    };

    const handleApprove = async () => {
        if (busy || !canApprove) return;
        setBusy('approve');
        try {
            await onApprove(item, shortAnswerQuestions.map((question) => ({
                questionId: question.questionId,
                score: Number(edits[question.questionId].score),
                feedback: edits[question.questionId].feedback
            })));
        } finally {
            setBusy(null);
        }
    };

    const statusLabel = t(`assignments:googleForms.grading.status_${status}`);

    return (
        <section className="gfr-review" aria-label={t('assignments:googleForms.grading.title')}>
            <header className="gfr-review__head">
                <div className="gfr-review__intro">
                    <strong>{t('assignments:googleForms.grading.title')}</strong>
                    <p>{t('assignments:googleForms.grading.hint')}</p>
                </div>
                <span className={`gfr-tag ${STATUS_BADGE[status] || 'gfr-tag--pending'}`}>{statusLabel}</span>
            </header>

            {status === 'stale' && (
                <p className="gfr-review__notice">
                    <HiOutlineExclamationCircle aria-hidden="true" />
                    {t('assignments:googleForms.grading.staleNotice')}
                </p>
            )}
            {grading?.error && <p className="gfr-review__error">{grading.error}</p>}

            <ol className="gfr-review__questions">
                {shortAnswerQuestions.map((question, index) => {
                    const entry = gradingById.get(String(question.questionId));
                    const edit = edits[question.questionId] || { score: '', feedback: '' };
                    const answer = answerFor(question.questionId);
                    const hasSuggestion = entry?.suggestedScore !== null && entry?.suggestedScore !== undefined;
                    return (
                        <li className="gfr-review-question" key={question.questionId}>
                            <div className="gfr-review-question__head">
                                <span className="gfr-answer__index">{index + 1}</span>
                                <p>{question.title}</p>
                                <span className="gfr-tag gfr-tag--score">
                                    {t('assignments:googleForms.pointsBadge', { count: Number(question.points) })}
                                </span>
                            </div>

                            <div className="gfr-review-question__block">
                                <span className="gfr-review__label">{t('assignments:googleForms.grading.studentAnswer')}</span>
                                <p className={`gfr-answer__value${answer ? '' : ' is-empty'}`}>
                                    {answer || t('assignments:googleForms.notAnswered')}
                                </p>
                            </div>

                            {(question.modelAnswer || question.rubric) && (
                                <details className="gfr-review-question__reference">
                                    <summary>{t('assignments:googleForms.grading.reference')}</summary>
                                    {question.modelAnswer && (
                                        <div>
                                            <span className="gfr-review__label">{t('assignments:googleForms.modelAnswer')}</span>
                                            <p>{question.modelAnswer}</p>
                                        </div>
                                    )}
                                    {question.rubric && (
                                        <div>
                                            <span className="gfr-review__label">{t('assignments:googleForms.rubric')}</span>
                                            <p>{question.rubric}</p>
                                        </div>
                                    )}
                                </details>
                            )}

                            {hasSuggestion && (
                                <p className="gfr-review-question__suggestion">
                                    <HiOutlineSparkles aria-hidden="true" />
                                    <span>
                                        {t('assignments:googleForms.grading.aiSuggested', {
                                            score: entry.suggestedScore,
                                            max: question.points
                                        })}
                                        {entry.suggestedFeedback && (
                                            <span className="gfr-review-question__suggestion-feedback">{entry.suggestedFeedback}</span>
                                        )}
                                    </span>
                                </p>
                            )}
                            {entry?.error && <p className="gfr-review-question__error">{entry.error}</p>}

                            <div className="gfr-review-question__edit">
                                <label className="gfr-review-question__score">
                                    <span>{t('assignments:googleForms.grading.score')}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={Number(question.points)}
                                        step={0.5}
                                        value={edit.score}
                                        onChange={(event) => updateEdit(question.questionId, { score: event.target.value })}
                                        aria-label={t('assignments:googleForms.grading.score')}
                                    />
                                    <span className="gfr-review-question__max">/ {question.points}</span>
                                </label>
                                <label className="gfr-review-question__feedback">
                                    <span>{t('assignments:googleForms.grading.feedback')}</span>
                                    <textarea
                                        rows={2}
                                        maxLength={1000}
                                        value={edit.feedback}
                                        onChange={(event) => updateEdit(question.questionId, { feedback: event.target.value })}
                                    />
                                </label>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <div className="gfr-review__breakdown">
                <div>
                    <span>{t('assignments:googleForms.grading.objective')}</span>
                    <strong>{objectiveScore === null ? '—' : objectiveScore} / {objectiveMax}</strong>
                </div>
                <div>
                    <span>{t('assignments:googleForms.grading.shortAnswer')}</span>
                    <strong>{shortAnswerPreview} / {shortAnswerMax}</strong>
                </div>
                <div>
                    <span>{t('assignments:googleForms.grading.total')}</span>
                    <strong>{totalPreview === null ? '—' : totalPreview} / {totalMax}</strong>
                </div>
                <div className="gfr-review__scaled">
                    <span>{t('assignments:googleForms.grading.scaled')}</span>
                    <strong>{scaledPreview === null ? '—' : scaledPreview} / {maxMarks}</strong>
                </div>
            </div>

            <footer className="gfr-review__actions">
                {!approved && (
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={Boolean(busy)}
                        onClick={handleGrade}
                    >
                        <HiOutlineSparkles aria-hidden="true" />
                        {busy === 'grade'
                            ? t('assignments:googleForms.grading.grading')
                            : status === 'stale'
                                ? t('assignments:googleForms.grading.regrade')
                                : t('assignments:googleForms.grading.gradeWithAi')}
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busy) || !canApprove}
                    onClick={handleApprove}
                    title={canApprove ? undefined : t('assignments:googleForms.grading.approveDisabled')}
                >
                    <HiOutlineCheck aria-hidden="true" />
                    {busy === 'approve'
                        ? t('assignments:googleForms.grading.approving')
                        : approved
                            ? t('assignments:googleForms.grading.updateApproval')
                            : t('assignments:googleForms.grading.approve')}
                </button>
            </footer>
        </section>
    );
};

export default GoogleFormGradingReview;