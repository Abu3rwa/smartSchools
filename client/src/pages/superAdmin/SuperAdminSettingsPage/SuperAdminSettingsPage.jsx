import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectUser } from '../../../store/slices/authSlice';
import { selectTheme, setTheme } from '../../../store/slices/uiSlice';
import { HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';
import toast from 'react-hot-toast';
import '../../../components/superAdmin/SuperAdminBase.css';

const SuperAdminSettingsPage = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const theme = useSelector(selectTheme);
    const { t } = useTranslation(['superAdminSettings']);

    const handleThemeChange = (newTheme) => {
        dispatch(setTheme(newTheme));
        toast.success(t('superAdminSettings:toast.themeChanged', {
            theme: t(`superAdminSettings:theme.${newTheme}`)
        }));
    };

    return (
        <div className="admin-dashboard">
            <h1>{t('superAdminSettings:page.title')}</h1>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>{t('superAdminSettings:sections.appearance')}</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <div className="admin-toolbar">
                    <button
                        className={`admin-action-btn ${theme === 'light' ? 'primary' : ''}`}
                        onClick={() => handleThemeChange('light')}
                    >
                        <HiOutlineSun size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {t('superAdminSettings:theme.light')}
                    </button>
                    <button
                        className={`admin-action-btn ${theme === 'dark' ? 'primary' : ''}`}
                        onClick={() => handleThemeChange('dark')}
                    >
                        <HiOutlineMoon size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {t('superAdminSettings:theme.dark')}
                    </button>
                    </div>
                </div>
            </div>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>{t('superAdminSettings:sections.account')}</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>{t('superAdminSettings:account.name')}:</strong> {user?.firstName} {user?.lastName}
                        </p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>{t('superAdminSettings:account.email')}:</strong> {user?.email}
                        </p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>{t('superAdminSettings:account.role')}:</strong> {t('superAdminSettings:account.superAdmin')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>{t('superAdminSettings:sections.platform')}</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <p>{t('superAdminSettings:platform.version')}</p>
                    <p style={{ marginTop: 'var(--spacing-xs)' }}>{t('superAdminSettings:platform.comingSoon')}</p>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminSettingsPage;
