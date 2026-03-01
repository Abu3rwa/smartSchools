import React from 'react';
import { HiOutlineArrowLeft } from 'react-icons/hi';
import { DEFAULT_SCHOOL_NAME } from '../constants';

const LoginPageHeader = ({ onBack }) => {
    return (
        <header className="login-header">
            <button type="button" className="login-back" onClick={onBack}>
                <HiOutlineArrowLeft size={16} />
                All schools
            </button>
            <span className="login-powered">{DEFAULT_SCHOOL_NAME}</span>
        </header>
    );
};

export default LoginPageHeader;
