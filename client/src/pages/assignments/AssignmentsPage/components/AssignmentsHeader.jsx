import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentsHeader = ({ canCreateAssignments, onCreateAssignment, onImport }) => {
    const { t } = useTranslation(['assignments']);

    return (
        <div className="page-header assignments-page__header">
            <div>
                <h1>{t('assignments:header.title')}</h1>
                <p className="text-muted">{t('assignments:header.subtitle')}</p>
            </div>
            {canCreateAssignments && (
                <div className="assignments-page__header-actions">
                    <button type="button" className="btn btn-secondary" onClick={onImport}>
                        <HiOutlineUpload />
                        {t('assignments:header.import')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={onCreateAssignment}>
                        <HiOutlinePlus />
                        {t('assignments:actions.createAssignment')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AssignmentsHeader;
