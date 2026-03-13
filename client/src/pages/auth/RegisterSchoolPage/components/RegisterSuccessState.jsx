import { HiOutlineCheckCircle } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const RegisterSuccessState = () => {
    const { t } = useTranslation(['auth']);

    return (
        <div className="register-card animate-fadeIn">
            <div className="register-success">
                <div className="register-success-icon">
                    <HiOutlineCheckCircle size={28} />
                </div>
                <h2>{t('auth:register.success.title')}</h2>
                <p>{t('auth:register.success.subtitle')}</p>
            </div>
        </div>
    );
};

export default RegisterSuccessState;
