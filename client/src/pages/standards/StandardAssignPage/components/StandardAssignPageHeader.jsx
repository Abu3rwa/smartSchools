import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const StandardAssignPageHeader = ({ onCreate, title, subtitle, createLabel }) => {
    const { t } = useTranslation(['standardAssign']);
    const resolvedTitle = title || t('standardAssign:header.title');
    const resolvedSubtitle = subtitle || t('standardAssign:header.subtitle');
    const resolvedCreateLabel = createLabel || t('standardAssign:actions.newAssignment');

    return (
        <div className="page-header">
            <div>
                <h1>{resolvedTitle}</h1>
                <p className="text-muted">
                    {resolvedSubtitle}
                </p>
            </div>
            <button className="btn btn-primary" onClick={onCreate}>
                <HiOutlinePlus size={20} />
                {resolvedCreateLabel}
            </button>
        </div>
    );
};

export default StandardAssignPageHeader;
