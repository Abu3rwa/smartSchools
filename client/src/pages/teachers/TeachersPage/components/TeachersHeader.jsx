import { HiOutlineDownload, HiOutlineMail, HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const TeachersHeader = ({
    canManageTeachers,
    onCreateTeacher,
    onImportTeachers,
    onDownloadTemplate,
    onBulkSendInvites,
    selectedCount = 0,
    bulkInviteLoading = false,
    templateMeta = null,
    importDisabled = false,
    createDisabled = false,
    capacityTitle = ''
}) => {
    const { t } = useTranslation(['teachers']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('teachers:page.title')}</h1>
                <p className="text-muted">{t('teachers:page.subtitle')}</p>
                {templateMeta && (
                    <p className="text-muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>
                        {templateMeta.hasActiveTemplate
                            ? `Sample template ${templateMeta.activeTemplate?.version || 'v1'} updated ${templateMeta.activeTemplate?.updatedAt ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
                            : 'Sample template uses fallback from import schema'}
                    </p>
                )}
            </div>
            {canManageTeachers && (
                <div className="header-actions">
                    <button
                        className="btn btn-outline"
                        onClick={onBulkSendInvites}
                        disabled={selectedCount === 0 || bulkInviteLoading}
                        title={selectedCount === 0 ? t('teachers:actions.selectTeachersFirst') : ''}
                    >
                        <HiOutlineMail size={20} />
                        {bulkInviteLoading
                            ? t('teachers:actions.sendingInvites')
                            : t('teachers:actions.sendInvitesForSelected', { count: selectedCount })}
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={onImportTeachers}
                        disabled={importDisabled}
                        title={importDisabled ? capacityTitle : ''}
                    >
                        <HiOutlineUpload size={20} />
                        {t('teachers:actions.importCsv')}
                    </button>
                    <button className="btn btn-outline" onClick={onDownloadTemplate}>
                        <HiOutlineDownload size={20} />
                        Download Sample CSV
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={onCreateTeacher}
                        disabled={createDisabled}
                        title={createDisabled ? capacityTitle : ''}
                    >
                        <HiOutlinePlus size={20} />
                        {t('teachers:actions.addTeacher')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default TeachersHeader;
