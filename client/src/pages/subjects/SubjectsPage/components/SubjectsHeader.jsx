import { HiOutlineDownload, HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const SubjectsHeader = ({ isAdmin, onCreate, onImport, onDownloadTemplate, templateMeta }) => {
    const { t } = useTranslation(['subjects']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('subjects:page.title')}</h1>
                <p className="text-muted">{t('subjects:page.subtitle')}</p>
                {templateMeta && (
                    <p className="text-muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>
                        {templateMeta.hasActiveTemplate
                            ? `Sample template ${templateMeta.activeTemplate?.version || 'v1'} updated ${templateMeta.activeTemplate?.updatedAt ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
                            : 'Sample template uses fallback from import schema'}
                    </p>
                )}
            </div>
            {isAdmin && (
                <div className="header-actions">
                    <button className="btn btn-outline" onClick={onImport}>
                        <HiOutlineUpload size={20} />
                        {t('subjects:actions.importCsv')}
                    </button>
                    <button className="btn btn-outline" onClick={onDownloadTemplate}>
                        <HiOutlineDownload size={20} />
                        Download Sample CSV
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
