import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { selectPlanName, selectSubscriptionCurrentPeriodEnd, selectSubscriptionStatus } from '../store/slices/schoolFeaturesSlice';
import { selectAppName } from '../store/slices/uiSlice';
import { logout } from '../store/slices/authSlice';
import './SubscriptionExpiredWall.css';

const formatDate = (value) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString();
};

const SubscriptionExpiredWall = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const appName = useSelector(selectAppName);
    const planName = useSelector(selectPlanName);
    const status = useSelector(selectSubscriptionStatus);
    const expiredAt = useSelector(selectSubscriptionCurrentPeriodEnd);

    const supportEmail = useMemo(() => import.meta.env.VITE_SUPPORT_EMAIL || 'support@gradebook.local', []);

    const handleLogout = async () => {
        await dispatch(logout());
        navigate('/', { replace: true });
    };

    return (
        <div className="subscription-wall-backdrop" role="dialog" aria-modal="true">
            <div className="subscription-wall-card">
                <p className="subscription-wall-overline">Subscription status</p>
                <h1>Your subscription has ended</h1>
                <p className="subscription-wall-message">
                    Access is limited until your school renews its plan.
                </p>

                <div className="subscription-wall-meta">
                    <div>
                        <span className="label">School</span>
                        <span>{appName || 'School'}</span>
                    </div>
                    <div>
                        <span className="label">Plan</span>
                        <span>{planName || 'Starter'}</span>
                    </div>
                    <div>
                        <span className="label">Status</span>
                        <span>{status || 'inactive'}</span>
                    </div>
                    <div>
                        <span className="label">Expired on</span>
                        <span>{formatDate(expiredAt)}</span>
                    </div>
                </div>

                <div className="subscription-wall-actions">
                    <a className="btn btn-primary" href={`mailto:${supportEmail}`}>
                        Contact support to renew
                    </a>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate('/portal/settings/subscription')}>
                        Open subscription settings
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionExpiredWall;
