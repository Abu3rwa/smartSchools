import React from 'react';
import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const BehaviorPageHeader = ({ onCreateIncident }) => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('behaviorManagement:header.title')}</h1>
                <p>{t('behaviorManagement:header.subtitle')}</p>
            </div>
            <button className="btn btn-primary" onClick={onCreateIncident}>
                <HiOutlinePlus /> {t('behaviorManagement:actions.reportIncident')}
            </button>
        </div>
    );
};

export default BehaviorPageHeader;
