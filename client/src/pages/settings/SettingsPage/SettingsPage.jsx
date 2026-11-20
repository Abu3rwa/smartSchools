import React from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectUser } from '../../../store/slices/authSlice';
import useSettingsPageData from './hooks/useSettingsPageData';
import SettingsPageHeader from './components/SettingsPageHeader';
import ProfileCard from './components/ProfileCard';
import AppearanceCard from './components/AppearanceCard';
import AcademicYearCard from './components/AcademicYearCard';
import GoogleConnectionsCard from './components/GoogleConnectionsCard';
import LockedFeaturesCard from './components/LockedFeaturesCard';
import AccountCard from './components/AccountCard';
import './SettingsPage.css';

const GOOGLE_CONNECTION_ROLES = ['teacher', 'admin', 'department_principal'];

const SettingsPage = () => {
    const { t } = useTranslation(['settings']);
    const currentUser = useSelector(selectUser);
    const {
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
    } = useSettingsPageData();

    const showsGoogleConnections = GOOGLE_CONNECTION_ROLES.includes(currentUser?.role);

    return (
        <div className="settings-page">
            <SettingsPageHeader />

            {isAdmin && (
                <div className="settings-actions-strip">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={navigateToSubscription}>
                        {t('settings:actions.subscription')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={navigateToSubscription}
                        title={t('settings:actions.storageHint')}
                    >
                        {t('settings:actions.storage')}
                    </button>
                </div>
            )}

            <div className="settings-grid">
                <div className="settings-col settings-col--wide">
                    <ProfileCard
                        user={user}
                        avatarUploading={avatarUploading}
                        onAvatarUpload={handleAvatarUpload}
                        onAvatarRemove={handleAvatarRemove}
                    />
                </div>
                <div className="settings-col">
                    <AppearanceCard theme={theme} onThemeChange={handleThemeChange} />
                </div>
                {isAdmin && (
                    <div className="settings-col">
                        <AcademicYearCard
                            academicYear={academicYear}
                            isAdmin={isAdmin}
                            onNavigateToSchoolSettings={navigateToSchoolSettings}
                        />
                    </div>
                )}
                {showsGoogleConnections && (
                    <div className="settings-col settings-col--wide">
                        <GoogleConnectionsCard />
                    </div>
                )}
                <div className="settings-col">
                    <LockedFeaturesCard />
                </div>
                <div className="settings-col">
                    <AccountCard onLogout={handleLogout} />
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
