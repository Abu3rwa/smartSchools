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
        <div className="practice-header-compact">
            <div className="compact-stat">
                <HiOutlineChartBar size={18} />
                <span>
                    {currentQuestion && currentSessionStep != null && questionLimit > 0
                        ? `Q.${currentSessionStep} of ${questionLimit}`
                        : questionLimit > 0
                        ? `${questionsAnswered || 0}/${questionLimit}`
                        : `${combinedAsked} answered`}
                </span>
            </div>
            
            <div className="compact-stat" title={confidenceHint || 'Maintain a steady pace'}>
                <HiOutlineFire size={18} />
                <span>{streakLabel}: {streakValue || 0}</span>
            </div>
            
            <div className="compact-stat" title={combinedAsked > 0 ? `${combinedCorrect} correct overall` : 'Start building your confidence'}>
                <HiOutlineLightBulb size={18} />
                <span>{sessionAccuracy}% Accuracy</span>
            </div>
        </div>
    );
};

export default PracticeSessionStats;
