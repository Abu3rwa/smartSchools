import { HiOutlineAcademicCap } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const RegisterLogo = () => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="register-info">
            <div className="register-icon">
                <HiOutlineAcademicCap size={36} />
            </div>
            <h2>{t('auth:register.hero.title')}</h2>
            <p>{t('auth:register.hero.subtitle')}</p>
        </div>
    );
};

export default RegisterLogo;
