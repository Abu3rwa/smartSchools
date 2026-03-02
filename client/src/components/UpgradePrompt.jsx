import { HiOutlineLockClosed } from 'react-icons/hi';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { selectFeatureMetadata } from '../store/slices/schoolFeaturesSlice';
import './UpgradePrompt.css';

const UpgradePrompt = ({ feature, compact = false }) => {
    const navigate = useNavigate();
    const metadata = useSelector((state) => selectFeatureMetadata(state, feature));
    const featureLabel = metadata?.label || feature;
    const description = metadata?.description || 'This feature is not available on your current plan.';
    const requiredPlan = metadata?.requiredPlanName || 'a higher plan';

    if (compact) {
        return (
            <div className="upgrade-prompt upgrade-prompt--compact">
                <HiOutlineLockClosed className="upgrade-prompt__icon" size={16} />
                <span>{featureLabel} requires {requiredPlan}.</span>
                <button
                    type="button"
                    className="upgrade-prompt__cta"
                    onClick={() => navigate('/portal/settings')}
                >
                    Upgrade
                </button>
            </div>
        );
    }

    return (
        <div className="upgrade-prompt">
            <div className="upgrade-prompt__header">
                <HiOutlineLockClosed className="upgrade-prompt__icon" size={20} />
                <h3>{featureLabel} is locked</h3>
            </div>
            <p>{description}</p>
            <p className="upgrade-prompt__plan">Upgrade to {requiredPlan} to unlock this feature.</p>
            <button
                type="button"
                className="upgrade-prompt__cta"
                onClick={() => navigate('/portal/settings')}
            >
                View upgrade options
            </button>
        </div>
    );
};

export default UpgradePrompt;
