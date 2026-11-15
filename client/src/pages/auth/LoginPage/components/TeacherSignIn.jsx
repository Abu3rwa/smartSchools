import React from 'react';
import { useTranslation } from 'react-i18next';
import LoginGoogleButton from './LoginGoogleButton';

const TeacherSignIn = ({ loading, configured, onGoogleLogin }) => {
    const { t } = useTranslation(['auth']);
    const unavailable = configured === false;

    return (
        <div className="teacher-signin">
            <p className="signin-intro">{t('auth:login.teacher.body')}</p>

            <div className={unavailable ? 'teacher-google-disabled' : undefined}>
                <LoginGoogleButton
                    handleGoogleLogin={onGoogleLogin}
                    loading={loading && !unavailable}
                    disabled={unavailable}
                />
            </div>

            {unavailable ? (
                <p className="signin-note signin-note-warning">{t('auth:login.teacher.notConfigured')}</p>
            ) : (
                <p className="signin-note">{t('auth:login.teacher.hint')}</p>
            )}
        </div>
    );
};

export default TeacherSignIn;
