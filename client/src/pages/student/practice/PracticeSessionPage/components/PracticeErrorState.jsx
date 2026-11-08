import React from 'react';
import { useTranslation } from 'react-i18next';

const PracticeErrorState = ({ error, onRetry, showRetry }) => {
    const { t } = useTranslation('studentPractice');

    return (
        <div className="practice-inline-error" role="alert">
            <p>{error}</p>
            {showRetry && (
                <button className="btn btn-secondary btn-sm" onClick={onRetry}>
                    {t('session.errors.tryAgain')}
                </button>
            )}
        </div>
    );
};

export default PracticeErrorState;
