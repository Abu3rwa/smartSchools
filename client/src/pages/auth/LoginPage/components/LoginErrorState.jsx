import React from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const LoginErrorState = ({ error, onBack }) => {
    return (
        <div className="login-page">
            <div className="bg-gradient" />
            <div className="bg-grid" />
            <div className="login-container login-error-state">
                <div className="login-error-icon">
                    <HiOutlineExclamationCircle size={32} />
                </div>
                <h2>School not found</h2>
                <p>{error || 'This school does not exist.'}</p>
                <button type="button" className="btn btn-primary" onClick={onBack}>
                    Back to home
                </button>
            </div>
        </div>
    );
};

export default LoginErrorState;
