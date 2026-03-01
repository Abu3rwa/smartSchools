import React from 'react';
import { HiOutlineChartBar, HiOutlineFire, HiOutlineLightBulb } from 'react-icons/hi';

const PracticeSessionStats = ({ 
    currentQuestion, 
    currentSessionStep, 
    questionLimit, 
    questionsAnswered,
    combinedAsked,
    sessionProgressPercent,
    streakLabel,
    streakValue,
    confidenceHint,
    sessionAccuracy,
    combinedCorrect
}) => {
    return (
        <div className="session-overview">
            <div className="session-overview-item">
                <div className="overview-label">
                    <HiOutlineChartBar size={16} />
                    Session Progress
                </div>
                <div className="overview-value">
                    {currentQuestion && currentSessionStep != null && questionLimit > 0
                        ? `Question ${currentSessionStep} of ${questionLimit}`
                        : questionLimit > 0
                        ? `${questionsAnswered || 0}/${questionLimit}`
                        : `${combinedAsked} answered`}
                </div>
                {questionLimit > 0 && (
                    <div className="overview-progress">
                        <div
                            className="overview-progress-fill"
                            style={{ width: `${sessionProgressPercent || 0}%` }}
                        />
                    </div>
                )}
            </div>
            <div className="session-overview-item">
                <div className="overview-label">
                    <HiOutlineFire size={16} />
                    {streakLabel}
                </div>
                <div className="overview-value">{streakValue || 0}</div>
                <div className="overview-subtext">
                    {confidenceHint || 'Keep a steady pace and focus on clear reasoning.'}
                </div>
            </div>
            <div className="session-overview-item">
                <div className="overview-label">
                    <HiOutlineLightBulb size={16} />
                    Confidence
                </div>
                <div className="overview-value">{sessionAccuracy}%</div>
                <div className="overview-subtext">
                    {combinedAsked > 0
                        ? `${combinedCorrect} correct out of ${combinedAsked}`
                        : 'Start with one question to build momentum.'}
                </div>
            </div>
        </div>
    );
};

export default PracticeSessionStats;
