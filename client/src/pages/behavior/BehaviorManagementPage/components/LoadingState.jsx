import React from 'react';
import { useTranslation } from 'react-i18next';

const LoadingState = ({ message }) => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <div className="loading">{message || t('behaviorManagement:loading.incidents')}</div>
    );
};

export default LoadingState;
