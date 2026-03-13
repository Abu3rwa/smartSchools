import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLoginPageData } from './hooks/useLoginPageData';
import { getSchoolContextClasses } from './utils/loginPagePresentation';
import LoginPageHeader from './components/LoginPageHeader';
import LoginLogo from './components/LoginLogo';
import LoginForm from './components/LoginForm';
import LoginGoogleButton from './components/LoginGoogleButton';
import LoginForgotLink from './components/LoginForgotLink';
import LoginContact from './components/LoginContact';
import LoginLoadingState from './components/LoginLoadingState';
import LoginErrorState from './components/LoginErrorState';
import './LoginPage.css';

const LoginPage = () => {
    const { t } = useTranslation(['auth']);
    const {
        schoolSlug,
        navigate,
        isAuthenticated,
        loading,
        error,
        school,
        schoolLoading,
        schoolError,
        formData,
        showPassword,
        setShowPassword,
        handleChange,
        handleGoogleLogin,
        handleSubmit,
        isSchoolContext,
    } = useLoginPageData();

    if (isAuthenticated) {
        return <Navigate to="/portal" replace />;
    }

    if (schoolSlug) {
        if (schoolLoading) {
            return <LoginLoadingState />;
        }
        if (schoolError || !school) {
            return <LoginErrorState error={schoolError} onBack={() => navigate('/')} />;
        }
    }

    return (
        <div className={getSchoolContextClasses(isSchoolContext)}>
            <div className="bg-gradient" />
            <div className="bg-grid" />

            {isSchoolContext && (
                <LoginPageHeader onBack={() => navigate('/')} />
            )}

            <div className="login-wrap">
                <div className="login-container animate-fadeIn">
                    <LoginLogo 
                        isSchoolContext={isSchoolContext} 
                        schoolName={school?.name} 
                    />

                    <LoginForm
                        formData={formData}
                        handleChange={handleChange}
                        handleSubmit={handleSubmit}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        loading={loading}
                        error={error}
                    />

                    <div className="login-divider">
                        <span>{t('auth:login.divider.or')}</span>
                    </div>

                    <LoginGoogleButton
                        handleGoogleLogin={handleGoogleLogin}
                        loading={loading}
                    />

                    <LoginForgotLink />

                    {isSchoolContext && school?.contact?.adminEmail && (
                        <LoginContact adminEmail={school.contact.adminEmail} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
