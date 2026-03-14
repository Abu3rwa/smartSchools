import { useTranslation } from 'react-i18next';

const RegisterLogo = () => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="register-info">
            <div className="register-icon">
                <img src="/logo.svg" alt="Logo" width={64} height={64} style={{ display: 'block', margin: '0 auto' }} />
            </div>
            <h2>{t('auth:register.hero.title')}</h2>
            <p>{t('auth:register.hero.subtitle')}</p>
        </div>
    );
};

export default RegisterLogo;
