import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../store/slices/authSlice';
import { selectSubscriptionStatus } from '../store/slices/schoolFeaturesSlice';
import './SubscriptionExpiredBanner.css';

const SubscriptionExpiredBanner = () => {
    const [dismissed, setDismissed] = useState(false);
    const user = useSelector(selectUser);
    const subscriptionStatus = useSelector(selectSubscriptionStatus);

    const isExpired = ['inactive', 'cancelled', 'suspended', 'expired'].includes(String(subscriptionStatus || '').toLowerCase());
    if (!isExpired || dismissed) return null;

    const isStudent = user?.role === 'student';
    const toneClass = isStudent ? 'student' : 'teacher';
    const message = isStudent
        ? 'Some features are currently unavailable. Please contact your school administrator.'
        : "Your school's subscription has ended. Some features may be unavailable. Please contact your administrator.";

    return (
        <div className={`subscription-expired-banner ${toneClass}`} role="status" aria-live="polite">
            <span>{message}</span>
            <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss subscription warning">
                Dismiss
            </button>
        </div>
    );
};

export default SubscriptionExpiredBanner;
