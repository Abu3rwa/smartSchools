import { HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const StandardsPageHeader = ({ isAdmin, onAddStandard }) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="page-header">
            <div>
                <h1>{t('standards:header.title')}</h1>
                <p className="text-muted">{t('standards:header.subtitle')}</p>
            </div>
            {isAdmin && (
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={onAddStandard}>
                        <HiOutlinePlus size={20} />
                        {t('standards:header.add')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default StandardsPageHeader;
