import React from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('studentPractice');

    return (
        <div className="question-card">
            <h3 style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center' }}>
                {t('session.initial.ready', { name: displayName })}
            </h3>

            {sessionInfo && (
                <div className="practice-session-summary">
                    <span>
                        {t('session.initial.sessionType', {
                            type: t(`session.sessionTypes.${sessionInfo.sessionType}`, {
                                defaultValue: sessionInfo.sessionType
                            })
                        })}
                    </span>
                    {sessionInfo.questionLimit
                        ? <span>{t('session.initial.limit', { limit: sessionInfo.questionLimit })}</span>
                        : null}
                    <PracticeCountdown secondsRemaining={sessionInfo.timeRemainingSeconds} />
                </div>
            )}

            {combinedAsked > 0 && (
                <div className="progress-today">
                    <div className="progress-today-title">{t('session.initial.progressToday')}</div>
                    <div className="progress-today-copy">
                        {t('session.initial.progressCopy', {
                            name: displayName,
                            correct: combinedCorrect,
                            asked: combinedAsked,
                            percent: sessionAccuracy
                        })}
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
                {t('session.initial.start')}
            </button>
        </div>
    );
};

export default PracticeInitialState;
