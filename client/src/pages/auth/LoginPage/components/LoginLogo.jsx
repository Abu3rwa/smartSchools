import React from 'react';
import { HiOutlineAcademicCap } from 'react-icons/hi';
import { DEFAULT_SCHOOL_NAME, DEFAULT_SUBTITLE } from '../constants';

const LoginLogo = ({ isSchoolContext, schoolName }) => {
    return (
        <div className="login-logo">
            <div className="logo-icon-lg">
                <HiOutlineAcademicCap size={40} />
            </div>
            <h1 className="logo-title">{isSchoolContext ? schoolName : DEFAULT_SCHOOL_NAME}</h1>
            <p className="logo-subtitle">{DEFAULT_SUBTITLE}</p>
        </div>
    );
};

export default LoginLogo;
