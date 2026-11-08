import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    retrySchoolFeaturesIfUnknown,
    selectHasFeature,
    selectSchoolFeaturesKnown,
    selectSchoolFeaturesLoading
} from '../store/slices/schoolFeaturesSlice';
import { selectUser } from '../store/slices/authSlice';
import UpgradePrompt from './UpgradePrompt';
import PlanCheckPrompt from './PlanCheckPrompt';

const FeatureGate = ({ feature, children, fallback, showUpgradePrompt = false }) => {
    const dispatch = useDispatch();
    const loading = useSelector(selectSchoolFeaturesLoading);
    const known = useSelector(selectSchoolFeaturesKnown);
    const hasFeature = useSelector((state) => selectHasFeature(state, feature));
    const user = useSelector(selectUser);
    const hasCustomFallback = fallback !== undefined;
    const requestedRetry = useRef(false);

    // The login-time fetch may have dropped before it ever answered. Ask once
    // per mount so navigating cannot silently park the page in "unknown".
    useEffect(() => {
        if (!feature || !user || user.role === 'super_admin') return;
        if (known || loading || requestedRetry.current) return;
        requestedRetry.current = true;
        dispatch(retrySchoolFeaturesIfUnknown());
    }, [dispatch, feature, known, loading, user]);

    if (!feature) return children;
    if (user?.role === 'super_admin') return children;
    if (loading) return null;

    if (hasFeature) return children;
    if (!known && showUpgradePrompt) return <PlanCheckPrompt />;
    if (hasCustomFallback) return fallback;
    if (showUpgradePrompt) return <UpgradePrompt feature={feature} />;

    return null;
};

export default FeatureGate;
