import React from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const InterventionQueueHeader = ({ onRefresh, isLoading }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('interventions:header.title')}</h1>
                <p className="text-muted">{t('interventions:header.subtitle')}</p>
            </div>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                disabled={isLoading}
            >
                <HiOutlineRefresh size={16} />
                <span>{t('interventions:header.refresh')}</span>
            </button>
        </div>
    );
};

export default InterventionQueueHeader;
