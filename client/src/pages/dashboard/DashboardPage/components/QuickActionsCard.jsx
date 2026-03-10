import { Link } from 'react-router-dom';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const QuickActionsCard = ({ actions }) => {
    const { t, i18n } = useTranslation(['dashboard']);
    const isRtl = i18n.dir() === 'rtl';

    return (
        <div className="card quick-actions-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">{t('dashboard:quickActions.title')}</h3>
            </div>
            <div className="quick-actions-grid">
                {actions.map((action, index) => (
                    <Link to={action.path} className="quick-action" key={index}>
                        <action.icon size={22} />
                        <span>{t(`dashboard:${action.labelKey}`)}</span>
                        <HiOutlineArrowRight className="action-arrow" size={18} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default QuickActionsCard;
