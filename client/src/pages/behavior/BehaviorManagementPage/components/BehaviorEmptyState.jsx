import React from 'react';
import { HiOutlineClipboardList } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const BehaviorEmptyState = () => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <div className="empty-state">
            <HiOutlineClipboardList size={48} />
            <h3>{t('behaviorManagement:empty.title')}</h3>
            <p>{t('behaviorManagement:empty.description')}</p>
        </div>
    );
};

export default BehaviorEmptyState;
