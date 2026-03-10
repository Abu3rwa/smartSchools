import { HiOutlineDownload, HiOutlineFilter } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AnalyticsHeader = ({ showFilters, onToggleFilters, onExport }) => {
    const { t } = useTranslation(['behaviorAnalytics']);

    return (
        <div className="page-header">
            <div className="header-content">
                <h1>{t('behaviorAnalytics:header.title')}</h1>
                <p>{t('behaviorAnalytics:header.subtitle')}</p>
            </div>
            <div className="header-actions">
                <button className="btn btn-secondary" onClick={onToggleFilters}>
                    <HiOutlineFilter size={20} />
                    {showFilters
                        ? t('behaviorAnalytics:actions.hideFilters')
                        : t('behaviorAnalytics:actions.filters')}
                </button>
                <button className="btn btn-secondary" onClick={() => onExport('json')}>
                    <HiOutlineDownload size={20} />
                    {t('behaviorAnalytics:actions.exportJson')}
                </button>
                <button className="btn btn-primary" onClick={() => onExport('csv')}>
                    <HiOutlineDownload size={20} />
                    {t('behaviorAnalytics:actions.exportCsv')}
                </button>
            </div>
        </div>
    );
};

export default AnalyticsHeader;
