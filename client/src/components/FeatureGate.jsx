import { useSelector } from 'react-redux';
import {
    selectHasFeature,
    selectSchoolFeaturesLoading
} from '../store/slices/schoolFeaturesSlice';
import { selectUser } from '../store/slices/authSlice';
import UpgradePrompt from './UpgradePrompt';

const FeatureGate = ({ feature, children, fallback, showUpgradePrompt = false }) => {
    const loading = useSelector(selectSchoolFeaturesLoading);
    const hasFeature = useSelector((state) => selectHasFeature(state, feature));
    const user = useSelector(selectUser);
    const hasCustomFallback = fallback !== undefined;

    if (!feature) return children;
    if (user?.role === 'super_admin') return children;
    if (loading) return null;

    if (hasFeature) return children;
    if (hasCustomFallback) return fallback;
    if (showUpgradePrompt) return <UpgradePrompt feature={feature} />;

    return null;
};

export default FeatureGate;
