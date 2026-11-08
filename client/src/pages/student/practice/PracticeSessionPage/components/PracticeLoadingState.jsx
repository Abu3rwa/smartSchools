import React from 'react';
import { useTranslation } from 'react-i18next';

const PracticeLoadingState = () => {
    const { t } = useTranslation('studentPractice');

    return (
        <div className="generating-state">
            <div className="spinner"></div>
            <p>{t('session.loading.preparing')}</p>
        </div>
    );
};

export default PracticeLoadingState;
