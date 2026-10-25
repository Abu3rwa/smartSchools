import { HiOutlineCloud } from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchSchoolFeatures } from '../store/slices/schoolFeaturesSlice';
import { resolveFeatureLabel } from '../utils/featureNames';
import './UpgradePrompt.css';

/**
 * Shown when the plan could not be read at all (offline, failed request).
 * It must never claim the school is on a lower plan, because we do not know that.
 */
const PlanCheckPrompt = ({ feature }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['settings']);
    const featureLabel = resolveFeatureLabel(t, feature);

    return (
        <div className="upgrade-prompt" role="status">
            <div className="upgrade-prompt__header">
                <HiOutlineCloud className="upgrade-prompt__icon" size={20} />
                <h3>{t('settings:planCheck.title', { feature: featureLabel })}</h3>
            </div>
            <p>{t('settings:planCheck.body')}</p>
            <button
                type="button"
                className="upgrade-prompt__cta"
                onClick={() => dispatch(fetchSchoolFeatures())}
            >
                {t('settings:planCheck.retry')}
            </button>
        </div>
    );
};

export default PlanCheckPrompt;
