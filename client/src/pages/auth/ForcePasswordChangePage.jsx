import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { changePassword, logout, selectUser } from '../../store/slices/authSlice';
import './ForcePasswordChangePage.css';

const resolveHomeRoute = (user) => user?.role === 'super_admin' ? '/admin/dashboard' : '/portal/dashboard';

const ForcePasswordChangePage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation(['auth']);
    const user = useSelector(selectUser);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate('/login', { replace: true });
            return;
        }

        if (!user.mustChangePassword) {
            navigate(resolveHomeRoute(user), { replace: true });
        }
    }, [navigate, user]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error(t('auth:forcePasswordChange.messages.fillAllFields'));
            return;
        }

        if (newPassword.length < 6) {
            toast.error(t('auth:forcePasswordChange.messages.passwordMin'));
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error(t('auth:forcePasswordChange.messages.passwordsDoNotMatch'));
            return;
        }

        setSubmitting(true);
        const result = await dispatch(changePassword({ currentPassword, newPassword }));
        setSubmitting(false);

        if (changePassword.fulfilled.match(result)) {
            toast.success(t('auth:forcePasswordChange.messages.success'));
            navigate(resolveHomeRoute(user), { replace: true });
            return;
        }

        toast.error(result.payload || t('auth:forcePasswordChange.messages.submitError'));
    };

    const handleLogout = () => {
        dispatch(logout());
        navigate('/login', { replace: true });
    };

    return (
        <div className="force-password-page">
            <div className="force-password-card">
                <h1>{t('auth:forcePasswordChange.title')}</h1>
                <p>{t('auth:forcePasswordChange.description')}</p>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="currentPassword">{t('auth:forcePasswordChange.currentPasswordLabel')}</label>
                    <input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder={t('auth:forcePasswordChange.currentPasswordPlaceholder')}
                        autoComplete="current-password"
                    />

                    <label htmlFor="newPassword">{t('auth:forcePasswordChange.newPasswordLabel')}</label>
                    <input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder={t('auth:forcePasswordChange.newPasswordPlaceholder')}
                        autoComplete="new-password"
                    />

                    <label htmlFor="confirmPassword">{t('auth:forcePasswordChange.confirmPasswordLabel')}</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder={t('auth:forcePasswordChange.confirmPasswordPlaceholder')}
                        autoComplete="new-password"
                    />

                    <div className="force-password-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
                            {t('auth:forcePasswordChange.logout')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting
                                ? t('auth:forcePasswordChange.submitting')
                                : t('auth:forcePasswordChange.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ForcePasswordChangePage;
