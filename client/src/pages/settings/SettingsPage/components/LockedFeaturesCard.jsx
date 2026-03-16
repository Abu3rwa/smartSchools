import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight, HiOutlineLockClosed, HiOutlineSparkles } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import {
    selectFeatureMetadataMap,
    selectPlan,
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
    const plan = useSelector(selectPlan);
    const planName = useSelector(selectPlanName);
    const features = useSelector(selectSchoolFeatures);
    const featureMetadata = useSelector(selectFeatureMetadataMap);
    const [upgradeMessage, setUpgradeMessage] = useState('');
    const [targetPlan, setTargetPlan] = useState('');
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
    const [requestHistory, setRequestHistory] = useState([]);

    const lockedFeatures = useMemo(() => {
        return Object.values(featureMetadata || {})
            .filter((entry) => {
                if (!entry?.key) return false;
                if (typeof entry.enabled === 'boolean') return entry.enabled === false;
                return features?.[entry.key] === false;
            })
            .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key)));
    }, [featureMetadata, features]);

    const unlockedFeatures = useMemo(() => {
        return Object.values(featureMetadata || {})
            .filter((entry) => {
                if (!entry?.key) return false;
                if (typeof entry.enabled === 'boolean') return entry.enabled === true;
                return features?.[entry.key] === true;
            })
            .sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key)));
    }, [featureMetadata, features]);

    const isAdmin = user?.role === 'admin';
    const userRole = user?.role;
    const currentPlan = String(plan || '').toLowerCase();

    const upgradePlanOptions = useMemo(() => {
        const orderedPlans = ['starter', 'professional', 'enterprise'];
        const currentIndex = orderedPlans.indexOf(currentPlan);
        if (currentIndex === -1) {
            return orderedPlans;
        }
        return orderedPlans.filter((planKey, index) => index > currentIndex);
    }, [currentPlan]);

    useEffect(() => {
        if (!isAdmin) return;
        if (!targetPlan && upgradePlanOptions.length > 0) {
            setTargetPlan(upgradePlanOptions[0]);
        }
    }, [isAdmin, targetPlan, upgradePlanOptions]);

    useEffect(() => {
        if (!isAdmin) return;

        const loadHistory = async () => {
            setRequestHistoryLoading(true);
            try {
                const response = await api.get('/schools/me/upgrade-requests?limit=5');
                setRequestHistory(response.data?.data?.requests || []);
            } catch {
                setRequestHistory([]);
            } finally {
                setRequestHistoryLoading(false);
            }
        };

        loadHistory();
    }, [isAdmin]);

    const handleSubmitUpgradeRequest = async () => {
        if (!targetPlan && lockedFeatures.length === 0 && !upgradeMessage.trim()) {
            toast.error(t('lockedFeatures.requestValidation'));
            return;
        }

        setRequestSubmitting(true);
        try {
            const payload = {
                requestedPlan: targetPlan,
                requestedFeatures: lockedFeatures.map((item) => item.key),
                message: upgradeMessage.trim()
            };

            await api.post('/schools/me/upgrade-requests', payload);
            toast.success(t('lockedFeatures.requestSubmitted'));
            setUpgradeMessage('');

            const response = await api.get('/schools/me/upgrade-requests?limit=5');
            setRequestHistory(response.data?.data?.requests || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t('lockedFeatures.requestFailed'));
        } finally {
            setRequestSubmitting(false);
        }
    };

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

            {!loading && isAdmin && (
                <div className="unlocked-features-panel">
                    <h4>{t('lockedFeatures.unlockedTitle')}</h4>
                    {unlockedFeatures.length === 0
                        ? <p className="muted-text">{t('lockedFeatures.noUnlocked')}</p>
                        : (
                            <ul className="unlocked-features-list">
                                {unlockedFeatures.map((feature) => (
                                    <li key={feature.key} className="unlocked-feature-pill">
                                        {t(`featureLabels.${feature.key}`, { defaultValue: feature.label || feature.key })}
                                    </li>
                                ))}
                            </ul>
                        )}
                </div>
            )}

            {loading && <p className="muted-text">{t('lockedFeatures.loading')}</p>}

            {!loading && lockedFeatures.length === 0 && (
                <div className="locked-features-empty">
                    <HiOutlineSparkles size={16} />
                    <span>{t('lockedFeatures.allUnlocked')}</span>
                </div>
            )}

            {!loading && lockedFeatures.length > 0 && (
                <>
                    <h4 className="locked-features-subtitle">{t('lockedFeatures.lockedTitle')}</h4>
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

                </>
            )}

            {!loading && isAdmin && (
                <div className="upgrade-request-panel">
                    <h4>{t('lockedFeatures.requestTitle')}</h4>
                    <p className="muted-text">{t('lockedFeatures.requestDescription')}</p>

                    <label htmlFor="upgrade-target-plan" className="setting-label">
                        {t('lockedFeatures.requestPlanLabel')}
                    </label>
                    <select
                        id="upgrade-target-plan"
                        className="upgrade-request-select"
                        value={targetPlan}
                        onChange={(event) => setTargetPlan(event.target.value)}
                    >
                        {upgradePlanOptions.map((planKey) => (
                            <option key={planKey} value={planKey}>
                                {t(`planLabels.${planKey}`, { defaultValue: planKey })}
                            </option>
                        ))}
                    </select>

                    <label htmlFor="upgrade-request-message" className="setting-label">
                        {t('lockedFeatures.requestMessageLabel')}
                    </label>
                    <textarea
                        id="upgrade-request-message"
                        className="upgrade-request-textarea"
                        value={upgradeMessage}
                        onChange={(event) => setUpgradeMessage(event.target.value)}
                        placeholder={t('lockedFeatures.requestMessagePlaceholder')}
                        rows={3}
                    />

                    <div className="upgrade-request-actions">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSubmitUpgradeRequest}
                            disabled={requestSubmitting}
                        >
                            {requestSubmitting ? t('lockedFeatures.requestSubmitting') : t('lockedFeatures.requestCta')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/portal/school-settings')}
                        >
                            {t('lockedFeatures.openSchoolSettings')}
                        </button>
                    </div>

                    <div className="upgrade-request-history">
                        <h5>{t('lockedFeatures.requestHistoryTitle')}</h5>
                        {requestHistoryLoading && <p className="muted-text">{t('lockedFeatures.requestHistoryLoading')}</p>}
                        {!requestHistoryLoading && requestHistory.length === 0 && (
                            <p className="muted-text">{t('lockedFeatures.requestHistoryEmpty')}</p>
                        )}
                        {!requestHistoryLoading && requestHistory.length > 0 && (
                            <ul className="upgrade-request-history-list">
                                {requestHistory.map((request) => (
                                    <li key={request._id} className="upgrade-request-history-item">
                                        <span>
                                            {t('lockedFeatures.requestHistoryItem', {
                                                plan: t(`planLabels.${request.requestedPlan}`, { defaultValue: request.requestedPlan || t('lockedFeatures.unknownPlan') }),
                                                status: t(`requestStatus.${request.status}`, { defaultValue: request.status })
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LockedFeaturesCard;