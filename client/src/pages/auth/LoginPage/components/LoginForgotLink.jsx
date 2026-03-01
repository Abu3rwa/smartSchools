import React from 'react';
import { Link } from 'react-router-dom';

const LoginForgotLink = () => {
    return (
        <div className="login-forgot">
            <Link to="/forgot-password" className="forgot-password-link">
                Forgot password?
            </Link>
        </div>
    );
};

export default LoginForgotLink;
