import React from 'react';
import { useTranslation } from 'react-i18next';
import InterventionQueueItem from './InterventionQueueItem';

const InterventionQueueList = ({ items, onAction, actionLoading }) => {
    const { t } = useTranslation(['interventions']);

    if (items.length === 0) {
        return (
            <div className="card intervention-empty">
                <p className="text-muted">{t('interventions:list.empty')}</p>
            </div>
        );
    }

    return (
        <div className="intervention-list">
            {items.map((item) => (
                <InterventionQueueItem 
                    key={item._id} 
                    item={item} 
                    onAction={onAction} 
                    actionLoading={actionLoading} 
                />
            ))}
        </div>
    );
};

export default InterventionQueueList;
