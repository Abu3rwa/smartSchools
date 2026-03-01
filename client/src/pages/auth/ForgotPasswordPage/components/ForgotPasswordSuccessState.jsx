import { Link } from 'react-router-dom';

const ForgotPasswordSuccessState = ({ email, onSendAnotherLink }) => {
    return (
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
                <button className="btn btn-secondary" onClick={onSendAnotherLink}>
                    Send Another Link
                </button>
                <Link to="/login" className="btn btn-primary">
                    Back to Login
                </Link>
            </div>
        </div>
    );
};

export default ForgotPasswordSuccessState;
