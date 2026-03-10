import { useTranslation } from 'react-i18next';

const GradeEntryHeader = () => {
    const { t } = useTranslation(['grades']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('grades:entry.header.title')}</h1>
                <p className="text-muted">{t('grades:entry.header.subtitle')}</p>
            </div>
        </div>
    );
};

export default GradeEntryHeader;
