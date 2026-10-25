import { HiOutlineLockClosed } from 'react-icons/hi';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { selectFeatureMetadata } from '../store/slices/schoolFeaturesSlice';
import { resolveFeatureLabel } from '../utils/featureNames';
import './UpgradePrompt.css';

const UpgradePrompt = ({ feature, compact = false }) => {
    const navigate = useNavigate();
    const { t } = useTranslation(['settings']);
    const metadata = useSelector((state) => selectFeatureMetadata(state, feature));
    const featureLabel = resolveFeatureLabel(t, feature, metadata?.label);
    const description = metadata?.description || t('settings:upgradePrompt.notOnPlan');
    const requiredPlan = metadata?.requiredPlanName || t('settings:upgradePrompt.higherPlan');

    if (compact) {
        return (
            <div className="upgrade-prompt upgrade-prompt--compact">
                <HiOutlineLockClosed className="upgrade-prompt__icon" size={16} />
                <span>{t('settings:upgradePrompt.requiresPlan', {
                    feature: featureLabel,
                    plan: requiredPlan,
                })}</span>
                <button
                    type="button"
                    className="upgrade-prompt__cta"
                    onClick={() => navigate('/portal/settings')}
                >
                    {t('settings:upgradePrompt.upgrade')}
                </button>
            </div>
        );
    }

    return (
        <div className="upgrade-prompt">
            <div className="upgrade-prompt__header">
                <HiOutlineLockClosed className="upgrade-prompt__icon" size={20} />
                <h3>{t('settings:upgradePrompt.lockedTitle', { feature: featureLabel })}</h3>
            </div>
            <p>{description}</p>
            <p className="upgrade-prompt__plan">
                {t('settings:upgradePrompt.unlockWithPlan', { plan: requiredPlan })}
            </p>
            <button
                type="button"
                className="upgrade-prompt__cta"
                onClick={() => navigate('/portal/settings')}
            >
                {t('settings:upgradePrompt.viewOptions')}
            </button>
        </div>
    );
};

export default UpgradePrompt;
