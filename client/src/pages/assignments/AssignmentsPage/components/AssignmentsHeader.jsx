import { useTranslation } from 'react-i18next';

const AssignmentsHeader = () => {
    const { t } = useTranslation(['assignments']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('assignments:header.title')}</h1>
                <p className="text-muted">{t('assignments:header.subtitle')}</p>
            </div>
        </div>
    );
};

export default AssignmentsHeader;
