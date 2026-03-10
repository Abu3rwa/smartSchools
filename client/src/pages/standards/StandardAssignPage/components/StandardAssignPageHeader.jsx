import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const StandardAssignPageHeader = ({ onCreate }) => {
    const { t } = useTranslation(['standardAssign']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('standardAssign:header.title')}</h1>
                <p className="text-muted">
                    {t('standardAssign:header.subtitle')}
                </p>
            </div>
            <button className="btn btn-primary" onClick={onCreate}>
                <HiOutlinePlus size={20} />
                {t('standardAssign:actions.newAssignment')}
            </button>
        </div>
    );
};

export default StandardAssignPageHeader;
