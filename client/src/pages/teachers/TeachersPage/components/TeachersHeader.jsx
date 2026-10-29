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

    const templateNote = templateMeta
        ? (templateMeta.hasActiveTemplate
            ? `Sample template ${templateMeta.activeTemplate?.version || 'v1'} updated ${templateMeta.activeTemplate?.updatedAt ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
            : 'Sample template uses fallback from import schema')
        : null;

    return (
        <div className="teachers-header">
            <div className="teachers-header-main">
                <h1 className="teachers-header-title">{t('teachers:page.title')}</h1>
                <p className="teachers-header-subtitle">{t('teachers:page.subtitle')}</p>
                {templateNote && (
                    <p className="teachers-header-context">{templateNote}</p>
                )}
            </div>
            {canManageTeachers && (
                <div className="teachers-header-actions">
                    <button
                        type="button"
                        className="teachers-action teachers-action--secondary"
                        onClick={onDownloadTemplate}
                    >
                        <HiOutlineDownload size={18} />
                        <span>Download Sample CSV</span>
                    </button>
                    <button
                        type="button"
                        className="teachers-action teachers-action--secondary"
                        onClick={onImportTeachers}
                        disabled={importDisabled}
                        title={importDisabled ? capacityTitle : ''}
                    >
                        <HiOutlineUpload size={18} />
                        <span>{t('teachers:actions.importCsv')}</span>
                    </button>
                    <button
                        type="button"
                        className="teachers-action teachers-action--secondary"
                        onClick={onBulkSendInvites}
                        disabled={selectedCount === 0 || bulkInviteLoading}
                        title={selectedCount === 0 ? t('teachers:actions.selectTeachersFirst') : ''}
                    >
                        <HiOutlineMail size={18} />
                        <span>
                            {bulkInviteLoading
                                ? t('teachers:actions.sendingInvites')
                                : t('teachers:actions.sendInvitesForSelected', { count: selectedCount })}
                        </span>
                        {selectedCount > 0 && !bulkInviteLoading && (
                            <span className="teachers-action-count">{selectedCount}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        className="teachers-action teachers-action--primary"
                        onClick={onCreateTeacher}
                        disabled={createDisabled}
                        title={createDisabled ? capacityTitle : ''}
                    >
                        <HiOutlinePlus size={18} />
                        <span>{t('teachers:actions.addTeacher')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default TeachersHeader;
