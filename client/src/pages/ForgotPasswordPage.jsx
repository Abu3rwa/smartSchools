import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../config/api';
import toast from 'react-hot-toast';
import './ForgotPasswordPage.css';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!email) {
            toast.error('Please enter your email address');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/auth/forgot-password', { email });
            
            if (response.data.success) {
                setSubmitted(true);
                toast.success('Password reset link sent to your email');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send reset link');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="forgot-password-page">
                <div className="forgot-password-container">
                    <div className="success-message">
                        <h2>Check Your Email</h2>
                        <p>
                            We've sent a password reset link to <strong>{email}</strong>
                        </p>
                        <p>
                            The link will expire in 10 minutes. If you don't see the email, 
                            check your spam folder.
                        </p>
                        <div className="success-actions">
                            <button 
                                className="btn btn-secondary"
                                onClick={() => {
                                    setSubmitted(false);
                                    setEmail('');
                                }}
                            >
                                Send Another Link
                            </button>
                            <Link to="/login" className="btn btn-primary">
                                Back to Login
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="forgot-password-page">
            <div className="forgot-password-container">
                <div className="forgot-password-form">
                    <h2>Forgot Password</h2>
                    <p>
                        Enter your email address and we'll send you a link to reset your password.
                    </p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="email">Email Address</label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                required
                                disabled={loading}
                            />
                        </div>

                        <button 
                            type="submit" 
                            className="btn btn-primary btn-full"
                            disabled={loading}
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
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

export default ForgotPasswordPage;
