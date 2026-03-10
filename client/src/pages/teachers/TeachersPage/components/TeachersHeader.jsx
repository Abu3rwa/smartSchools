import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const TeachersHeader = ({ canManageTeachers, onCreateTeacher, onImportTeachers }) => {
    const { t } = useTranslation(['teachers']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('teachers:page.title')}</h1>
                <p className="text-muted">{t('teachers:page.subtitle')}</p>
            </div>
            {canManageTeachers && (
                <div className="header-actions">
                    <button className="btn btn-outline" onClick={onImportTeachers}>
                        <HiOutlineUpload size={20} />
                        {t('teachers:actions.importCsv')}
                    </button>
                    <button className="btn btn-primary" onClick={onCreateTeacher}>
                        <HiOutlinePlus size={20} />
                        {t('teachers:actions.addTeacher')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TeachersHeader;
