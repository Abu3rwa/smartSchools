import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

const LoginForm = ({
    formData,
    handleChange,
    handleSubmit,
    showPassword,
    setShowPassword,
    loading,
    error
}) => {
    const { t } = useTranslation(['auth']);

    return (
        <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label htmlFor="email">{t('auth:login.form.emailLabel')}</label>
                <div className="input-with-icon">
                    <HiOutlineMail className="input-icon" />
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={t('auth:login.form.emailPlaceholder')}
                        required
                        autoComplete="email"
                    />
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="password">{t('auth:login.form.passwordLabel')}</label>
                <div className="input-with-icon">
                    <HiOutlineLockClosed className="input-icon" />
                    <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder={t('auth:login.form.passwordPlaceholder')}
                        required
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? t('auth:login.form.hidePassword') : t('auth:login.form.showPassword')}
                    >
                        {showPassword ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                    </button>
                </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                {loading ? (
                    <span className="btn-loading">
                        <span className="spinner" style={{ width: 20, height: 20 }} />
                        {t('auth:login.form.signingIn')}
                    </span>
                ) : (
                    t('auth:login.form.submitWithEmail')
                )}
            </button>
        </form>
    );
};

export default LoginForm;
