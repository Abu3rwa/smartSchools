import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../store/slices/authSlice';
import { selectTheme, setTheme } from '../../../store/slices/uiSlice';
import { HiOutlineCog, HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';
import toast from 'react-hot-toast';
import '../../../components/superAdmin/SuperAdminBase.css';

const SuperAdminSettingsPage = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const theme = useSelector(selectTheme);

    const handleThemeChange = (newTheme) => {
        dispatch(setTheme(newTheme));
        toast.success(`Theme changed to ${newTheme} mode`);
    };

    return (
        <div className="admin-dashboard">
            <h1>Platform Settings</h1>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>Appearance</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button
                        className={`admin-action-btn ${theme === 'light' ? 'primary' : ''}`}
                        onClick={() => handleThemeChange('light')}
                    >
                        <HiOutlineSun size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Light
                    </button>
                    <button
                        className={`admin-action-btn ${theme === 'dark' ? 'primary' : ''}`}
                        onClick={() => handleThemeChange('dark')}
                    >
                        <HiOutlineMoon size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Dark
                    </button>
                </div>
            </div>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>Account</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>Name:</strong> {user?.firstName} {user?.lastName}
                        </p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>Email:</strong> {user?.email}
                        </p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <strong>Role:</strong> Super Admin
                        </p>
                    </div>
                </div>
            </div>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>Platform</h2>
                </div>
                <div style={{ padding: 'var(--spacing-lg)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <p>GradeBook Platform v1.0</p>
                    <p style={{ marginTop: 'var(--spacing-xs)' }}>Billing, Stripe integration, and advanced platform settings coming soon.</p>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminSettingsPage;
