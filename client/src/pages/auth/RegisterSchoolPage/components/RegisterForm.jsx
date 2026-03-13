import { ESTIMATED_STUDENTS_OPTIONS } from '../constants';
import { useTranslation } from 'react-i18next';
import RegisterLoadingState from './RegisterLoadingState';

const RegisterForm = ({ formData, error, loading, onChange, onSubmit }) => {
    const { t } = useTranslation(['auth']);

    return (
        <>
            {error && (
                <div className="error-message" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    {error}
                </div>
            )}

            <form className="register-form" onSubmit={onSubmit}>
                <span className="register-section-title">{t('auth:register.form.sections.school')}</span>

                <div className="form-group">
                    <label htmlFor="schoolName">{t('auth:register.form.fields.schoolName')}</label>
                    <input
                        id="schoolName"
                        name="schoolName"
                        type="text"
                        required
                        value={formData.schoolName}
                        onChange={onChange}
                        placeholder={t('auth:register.form.fields.schoolNamePlaceholder')}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="estimatedStudents">{t('auth:register.form.fields.estimatedStudents')}</label>
                    <select
                        id="estimatedStudents"
                        name="estimatedStudents"
                        value={formData.estimatedStudents}
                        onChange={onChange}
                    >
                        {ESTIMATED_STUDENTS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                    </select>
                </div>

                <span className="register-section-title">{t('auth:register.form.sections.administrator')}</span>

                <div className="form-group">
                    <label htmlFor="adminName">{t('auth:register.form.fields.adminName')}</label>
                    <input
                        id="adminName"
                        name="adminName"
                        type="text"
                        required
                        value={formData.adminName}
                        onChange={onChange}
                        placeholder={t('auth:register.form.fields.adminNamePlaceholder')}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="adminEmail">{t('auth:register.form.fields.adminEmail')}</label>
                    <input
                        id="adminEmail"
                        name="adminEmail"
                        type="email"
                        required
                        value={formData.adminEmail}
                        onChange={onChange}
                        placeholder={t('auth:register.form.fields.adminEmailPlaceholder')}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="adminPassword">{t('auth:register.form.fields.adminPassword')}</label>
                    <input
                        id="adminPassword"
                        name="adminPassword"
                        type="password"
                        required
                        value={formData.adminPassword}
                        onChange={onChange}
                        placeholder={t('auth:register.form.fields.adminPasswordPlaceholder')}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="confirmPassword">{t('auth:register.form.fields.confirmPassword')}</label>
                    <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        value={formData.confirmPassword}
                        onChange={onChange}
                        placeholder={t('auth:register.form.fields.confirmPasswordPlaceholder')}
                    />
                </div>

                <button type="submit" className="register-submit" disabled={loading}>
                    {loading ? <RegisterLoadingState /> : t('auth:register.form.submit')}
                </button>
            </form>

            <div className="register-terms">
                {t('auth:register.terms')}
            </div>
        </>
    );
};

export default RegisterForm;
