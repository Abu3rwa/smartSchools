import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectUser, logout, updateProfile } from '../../../../store/slices/authSlice';
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
    const [avatarUploading, setAvatarUploading] = useState(false);

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

    const navigateToSubscription = () => {
        navigate('/portal/settings/subscription');
    };

    const handleAvatarUpload = async (file) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);

        setAvatarUploading(true);
        const result = await dispatch(updateProfile(formData));
        setAvatarUploading(false);

        if (updateProfile.fulfilled.match(result)) {
            toast.success('Profile photo updated');
        } else {
            toast.error(result.payload || 'Failed to update profile photo');
        }
    };

    const handleAvatarRemove = async () => {
        setAvatarUploading(true);
        const result = await dispatch(updateProfile({ avatar: '' }));
        setAvatarUploading(false);

        if (updateProfile.fulfilled.match(result)) {
            toast.success('Profile photo removed');
        } else {
            toast.error(result.payload || 'Failed to remove profile photo');
        }
    };

    const isAdmin = user?.role === 'admin';

    return {
        user,
        theme,
        academicYear,
        isAdmin,
        avatarUploading,
        handleThemeChange,
        handleLogout,
        navigateToSchoolSettings,
        navigateToSubscription,
        handleAvatarUpload,
        handleAvatarRemove
    };
};

export default useSettingsPageData;
