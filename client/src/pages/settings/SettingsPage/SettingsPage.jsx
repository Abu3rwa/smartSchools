import React from 'react';
import { Box, Grid } from '@mui/material';
import useSettingsPageData from './hooks/useSettingsPageData';
import SettingsPageHeader from './components/SettingsPageHeader';
import ProfileCard from './components/ProfileCard';
import AppearanceCard from './components/AppearanceCard';
import AcademicYearCard from './components/AcademicYearCard';
import AccountCard from './components/AccountCard';
import './SettingsPage.css';

const SettingsPage = () => {
    const {
        user,
        theme,
        academicYear,
        isAdmin,
        avatarUploading,
        handleThemeChange,
        handleLogout,
        navigateToSchoolSettings,
        handleAvatarUpload,
        handleAvatarRemove
    } = useSettingsPageData();

    return (
        <Box className="settings-page" sx={{ px: { xs: 0, sm: 0 } }}>
            <SettingsPageHeader />

            <Grid container spacing={2} className="settings-grid">
                <ProfileCard
                    user={user}
                    avatarUploading={avatarUploading}
                    onAvatarUpload={handleAvatarUpload}
                    onAvatarRemove={handleAvatarRemove}
                />
                <AppearanceCard theme={theme} onThemeChange={handleThemeChange} />
                <AcademicYearCard 
                    academicYear={academicYear} 
                    isAdmin={isAdmin} 
                    onNavigateToSchoolSettings={navigateToSchoolSettings} 
                />
                <AccountCard onLogout={handleLogout} />
            </Grid>
        </Box>
    );
};

export default SettingsPage;
