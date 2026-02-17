import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { login, googleLogin, selectIsAuthenticated, selectAuth } from '../store/slices/authSlice';
import { fetchSchoolBySlug, selectCurrentSchool, selectSchoolLoading, selectSchoolError } from '../store/slices/schoolSlice';
import { HiOutlineAcademicCap, HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineArrowLeft, HiOutlineExclamationCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './LoginPage.css';

const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
);

const LoginPage = () => {
    const { schoolSlug } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const { loading, error } = useSelector(selectAuth);
    const school = useSelector(selectCurrentSchool);
    const schoolLoading = useSelector(selectSchoolLoading);
    const schoolError = useSelector(selectSchoolError);

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (schoolSlug) {
            dispatch(fetchSchoolBySlug(schoolSlug));
        }
    }, [dispatch, schoolSlug]);

    if (isAuthenticated) {
        return <Navigate to="/portal" replace />;
    }

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleGoogleLogin = () => {
        dispatch(googleLogin(schoolSlug || null));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await dispatch(login(formData));
        if (login.fulfilled.match(result)) {
            toast.success('Welcome back!');
            navigate('/portal');
        } else {
            toast.error(result.payload || 'Login failed');
        }
    };

    // School-specific URL: loading or not found
    if (schoolSlug) {
        if (schoolLoading) {
            return (
                <div className="login-page">
                    <div className="bg-gradient" />
                    <div className="bg-grid" />
                    <div className="spinner" style={{ margin: 'auto' }} />
                </div>
            );
        }
        if (schoolError || !school) {
            return (
                <div className="login-page">
                    <div className="bg-gradient" />
                    <div className="bg-grid" />
                    <div className="login-container login-error-state">
                        <div className="login-error-icon">
                            <HiOutlineExclamationCircle size={32} />
                        </div>
                        <h2>School not found</h2>
                        <p>{schoolError || 'This school does not exist.'}</p>
                        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
                            Back to home
                        </button>
                    </div>
                </div>
            );
        }
    }

    const isSchoolContext = schoolSlug && school;

    return (
        <div className={`login-page ${isSchoolContext ? 'login-page-with-school' : ''}`}>
            <div className="bg-gradient" />
            <div className="bg-grid" />

            {isSchoolContext && (
                <header className="login-header">
                    <button type="button" className="login-back" onClick={() => navigate('/')}>
                        <HiOutlineArrowLeft size={16} />
                        All schools
                    </button>
                    <span className="login-powered">GradeBook Pro</span>
                </header>
            )}

            <div className="login-wrap">
                <div className="login-container animate-fadeIn">
                <div className="login-logo">
                    <div className="logo-icon-lg">
                        <HiOutlineAcademicCap size={40} />
                    </div>
                    <h1 className="logo-title">{isSchoolContext ? school.name : 'GradeBook Pro'}</h1>
                    <p className="logo-subtitle">Sign in to your account</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <div className="input-with-icon">
                            <HiOutlineMail className="input-icon" />
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="you@school.com"
                                required
                                autoComplete="email"
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="input-with-icon">
                            <HiOutlineLockClosed className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                                Signing in...
                            </span>
                        ) : (
                            'Sign in with email'
                        )}
                    </button>
                </form>

                <div className="login-divider">
                    <span>or</span>
                </div>

                <button
                    type="button"
                    className="btn btn-outline btn-lg w-full google-btn"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                >
                    {loading ? (
                        <span className="btn-loading">
                            <span className="spinner" style={{ width: 20, height: 20 }} />
                            Signing in...
                        </span>
                    ) : (
                        <>
                            <GoogleIcon />
                            Continue with Google
                        </>
                    )}
                </button>

                <div className="login-forgot">
                    <Link to="/forgot-password" className="forgot-password-link">
                        Forgot password?
                    </Link>
                </div>

                {isSchoolContext && school?.contact?.adminEmail && (
                    <p className="login-contact">
                        Need help? <a href={`mailto:${school.contact.adminEmail}`}>Contact your school</a>
                    </p>
                )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
