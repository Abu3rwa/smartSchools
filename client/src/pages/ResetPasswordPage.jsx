import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../config/api';
import toast from 'react-hot-toast';
import './ResetPasswordPage.css';

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [tokenValid, setTokenValid] = useState(true);

    useEffect(() => {
        if (!token) {
            setTokenValid(false);
            toast.error('Invalid reset link');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!token) {
            toast.error('Invalid reset link');
            return;
        }

        if (!password || !confirmPassword) {
            toast.error('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            toast.error('Password must be at least 6 characters long');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/auth/reset-password', { token, password });
            
            if (response.data.success) {
                toast.success('Password reset successful!');
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    if (!tokenValid) {
        return (
            <div className="reset-password-page">
                <div className="reset-password-container">
                    <div className="error-message">
                        <h2>Invalid Reset Link</h2>
                        <p>
                            This password reset link is invalid or has expired.
                        </p>
                        <Link to="/forgot-password" className="btn btn-primary">
                            Request New Reset Link
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="reset-password-page">
            <div className="reset-password-container">
                <div className="reset-password-form">
                    <h2>Reset Password</h2>
                    <p>
                        Enter your new password below.
                    </p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="password">New Password</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter new password"
                                required
                                disabled={loading}
                                minLength={6}
                            />
                            <small>Password must be at least 6 characters long</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                required
                                disabled={loading}
                                minLength={6}
                            />
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary btn-full"
                            disabled={loading}
                        >
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>

                    <div className="back-to-login">
                        <Link to="/login">← Back to Login</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
