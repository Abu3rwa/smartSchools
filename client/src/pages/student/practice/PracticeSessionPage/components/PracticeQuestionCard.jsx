import React from 'react';
import { useTranslation } from 'react-i18next';
import { getQuestionTypeDisplay } from '../utils/practiceSessionPresentation';
import PassagePanel from '../../../../../components/assessment/PassagePanel';
import PracticeCountdown from './PracticeCountdown';

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
    secondsRemaining,
    children 
}) => {
    const { t } = useTranslation('studentPractice');
    const questionTypeLabel = currentQuestion.questionType
        ? t(`session.questionTypes.${currentQuestion.questionType}`, {
            defaultValue: getQuestionTypeDisplay(currentQuestion.questionType)
        })
        : '';
    const difficultyLabel = currentQuestion.difficulty
        ? t(`session.difficulty.${currentQuestion.difficulty}`, {
            defaultValue: currentQuestion.difficulty
        })
        : '';

    return (
        <div className="question-card">
            <div className="question-meta">
                {currentSessionStep != null && questionLimit > 0 ? (
                    <span className="badge badge-attempt">
                        {t('session.card.questionOf', { step: currentSessionStep, limit: questionLimit })}
                    </span>
                ) : (
                    <span className="badge badge-attempt">
                        {t('session.card.questionNumber', { number: currentQuestion.attemptNumber })}
                    </span>
                )}
                <PracticeCountdown secondsRemaining={secondsRemaining} />
                <span className={`badge badge-difficulty ${currentQuestion.difficulty}`}>
                    {difficultyLabel}
                </span>
                <span className="badge">{questionTypeLabel}</span>
                <span className="badge">{streakLabel}: {streakValue || 0}</span>
                <span className="badge">
                    {t('session.card.confidence', { percent: sessionAccuracy })}
                </span>
            </div>

            {currentQuestion.instruction && (
                <div className="question-instruction">
                    {' '}<span>{t('session.card.instructions')}</span> {currentQuestion.instruction}
                </div>
            )}

            <PassagePanel passage={currentQuestion.passage} />

            {/* The blank inputs render the sentence itself, so the plain text would repeat it. */}
            {currentQuestion.questionType !== 'fill_in_blank' && (
                <div className="question-text">{currentQuestion.questionText}</div>
            )}

            {currentQuestion.skill && (
                <div className="question-skill-tag">
                    <span className="badge badge-skill">{currentQuestion.skill}</span>
                    {currentQuestion.subskill && (
                        <span className="badge badge-subskill">{currentQuestion.subskill}</span>
                    )}
                </div>
            )}
            
            {suggestRemediation && (
                <div className="remediation-tip">
                    {t('session.card.quickTip')}
                </div>
            )}
            
            {showContextHints && (
                <div className="context-hints">
                    <p className="context-hints-title">{t('session.card.recentFocus')}</p>
                    {usableTopics.length > 0 && (
                        <p className="context-hints-line">
                            {t('session.card.topics', {
                                topics: usableTopics.slice(0, 3)
                                    .map((topic) => topic.charAt(0).toUpperCase() + topic.slice(1).trim())
                                    .join(', ')
                            })}
                        </p>
                    )}
                    {recentMistakes?.length > 0 && (
                        <p className="context-hints-line">
                            {t('session.card.improveNext', {
                                topics: recentMistakes.slice(0, 2).join(', ')
                            })}
                        </p>
                    )}
                </div>
            )}

            {children}
        </div>
    );
};

export default PracticeQuestionCard;
