import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectAppName } from '../../../store/slices/uiSlice';
import { useLoginPageData } from './hooks/useLoginPageData';
import { getSchoolContextClasses } from './utils/loginPagePresentation';
import LoginPageHeader from './components/LoginPageHeader';
import RoleChoice from './components/RoleChoice';
import StudentSignIn from './components/StudentSignIn';
import TeacherSignIn from './components/TeacherSignIn';
import LoginErrorBanner from './components/LoginErrorBanner';
import LoginContact from './components/LoginContact';
import LoginLoadingState from './components/LoginLoadingState';
import LoginErrorState from './components/LoginErrorState';
import './LoginPage.css';

const LoginPage = () => {
    const { t } = useTranslation(['auth']);
    const appName = useSelector(selectAppName);
    const {
        navigate,
        isAuthenticated,
        loading,
        error,
        school,
        schoolLoading,
        schoolError,
        schoolSlug,
        formData,
        showPassword,
        setShowPassword,
        handleChange,
        handleGoogleLogin,
        handleSubmit,
        isSchoolContext,
        role,
        chooseRole,
        switchRole,
        googleConfigured,
        errorCode,
        dismissError,
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

    const brandName = isSchoolContext
        ? school.name
        : (appName || t('auth:login.logo.defaultSchoolName'));

    return (
        <div className={getSchoolContextClasses(isSchoolContext)}>
            {isSchoolContext && (
                <LoginPageHeader onBack={() => navigate('/')} />
            )}

            <div className="login-shell">
                <aside className="login-brand">
                    <div className="login-brand-top">
                        <div className="brand-mark">
                            <img src="/logo.svg" alt="" width={40} height={40} />
                        </div>
                        <p className="brand-wordmark">{appName || t('auth:login.logo.defaultSchoolName')}</p>
                    </div>
                    <div className="login-brand-copy">
                        <h1 className="login-brand-title">{brandName}</h1>
                        <p className="login-brand-tagline">{t('auth:login.brand.tagline')}</p>
                    </div>
                </aside>

                <main className="login-panel">
                    <div className="login-card animate-fadeIn">
                        <div className="login-card-brand">
                            <div className="brand-mark brand-mark-sm">
                                <img src="/logo.svg" alt="" width={28} height={28} />
                            </div>
                            <span>{brandName}</span>
                        </div>

                        {role && (
                            <div className="login-role-bar">
                                <span>
                                    {t('auth:login.role.signedInAs', {
                                        role: t(`auth:login.role.${role}`)
                                    })}
                                </span>
                                <button type="button" className="login-role-switch" onClick={switchRole}>
                                    {t('auth:login.role.switch')}
                                </button>
                            </div>
                        )}

                        <LoginErrorBanner code={errorCode} onDismiss={dismissError} />

                        {role === 'teacher' && (
                            <TeacherSignIn
                                loading={loading}
                                configured={googleConfigured}
                                onGoogleLogin={handleGoogleLogin}
                            />
                        )}

                        {role === 'student' && (
                            <StudentSignIn
                                formData={formData}
                                handleChange={handleChange}
                                handleSubmit={handleSubmit}
                                showPassword={showPassword}
                                setShowPassword={setShowPassword}
                                loading={loading}
                                error={error}
                            />
                        )}

                        {!role && (
                            <>
                                <p className="login-card-intro">{t('auth:login.role.intro')}</p>
                                <RoleChoice role={role} onChoose={chooseRole} />
                            </>
                        )}

                        {isSchoolContext && school?.contact?.adminEmail && (
                            <LoginContact adminEmail={school.contact.adminEmail} />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default LoginPage;
