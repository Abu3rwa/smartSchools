import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchoolBySlug, selectCurrentSchool, selectSchoolLoading, selectSchoolError } from '../store/slices/schoolSlice';
import { googleLogin, selectAuth } from '../store/slices/authSlice';
import { selectAppName } from '../store/slices/uiSlice';
import { useTranslation } from 'react-i18next';
import { HiOutlineAcademicCap, HiOutlineArrowLeft, HiOutlineExclamationCircle } from 'react-icons/hi';
// toast removed (unused import)
import './SchoolLoginPage.css';

const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

const SchoolLoginPage = () => {
    const { schoolSlug } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation(['schoolLogin']);
    const school = useSelector(selectCurrentSchool);
    const loading = useSelector(selectSchoolLoading);
    const error = useSelector(selectSchoolError);
    const appName = useSelector(selectAppName);
    const { loading: authLoading } = useSelector(selectAuth);

    useEffect(() => {
        dispatch(fetchSchoolBySlug(schoolSlug));
    }, [dispatch, schoolSlug]);

    const handleGoogleLogin = () => {
        dispatch(googleLogin(schoolSlug));
    };

    // Loading
    if (loading) {
        return (
            <div className="landing-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    // Error
    if (error || !school) {
        return (
            <div className="school-login-page">
                <div className="bg-gradient"></div>
                <div className="school-login-content">
                    <div className="school-login-error">
                        <div className="school-login-error-icon">
                            <HiOutlineExclamationCircle size={28} />
                        </div>
                        <h2>{t('schoolLogin:error.schoolNotFoundTitle')}</h2>
                        <p>{error || t('schoolLogin:error.schoolNotFoundBody')}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/')}>
                            {t('schoolLogin:error.backToSchools')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="school-login-page">
            <div className="bg-gradient"></div>
            <div className="bg-grid"></div>

            {/* Header */}
            <header className="school-login-header">
                <button className="school-login-back" onClick={() => navigate('/')}>
                    <HiOutlineArrowLeft size={16} />
                    {t('schoolLogin:header.allSchools')}
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('schoolLogin:header.poweredBy', { appName })}
                </span>
            </header>

            {/* Login Card */}
            <div className="school-login-content">
                <div className="school-login-card animate-fadeIn">
                    {/* School Info */}
                    <div className="school-login-info">
                        <div className="school-login-icon">
                            <HiOutlineAcademicCap size={36} />
                        </div>
                        <h2>{school.name}</h2>
                        <p>{t('schoolLogin:card.subtitle', { appName })}</p>
                    </div>

                    {/* Google Login */}
                    <button
                        className="school-google-btn"
                        onClick={handleGoogleLogin}
                        disabled={authLoading}
                    >
                        {authLoading ? (
                            <span className="btn-loading">
                                <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                {t('schoolLogin:actions.signingIn')}
                            </span>
                        ) : (
                            <>
                                <GoogleIcon />
                                {t('schoolLogin:actions.continueWithGoogle')}
                            </>
                        )}
                    </button>

                    {/* Contact */}
                    <div className="school-login-contact">
                        {t('schoolLogin:contact.needHelp')}{' '}
                        <a href={`mailto:${school.contact?.adminEmail}`}>
                            {school.contact?.adminEmail}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SchoolLoginPage;
