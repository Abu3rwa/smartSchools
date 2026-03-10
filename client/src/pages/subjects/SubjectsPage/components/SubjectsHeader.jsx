import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const SubjectsHeader = ({ isAdmin, onCreate, onImport }) => {
    const { t } = useTranslation(['subjects']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('subjects:page.title')}</h1>
                <p className="text-muted">{t('subjects:page.subtitle')}</p>
            </div>
            {isAdmin && (
                <div className="header-actions">
                    <button className="btn btn-outline" onClick={onImport}>
                        <HiOutlineUpload size={20} />
                        {t('subjects:actions.importCsv')}
                    </button>
                    <button className="btn btn-primary" onClick={onCreate}>
                        <HiOutlinePlus size={20} />
                        {t('subjects:actions.addSubject')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SubjectsHeader;
