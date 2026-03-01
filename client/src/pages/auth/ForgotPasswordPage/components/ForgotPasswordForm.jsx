import { Link } from 'react-router-dom';

const ForgotPasswordForm = ({ email, loading, onEmailChange, onSubmit }) => {
    return (
        <div className="forgot-password-form">
            <h2>Forgot Password</h2>
            <p>
                Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={onSubmit}>
                <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(event) => onEmailChange(event.target.value)}
                        placeholder="Enter your email"
                        required
                        disabled={loading}
                    />
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
            </form>

            <div className="back-to-login">
                <Link to="/login">← Back to Login</Link>
            </div>
        </div>
    );
};

export default ForgotPasswordForm;
