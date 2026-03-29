import { useTranslation } from 'react-i18next';

const GradeEntryHeader = ({ editMode = false }) => {
    const { t } = useTranslation(['grades']);

    return (
        <div className="page-header">
            <div>
                <h1>
                    {editMode
                        ? t('grades:entry.header.editTitle', { defaultValue: 'Edit Grades' })
                        : t('grades:entry.header.title')}
                </h1>
                <p className="text-muted">
                    {editMode
                        ? t('grades:entry.header.editSubtitle', { defaultValue: 'Modify previously entered grades and save changes' })
                        : t('grades:entry.header.subtitle')}
                </p>
            </div>
        </div>
    );
};

export default GradeEntryHeader;
