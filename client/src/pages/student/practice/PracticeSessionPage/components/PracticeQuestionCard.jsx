import React from 'react';
import { getQuestionTypeDisplay } from '../utils/practiceSessionPresentation';

const PracticeQuestionCard = ({ 
    currentQuestion, 
    currentSessionStep, 
    questionLimit, 
    streakLabel, 
    streakValue, 
    sessionAccuracy, 
    suggestRemediation, 
    showContextHints, 
    usableTopics, 
    recentMistakes,
    children 
}) => {
    return (
        <div className="question-card">
            <div className="question-meta">
                {currentSessionStep != null && questionLimit > 0 ? (
                    <span className="badge badge-attempt">Question {currentSessionStep} of {questionLimit}</span>
                ) : (
                    <span className="badge badge-attempt">Question #{currentQuestion.attemptNumber}</span>
                )}
                <span className={`badge badge-difficulty ${currentQuestion.difficulty}`}>
                    {currentQuestion.difficulty}
                </span>
                <span className="badge">{getQuestionTypeDisplay(currentQuestion.questionType)}</span>
                <span className="badge">{streakLabel}: {streakValue || 0}</span>
                <span className="badge">Confidence: {sessionAccuracy}%</span>
            </div>

            <div className="question-text">{currentQuestion.questionText}</div>
            
            {suggestRemediation && (
                <div className="remediation-tip">
                    Quick Tip: Let’s strengthen the foundation first. Focus on accuracy, then move up in difficulty.
                </div>
            )}
            
            {showContextHints && (
                <div className="context-hints">
                    <p className="context-hints-title">Recent Focus</p>
                    {usableTopics.length > 0 && (
                        <p className="context-hints-line">
                            Topics: {usableTopics.slice(0, 3).map((t) => t.charAt(0).toUpperCase() + t.slice(1).trim()).join(', ')}
                        </p>
                    )}
                    {recentMistakes?.length > 0 && (
                        <p className="context-hints-line">
                            Improve next: {recentMistakes.slice(0, 2).join(', ')}
                        </p>
                    )}
                </div>
            )}

            {children}
        </div>
    );
};

export default PracticeQuestionCard;
