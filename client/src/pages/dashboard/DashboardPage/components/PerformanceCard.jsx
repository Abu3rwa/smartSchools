import { HiOutlineChartBar } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const PerformanceCard = () => {
    const { t } = useTranslation(['dashboard']);

    return (
        <div className="card performance-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">{t('dashboard:performance.title')}</h3>
            </div>
            <div className="chart-placeholder">
                <HiOutlineChartBar size={40} />
                <p>{t('dashboard:performance.comingSoon')}</p>
            </div>
        </div>
    );
};

export default PerformanceCard;
