import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentsHeader = ({ canCreateAssignments, onCreateAssignment }) => {
    const { t } = useTranslation(['assignments']);

    return (
        <div className="page-header assignments-page__header">
            <div>
                <h1>{t('assignments:header.title')}</h1>
                <p className="text-muted">{t('assignments:header.subtitle')}</p>
            </div>
            {canCreateAssignments && (
                <button type="button" className="btn btn-primary" onClick={onCreateAssignment}>
                    <HiOutlinePlus />
                    {t('assignments:actions.createAssignment')}
                </button>
            )}
        </div>
    );
};

export default AssignmentsHeader;
