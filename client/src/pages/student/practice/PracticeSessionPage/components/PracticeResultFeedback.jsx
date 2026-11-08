import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineRefresh } from 'react-icons/hi';

const PracticeResultFeedback = ({
    lastResult,
    onNextQuestion,
    onNavigateToPractice,
    onFinalizeAssessment,
    isGenerating,
    isAssessmentSession,
    assessmentAutoClosed,
    finalizingAssessment
}) => {
    const { t } = useTranslation('studentPractice');
    const resultParts = lastResult?.feedbackParts || {};
    const resultsVisible = lastResult?.resultsVisible !== false;
    const answerDisplay = resultParts.displayAnswer || lastResult?.correctAnswerDisplay || lastResult?.correctAnswer;
    const quickExplanation = resultParts.explanation || resultParts.reasonSummary || lastResult?.explanation;
    const requiresTeacherReview = Boolean(lastResult?.requiresTeacherReview);
    const hiddenResult = !resultsVisible && !requiresTeacherReview;
    const isCorrect = Boolean(lastResult?.isCorrect);
    const conciseFeedback = resultParts.correctionOrConfirmation || lastResult?.feedback;

    const resultHeading = requiresTeacherReview || hiddenResult
        ? t('session.feedback.submittedTitle')
        : isCorrect
            ? t('session.feedback.correctTitle')
            : t('session.feedback.incorrectTitle');

    const statusMessage = requiresTeacherReview
        ? t('session.feedback.reviewMessage')
        : hiddenResult
            ? t('session.feedback.resultsWithheld')
            : isCorrect
                ? t('session.feedback.correctMessage')
                : t('session.feedback.incorrectMessage');

    const showAnswerDetails = !requiresTeacherReview && !hiddenResult;

    const showFinalize = Boolean(lastResult?.sessionComplete && isAssessmentSession && !assessmentAutoClosed);
    const showReturnToDashboard = Boolean(
        lastResult?.newlyMastered ||
        (lastResult?.sessionComplete && (!isAssessmentSession || assessmentAutoClosed))
    );

    return (
        <div className={`result-card ${requiresTeacherReview || hiddenResult ? '' : isCorrect ? 'correct' : 'incorrect'}`}>
            <div className="result-icon">
                {requiresTeacherReview || hiddenResult
                    ? <HiOutlineRefresh size={40} />
                    : isCorrect
                        ? <HiOutlineCheckCircle size={40} />
                        : <HiOutlineXCircle size={40} />
                }
            </div>
            <h3>{resultHeading}</h3>
            <p className="result-feedback" style={{ marginBottom: 'var(--spacing-sm)' }}>
                {statusMessage}
            </p>

            {showAnswerDetails && (
                <div className="result-details">
                    <div className="result-section">
                        <p><span className="label">{t('session.feedback.bestAnswer')}</span></p>
                        <p>{answerDisplay || t('session.feedback.notAvailable')}</p>
                    </div>

                    {conciseFeedback && (
                        <div className="result-section">
                            <p>{conciseFeedback}</p>
                        </div>
                    )}

                    {quickExplanation && (
                        <div className="result-section">
                            <p><span className="label">{t('session.feedback.quickExplanation')}</span></p>
                            <p>{quickExplanation}</p>
                        </div>
                    )}

                    {lastResult.sessionComplete && (
                        <p style={{ marginTop: 'var(--spacing-sm)', fontWeight: 600 }}>
                            {t('session.feedback.sessionComplete')}
                        </p>
                    )}
                </div>
            )}

            {lastResult.mastery && !hiddenResult && (
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        {t('session.feedback.masteryProgress', {
                            correct: lastResult.mastery.correctCount,
                            total: lastResult.mastery.totalAttempts,
                            percent: lastResult.mastery.percentage
                        })}
                        {lastResult.mastery.needsMore > 0 &&
                            ` ${t('session.feedback.masteryNeedsMore', { remaining: lastResult.mastery.needsMore })}`}
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${lastResult.mastery.percentage}%`,
                            background: lastResult.mastery.percentage >= 80 ? '#34d399' : lastResult.mastery.percentage >= 40 ? '#fbbf24' : '#f87171',
                            borderRadius: 4,
                            transition: 'width 0.4s ease'
                        }}></div>
                    </div>
                </div>
            )}

            <div className="result-actions">
                {showFinalize ? (
                    <button
                        className="btn btn-primary"
                        onClick={onFinalizeAssessment}
                        disabled={finalizingAssessment}
                    >
                        <HiOutlineCheckCircle size={18} style={{ marginRight: 6 }} />
                        {finalizingAssessment
                            ? t('session.feedback.submittingFinal')
                            : t('session.feedback.submitFinal')}
                    </button>
                ) : showReturnToDashboard ? (
                    <button className="btn btn-success" onClick={onNavigateToPractice}>
                        <HiOutlineCheckCircle size={18} style={{ marginRight: 6 }} />
                        {lastResult.newlyMastered
                            ? t('session.feedback.masteredBack')
                            : t('session.feedback.returnToDashboard')}
                    </button>
                ) : (
                    <button className="btn btn-primary" onClick={onNextQuestion} disabled={isGenerating}>
                        <HiOutlineRefresh size={18} style={{ marginRight: 6 }} />
                        {t('session.feedback.nextQuestion')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default PracticeResultFeedback;
