import React from 'react';
import { HiOutlineLightningBolt } from 'react-icons/hi';
import PracticeCountdown from './PracticeCountdown';

const PracticeInitialState = ({
    displayName,
    difficulty,
    onDifficultyChange,
    questionType,
    onQuestionTypeChange,
    sessionInfo,
    combinedAsked,
    combinedCorrect,
    sessionAccuracy,
    onGenerate,
    isGenerating
}) => {
    return (
        <div className="question-card">
            <h3 style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center' }}>Ready for Practice, {displayName}?</h3>
   

            {sessionInfo && (
                <div className="practice-session-summary">
                    <span>Session Type: {sessionInfo.sessionType}</span>
                    {sessionInfo.questionLimit ? <span>Limit: {sessionInfo.questionLimit} questions</span> : null}
                    <PracticeCountdown secondsRemaining={sessionInfo.timeRemainingSeconds} />
                </div>
            )}

            {combinedAsked > 0 && (
                <div className="progress-today">
                    <div className="progress-today-title">Progress Today</div>
                    <div className="progress-today-copy">
                        {displayName}, you got {combinedCorrect} out of {combinedAsked} correct ({sessionAccuracy}%).
                    </div>
                </div>
            )}

            <button
                className="btn btn-primary"
                onClick={onGenerate}
                disabled={isGenerating}
                style={{ width: '100%' }}
            >
                <HiOutlineLightningBolt size={18} style={{ marginRight: 6 }} />
                Start Question
            </button>
        </div>
    );
};

export default PracticeInitialState;
