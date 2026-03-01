import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectUser, logout } from '../../../../store/slices/authSlice';
import { selectTheme, setTheme, selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';

/**
 * Custom hook for SettingsPage data and handlers
 * @returns {object} { user, theme, academicYear, isAdmin, handleThemeChange, handleLogout }
 */
const useSettingsPageData = () => {
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

    const navigateToSchoolSettings = () => {
        navigate('/portal/school-settings');
    };

    const isAdmin = user?.role === 'admin';

    return {
        user,
        theme,
        academicYear,
        isAdmin,
        handleThemeChange,
        handleLogout,
        navigateToSchoolSettings
    };
};

export default useSettingsPageData;
