import { useTranslation } from 'react-i18next';

const RegisterLoadingState = () => {
    const { t } = useTranslation(['auth']);

    return (
        <span className="btn-loading">
            <span className="spinner" style={{ width: 20, height: 20 }}></span>
            {t('auth:register.form.creating')}
        </span>
    );
};

export default RegisterLoadingState;
