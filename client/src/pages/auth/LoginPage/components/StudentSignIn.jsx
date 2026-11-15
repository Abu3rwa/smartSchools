import React from 'react';
import { useTranslation } from 'react-i18next';
import LoginForm from './LoginForm';
import LoginForgotLink from './LoginForgotLink';

const StudentSignIn = ({
    formData,
    handleChange,
    handleSubmit,
    showPassword,
    setShowPassword,
    loading,
    error
}) => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="student-signin">
            <p className="signin-intro">{t('auth:login.student.body')}</p>
            <LoginForm
                formData={formData}
                handleChange={handleChange}
                handleSubmit={handleSubmit}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                loading={loading}
                error={error}
            />
            <LoginForgotLink />
        </div>
    );
};

export default StudentSignIn;
