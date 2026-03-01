import React from 'react';
import GoogleIcon from './GoogleIcon';

const LoginGoogleButton = ({ handleGoogleLogin, loading }) => {
    return (
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
    );
};

export default LoginGoogleButton;
