import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle } from 'react-icons/hi';

const PracticeSessionComplete = ({
    isMastered,
    statusMessage,
    sessionInfo,
    onNavigateToPractice,
    onFinalizeAssessment,
    finalizingAssessment,
    isAssessmentSession,
    showFinalizeAction = true,
}) => {
    const { t } = useTranslation('studentPractice');
    const defaultMessage = isAssessmentSession
        ? t('session.complete.assessmentDefault')
        : (isMastered ? t('session.complete.masteredDefault') : t('session.complete.practiceDefault'));

    return (
        <div className="mastery-celebration">
            <HiOutlineCheckCircle size={64} style={{ color: 'var(--success-600, #059669)', marginBottom: 'var(--spacing-md)' }} />
            <h2>{isMastered ? t('session.complete.masteredTitle') : t('session.complete.title')}</h2>
            <p>{statusMessage || defaultMessage}</p>

            {sessionInfo && !isMastered && (
                <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)' }}>
                    {t('session.complete.summary', {
                        answered: sessionInfo.questionsAnswered,
                        limitSuffix: sessionInfo.questionLimit ? `/${sessionInfo.questionLimit}` : '',
                        correct: sessionInfo.correctCount
                    })}
                </p>
            )}

            <button
                className="btn btn-primary"
                onClick={onNavigateToPractice}
                style={{ marginTop: 'var(--spacing-lg)' }}
            >
                {t('session.complete.returnToDashboard')}
            </button>

            {isAssessmentSession && showFinalizeAction && (
                <button
                    className="btn btn-secondary"
                    onClick={onFinalizeAssessment}
                    disabled={finalizingAssessment}
                    style={{ marginTop: 'var(--spacing-sm)' }}
                >
                    {finalizingAssessment
                        ? t('session.complete.submittingFinal')
                        : t('session.complete.submitFinal')}
                </button>
            )}
        </div>
    );
};

export default PracticeSessionComplete;
