import React from 'react';
import { HiOutlineRefresh, HiOutlineLightningBolt } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const InterventionQueueHeader = ({ onRefresh, isLoading }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="page-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div className="header-title-area">
                <div className="header-icon-badge">
                    <HiOutlineLightningBolt size={24} />
                </div>
                <div>
                    <h1>{t('interventions:header.title')}</h1>
                    <p className="text-muted">{t('interventions:header.subtitle')}</p>
                </div>
            </div>
            <div className="header-actions">
                <button
                    type="button"
                    className={`btn btn-secondary btn-sm ${isLoading ? 'loading' : ''}`}
                    onClick={onRefresh}
                    disabled={isLoading}
                >
                    <HiOutlineRefresh className={isLoading ? 'animate-spin' : ''} size={16} />
                    <span>{t('interventions:header.refresh')}</span>
                </button>
            </div>
        </div>
    );
};

export default InterventionQueueHeader;
