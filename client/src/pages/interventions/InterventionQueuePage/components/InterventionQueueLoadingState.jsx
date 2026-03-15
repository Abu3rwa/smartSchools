import React from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const InterventionQueueLoadingState = () => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="card glass loading-state" style={{ 
            padding: 'var(--spacing-2xl)', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 'var(--spacing-md)',
            minHeight: '300px'
        }}>
            <HiOutlineRefresh className="animate-spin" size={48} style={{ color: 'var(--primary)', opacity: 0.6 }} />
            <p className="text-muted" style={{ fontWeight: 500 }}>
                {t('interventions:loading.message', { defaultValue: 'Analyzing student data and preparing intervention queue...' })}
            </p>
        </div>
    );
};

export default InterventionQueueLoadingState;
