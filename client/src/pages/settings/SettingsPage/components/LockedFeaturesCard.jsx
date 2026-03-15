import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight, HiOutlineLockClosed, HiOutlineSparkles } from 'react-icons/hi';
import {
    selectFeatureMetadataMap,
    selectPlanName,
    selectSchoolFeatures,
    selectSchoolFeaturesLoading
} from '../../../../store/slices/schoolFeaturesSlice';
import { selectUser } from '../../../../store/slices/authSlice';

const LockedFeaturesCard = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(['settings']);
    const user = useSelector(selectUser);
    const loading = useSelector(selectSchoolFeaturesLoading);
    const planName = useSelector(selectPlanName);
    const features = useSelector(selectSchoolFeatures);
    const featureMetadata = useSelector(selectFeatureMetadataMap);

    const lockedFeatures = useMemo(() => {
        return Object.values(featureMetadata || {})
            .filter((entry) => {
                if (!entry?.key) return false;
                if (typeof entry.enabled === 'boolean') return entry.enabled === false;
                return features?.[entry.key] === false;
            })
            .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key)));
    }, [featureMetadata, features]);

    const isAdmin = user?.role === 'admin';
    const userRole = user?.role;

    const resolveFeatureRoute = (featureKey) => {
        switch (featureKey) {
            case 'apiAccess':
                return '/portal/api-docs';
            case 'customReports':
                return '/portal/reports/generator';
            case 'advancedAnalytics':
                return '/portal/reports/analytics';
            case 'standardsPractice':
                return userRole === 'student' ? '/portal/practice' : '/portal/standards';
            case 'interventionTracking':
                return '/portal/interventions';
            case 'aiLessonPlanEvaluation':
                return '/portal/lessons';
            case 'readingAssistant':
                return userRole === 'student' ? '/portal/reading' : '/portal/reading/texts';
            case 'revisionPlanning':
                return '/portal/revision';
            case 'newsletterCommunication':
                if (userRole === 'parent') return '/portal/newsletters/history';
                if (userRole === 'admin') return '/portal/newsletters/admin';
                return '/portal/newsletters';
            case 'academicIntelligence':
                if (userRole === 'student') return '/portal/my-grades';
                return '/portal/classes';
            case 'aiEmailDrafts':
                return '/portal/email-composer';
            default:
                return null;
        }
    };

    return (
        <div className="card settings-card locked-features-card">
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlineLockClosed size={18} />
                    {t('lockedFeatures.title')}
                </h3>
                <p className="muted-text">
                    {t('lockedFeatures.currentPlan')}: <strong>{planName || t('lockedFeatures.unknownPlan')}</strong>
                </p>
            </div>

            {loading && <p className="muted-text">{t('lockedFeatures.loading')}</p>}

            {!loading && lockedFeatures.length === 0 && (
                <div className="locked-features-empty">
                    <HiOutlineSparkles size={16} />
                    <span>{t('lockedFeatures.allUnlocked')}</span>
                </div>
            )}

            {!loading && lockedFeatures.length > 0 && (
                <>
                    <ul className="locked-features-list">
                        {lockedFeatures.map((feature) => (
                            <li key={feature.key} className="locked-feature-item">
                                {resolveFeatureRoute(feature.key)
                                    ? (
                                        <button
                                            type="button"
                                            className="locked-feature-link"
                                            onClick={() => navigate(resolveFeatureRoute(feature.key))}
                                        >
                                            <div className="locked-feature-main">
                                                <span className="locked-feature-label">
                                                    {t(`featureLabels.${feature.key}`, { defaultValue: feature.label || feature.key })}
                                                </span>
                                                <span className="locked-feature-plan">
                                                    {t('lockedFeatures.requiresPlan', {
                                                        plan: feature.requiredPlanName || t('lockedFeatures.higherPlan')
                                                    })}
                                                </span>
                                            </div>
                                            <span className="locked-feature-open">
                                                {t('lockedFeatures.open')}
                                                <HiOutlineArrowRight size={14} />
                                            </span>
                                        </button>
                                    )
                                    : (
                                        <div className="locked-feature-main">
                                            <span className="locked-feature-label">
                                                {t(`featureLabels.${feature.key}`, { defaultValue: feature.label || feature.key })}
                                            </span>
                                            <span className="locked-feature-plan">
                                                {t('lockedFeatures.requiresPlan', {
                                                    plan: feature.requiredPlanName || t('lockedFeatures.higherPlan')
                                                })}
                                            </span>
                                        </div>
                                    )}
                            </li>
                        ))}
                    </ul>

                    {isAdmin && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/portal/school-settings')}
                        >
                            {t('lockedFeatures.openSchoolSettings')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default LockedFeaturesCard;