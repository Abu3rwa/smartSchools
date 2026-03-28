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
                <aside className="login-showcase" aria-label="School workflow highlights">
                    <div className="showcase-chip-row">
                        <span className="showcase-chip">Learning</span>
                        <span className="showcase-chip">Assignments</span>
                        <span className="showcase-chip">Progress</span>
                        <span className="showcase-chip">Community</span>
                        <span className="showcase-chip">Communication</span>
                        <span className="showcase-chip">Engagement</span>
                        <span className="showcase-chip">Data Driven Insights</span>
                    </div>

                    <div className="showcase-main-card">
                        <p className="showcase-overline">Education Portal</p>
                        <h2>One Login for Teaching, Learning, and Family Follow-up</h2>
                        <p>
                            Students, parents, teachers, and admins can sign in here to stay connected to classes, updates, and learning progress.
                        </p>
                        <ul className="showcase-list">
                            <li>Access coursework, schedules, and announcements</li>
                            <li>Follow assignment status and assessment progress</li>
                            <li>Keep everyone informed through a shared platform</li>

                        </ul>
                    </div>

                    <div className="showcase-metrics" aria-hidden="true">
                        <div className="showcase-metric-card">
                            <span className="metric-value">4 Roles</span>
                            <span className="metric-label">Students, Parents, Teachers, Admins</span>
                        </div>
                        <div className="showcase-metric-card">
                            <span className="metric-value">Real-Time</span>
                            <span className="metric-label">Learning and communication updates</span>
                        </div>
                        <div className="showcase-metric-card">
                            <span className="metric-value">Unified</span>
                            <span className="metric-label">One connected education workspace</span>
                        </div>
                    </div>
                </aside>

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
