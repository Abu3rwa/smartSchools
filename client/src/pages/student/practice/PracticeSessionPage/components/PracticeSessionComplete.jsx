import React from 'react';
import { HiOutlineCheckCircle } from 'react-icons/hi';

const PracticeSessionComplete = ({ 
    isMastered, 
    statusMessage, 
    sessionInfo, 
    onNavigateToPractice, 
    onFinalizeAssessment, 
    finalizingAssessment,
    isAssessmentSession 
}) => {
    return (
        <div className="mastery-celebration">
            <HiOutlineCheckCircle size={64} style={{ color: 'var(--success-600, #059669)', marginBottom: 'var(--spacing-md)' }} />
            <h2>{isMastered ? 'Standard Mastered!' : 'Session Complete'}</h2>
            <p>{statusMessage || (isMastered ? 'You have already mastered this standard.' : 'You have completed this practice session.')}</p>
            
            {sessionInfo && !isMastered && (
                <p style={{ fontSize: '0.85rem', marginTop: 'var(--spacing-sm)' }}>
                    Answered: {sessionInfo.questionsAnswered}
                    {sessionInfo.questionLimit ? `/${sessionInfo.questionLimit}` : ''} | Correct: {sessionInfo.correctCount}
                </p>
            )}

            <button
                className="btn btn-primary"
                onClick={onNavigateToPractice}
                style={{ marginTop: 'var(--spacing-lg)' }}
            >
                Return to Dashboard
            </button>

            {isAssessmentSession && isMastered && (
                <button
                    className="btn btn-secondary"
                    onClick={onFinalizeAssessment}
                    disabled={finalizingAssessment}
                    style={{ marginTop: 'var(--spacing-sm)' }}
                >
                    {finalizingAssessment ? 'Submitting Assessment...' : 'Submit Final Assessment'}
                </button>
            )}
        </div>
    );
};

export default PracticeSessionComplete;
