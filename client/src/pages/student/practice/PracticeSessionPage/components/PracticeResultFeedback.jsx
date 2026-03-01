import React from 'react';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineRefresh } from 'react-icons/hi';

const PracticeResultFeedback = ({ 
    lastResult, 
    displayName, 
    onNextQuestion, 
    onNavigateToPractice, 
    isGenerating 
}) => {
    const resultParts = lastResult?.feedbackParts || {};
    const answerDisplay = resultParts.displayAnswer || lastResult?.correctAnswerDisplay || lastResult?.correctAnswer;
    const quickExplanation = resultParts.explanation || resultParts.reasonSummary || lastResult?.explanation;
    const resultHeading = resultParts.headline || (lastResult?.isCorrect ? 'Correct!' : 'Keep Going');

    return (
        <div className={`result-card ${lastResult.isCorrect ? 'correct' : 'incorrect'}`}>
            <div className="result-icon">
                {lastResult.isCorrect
                    ? <HiOutlineCheckCircle size={40} />
                    : <HiOutlineXCircle size={40} />
                }
            </div>
            <h3>{resultHeading}</h3>
            <p className="result-greeting">
                {resultParts.personalGreeting || `${displayName}, ${lastResult.isCorrect ? 'great work on this one.' : 'good attempt. Keep going.'}`}
            </p>
            <p className="result-feedback">{lastResult.feedback}</p>

            <div className="result-details">
                {resultParts.whatYouDidWell && (
                    <div className="result-section">
                        <p><span className="label">What You Did Well</span></p>
                        <p>{resultParts.whatYouDidWell}</p>
                    </div>
                )}

                <div className="result-section">
                    <p><span className="label">Best Answer and Why</span></p>
                    <p>{answerDisplay}</p>
                    {resultParts.correctionOrConfirmation && (
                        <p>{resultParts.correctionOrConfirmation}</p>
                    )}
                </div>

                {quickExplanation && (
                    <div className="result-section">
                        <p><span className="label">Quick Explanation</span></p>
                        <p>{quickExplanation}</p>
                    </div>
                )}

                {resultParts.nextStep && (
                    <div className="result-section">
                        <p><span className="label">Next Step</span></p>
                        <p>{resultParts.nextStep}</p>
                    </div>
                )}

                {resultParts.reviewTag && (
                    <div className="result-section">
                        <p><span className="label">Focus for Review</span></p>
                        <p>
                            {resultParts.reviewTag}
                            {resultParts.confidenceLevel ? ` (${resultParts.confidenceLevel} confidence)` : ''}
                        </p>
                    </div>
                )}

                {resultParts.encouragement && (
                    <p className="encouragement-line">{resultParts.encouragement}</p>
                )}

                {lastResult.sessionComplete && (
                    <p style={{ marginTop: 'var(--spacing-sm)', fontWeight: 600 }}>
                        Session complete. Great work!
                    </p>
                )}
            </div>

            {lastResult.mastery && (
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Mastery Progress: {lastResult.mastery.correctCount}/{lastResult.mastery.totalAttempts} correct ({lastResult.mastery.percentage}%)
                        {lastResult.mastery.needsMore > 0 && ` - ${lastResult.mastery.needsMore} more needed`}
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
                {lastResult.newlyMastered ? (
                    <button className="btn btn-success" onClick={onNavigateToPractice}>
                        <HiOutlineCheckCircle size={18} style={{ marginRight: 6 }} />
                        Standard Mastered! Go Back
                    </button>
                ) : lastResult.sessionComplete ? (
                    <button className="btn btn-primary" onClick={onNavigateToPractice}>
                        <HiOutlineCheckCircle size={18} style={{ marginRight: 6 }} />
                        Return to Dashboard
                    </button>
                ) : (
                    <button className="btn btn-primary" onClick={onNextQuestion} disabled={isGenerating}>
                        <HiOutlineRefresh size={18} style={{ marginRight: 6 }} />
                        Next Question
                    </button>
                )}
            </div>
        </div>
    );
};

export default PracticeResultFeedback;
