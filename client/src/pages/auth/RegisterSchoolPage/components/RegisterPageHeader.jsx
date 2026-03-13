import { HiOutlineArrowLeft } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const RegisterPageHeader = ({ onBack }) => {
    const { t } = useTranslation(['auth']);

    return (
        <header className="register-header">
            <button className="register-back" onClick={onBack} type="button">
                <HiOutlineArrowLeft size={16} />
                {t('auth:register.header.back')}
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('auth:register.header.title')}
            </span>
        </header>
    );
};

export default RegisterPageHeader;
