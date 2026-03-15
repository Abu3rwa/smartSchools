import React from 'react';
import { HiOutlineBadgeCheck, HiOutlineExclamationCircle } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const InterventionQueueEmptyState = ({ message, icon: Icon = HiOutlineBadgeCheck }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="card glass intervention-empty" style={{ padding: 'var(--spacing-2xl)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div className="empty-state-icon" style={{ 
                width: 80, 
                height: 80, 
                background: 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-full)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'var(--primary)',
                marginBottom: 'var(--spacing-lg)',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)'
            }}>
                <Icon size={48} />
            </div>
            <h3 style={{ marginBottom: 'var(--spacing-xs)' }}>{message || t('interventions:empty.title', { defaultValue: 'All Clear!' })}</h3>
            <p className="text-muted" style={{ maxWidth: 400 }}>
                {t('interventions:empty.subtitle', { defaultValue: 'There are no students requiring intervention at this time. Keep up the great work!' })}
            </p>
        </div>
    );
};

export default InterventionQueueEmptyState;
