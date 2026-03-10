import React from 'react';
import { HiOutlineExclamation } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const ErrorState = ({ message }) => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <div className="empty-state">
            <HiOutlineExclamation size={48} className="text-danger" />
            <h3>{t('behaviorManagement:error.title')}</h3>
            <p>{message || t('behaviorManagement:error.failedToLoadIncidents')}</p>
        </div>
    );
};

export default ErrorState;
