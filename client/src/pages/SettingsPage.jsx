import { useSelector, useDispatch } from 'react-redux';
import { selectUser, updateProfile, logout } from '../store/slices/authSlice';
import { selectTheme, setTheme, selectCurrentAcademicYear, setCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineMoon, HiOutlineSun, HiOutlineLogout, HiOutlineUser } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import './SettingsPage.css';

const SettingsPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const theme = useSelector(selectTheme);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const handleThemeChange = (newTheme) => {
        dispatch(setTheme(newTheme));
        toast.success(`Theme changed to ${newTheme} mode`);
    };

    const handleLogout = () => {
        dispatch(logout());
        navigate('/');
    };

    const academicYears = [
        '2024-2025',
        '2025-2026',
        '2026-2027'
    ];

    return (
        <div className="settings-page">
            <div className="page-header">
                <div>
                    <h1>Settings</h1>
                    <p className="text-muted">Manage your account and application preferences</p>
                </div>
            </div>

            <div className="settings-grid">
                {/* Profile Card */}
                <div className="card settings-card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <HiOutlineUser /> Profile
                        </h3>
                    </div>
                    <div className="profile-section">
                        <div className="avatar-xl">
                            {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                        </div>
                        <div className="profile-info">
                            <h4>{user?.firstName} {user?.lastName}</h4>
                            <p className="text-muted">{user?.email}</p>
                            <span className="badge badge-primary">{user?.role}</span>
                        </div>
                    </div>
                    <div className="info-grid">
                        <div className="info-item">
                            <span className="label">Full Name</span>
                            <span className="value">{user?.firstName} {user?.lastName}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">Email</span>
                            <span className="value">{user?.email}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">Role</span>
                            <span className="value text-capitalize">{user?.role}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">Phone</span>
                            <span className="value">{user?.phone || 'Not set'}</span>
                        </div>
                    </div>
                </div>

                {/* Appearance Card */}
                <div className="card settings-card">
                    <div className="card-header">
                        <h3 className="card-title">Appearance</h3>
                    </div>
                    <div className="setting-item">
                        <div className="setting-info">
                            <span className="setting-label">Theme</span>
                            <span className="setting-description">Choose your preferred color scheme</span>
                        </div>
                        <div className="theme-options">
                            <button
                                className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                                onClick={() => handleThemeChange('dark')}
                            >
                                <HiOutlineMoon size={20} />
                                Dark
                            </button>
                            <button
                                className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                                onClick={() => handleThemeChange('light')}
                            >
                                <HiOutlineSun size={20} />
                                Light
                            </button>
                        </div>
                    </div>
                </div>

                {/* Academic Year Card */}
                <div className="card settings-card">
                    <div className="card-header">
                        <h3 className="card-title">Academic Settings</h3>
                    </div>
                    <div className="setting-item">
                        <div className="setting-info">
                            <span className="setting-label">Current Academic Year</span>
                            <span className="setting-description">Select the active academic year</span>
                        </div>
                        <select
                            value={academicYear}
                            onChange={(e) => dispatch(setCurrentAcademicYear(e.target.value))}
                            className="academic-year-select"
                        >
                            {academicYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Account Actions */}
                <div className="card settings-card danger-zone">
                    <div className="card-header">
                        <h3 className="card-title">Account</h3>
                    </div>
                    <div className="setting-item">
                        <div className="setting-info">
                            <span className="setting-label">Sign Out</span>
                            <span className="setting-description">Sign out from your account</span>
                        </div>
                        <button className="btn btn-danger" onClick={handleLogout}>
                            <HiOutlineLogout />
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
