import { HiOutlineCloud } from 'react-icons/hi';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchSchoolFeatures } from '../store/slices/schoolFeaturesSlice';
import './UpgradePrompt.css';

/**
 * Shown only when the app could not read whether this page is unlocked (dropped
 * connection, server error). It must never imply the plan is lower than it is.
 */
const PlanCheckPrompt = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['settings']);

    return (
        <div className="upgrade-prompt" role="status">
            <div className="upgrade-prompt__header">
                <HiOutlineCloud className="upgrade-prompt__icon" size={20} />
                <h3>{t('settings:pageLoad.title')}</h3>
            </div>
            <p>{t('settings:pageLoad.body')}</p>
            <button
                type="button"
                className="upgrade-prompt__cta"
                onClick={() => dispatch(fetchSchoolFeatures())}
            >
                {t('settings:pageLoad.retry')}
            </button>
        </div>
    );
};

export default PlanCheckPrompt;
