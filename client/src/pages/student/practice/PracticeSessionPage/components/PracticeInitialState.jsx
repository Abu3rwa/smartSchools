import React from 'react';
import { HiOutlineLightningBolt } from 'react-icons/hi';

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
    isGenerating,
    isAssessmentSession,
    onFinalizeAssessment,
    isFinalizingAssessment
}) => {
    return (
        <div className="question-card">
            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>Ready for Practice, {displayName}?</h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                Pick a challenge level and question type. The next question will adapt to your current session progress.
            </p>

            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Difficulty</label>
                <div className="difficulty-selector">
                    {['easy', 'medium', 'hard'].map(d => (
                        <button
                            key={d}
                            className={`diff-btn ${difficulty === d ? 'active' : ''}`}
                            onClick={() => onDifficultyChange(d)}
                        >
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Question Type</label>
                <div className="difficulty-selector">
                    {[
                        { value: 'multiple_choice', label: 'Multiple Choice' },
                        { value: 'short_answer', label: 'Short Answer' },
                        { value: 'true_false', label: 'True/False' }
                    ].map(type => (
                        <button
                            key={type.value}
                            className={`diff-btn ${questionType === type.value ? 'active' : ''}`}
                            onClick={() => onQuestionTypeChange(type.value)}
                        >
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {sessionInfo && (
                <div style={{ marginBottom: 'var(--spacing-md)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Session Type: {sessionInfo.sessionType}
                    {sessionInfo.questionLimit ? ` | Limit: ${sessionInfo.questionLimit} questions` : ''}
                    {sessionInfo.timeRemainingSeconds !== null ? ` | Time left: ${sessionInfo.timeRemainingSeconds}s` : ''}
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
                {isGenerating ? 'Loading...' : 'Start Question'}
            </button>
            
            {isAssessmentSession && combinedAsked > 0 && (
                <button
                    className="btn btn-secondary"
                    onClick={onFinalizeAssessment}
                    disabled={isFinalizingAssessment}
                    style={{ width: '100%', marginTop: 'var(--spacing-sm)' }}
                >
                    {isFinalizingAssessment ? 'Submitting Assessment...' : 'Submit Final Assessment'}
                </button>
            )}
        </div>
    );
};

export default PracticeInitialState;
