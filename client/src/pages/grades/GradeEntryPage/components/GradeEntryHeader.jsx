import { useTranslation } from 'react-i18next';
import { HiOutlinePencil } from 'react-icons/hi';

const GradeEntryHeader = ({ editMode = false, tabs = null }) => {
    const { t } = useTranslation(['grades']);

    return (
        <div className="grade-setup-meta">
            <div className="grade-entry-title">
                <h1>
                    {editMode
                        ? t('grades:entry.header.editTitle', { defaultValue: 'Edit Grades' })
                        : t('grades:entry.header.title')}
                </h1>
                {editMode && (
                    <span className="badge badge-warning grade-edit-badge">
                        <HiOutlinePencil size={13} aria-hidden="true" />
                        {t('grades:entry.table.editMode')}
                    </span>
                )}
                <p className="text-muted">
                    {editMode
                        ? t('grades:entry.header.editSubtitle', { defaultValue: 'Modify previously entered grades and save changes' })
                        : t('grades:entry.header.subtitle')}
                </p>
            </div>
            {tabs}
        </div>
    );
};

export default GradeEntryHeader;
