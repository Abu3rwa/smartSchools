import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight, HiOutlineSparkles } from 'react-icons/hi';
import SectionCard from './SectionCard';
import { toneVar } from '../constants';

const QuickActionsCard = ({ actions }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <SectionCard
            title={t('dashboard:teacherDashboard.quickActions.title')}
            icon={HiOutlineSparkles}
            tone="purple"
        >
            <div className="td-actions">
                {actions.map((action) => (
                    <Link
                        to={action.path}
                        className="td-action"
                        key={action.path}
                        style={{ '--tone': toneVar(action.tone) }}
                    >
                        <span className="td-plate" aria-hidden="true">
                            <action.icon size={18} />
                        </span>
                        <span className="td-action-label">
                            {t(`dashboard:teacherDashboard.${action.labelKey}`)}
                        </span>
                        <span className="td-go" aria-hidden="true">
                            <span className="td-flip">
                                <HiOutlineArrowRight size={15} />
                            </span>
                        </span>
                    </Link>
                ))}
            </div>
        </SectionCard>
    );
};

export default QuickActionsCard;