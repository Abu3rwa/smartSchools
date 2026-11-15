import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineUser } from 'react-icons/hi';
import ImageUploader from '../../../../components/shared/ImageUploader';

const ProfileCard = ({ user, avatarUploading, onAvatarUpload, onAvatarRemove }) => {
    const { t } = useTranslation(['settings']);
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

    return (
        <section className="card settings-card profile-card" aria-labelledby="settings-profile-title">
            <div className="card-header">
                <h3 className="card-title" id="settings-profile-title">
                    <HiOutlineUser /> {t('settings:profile.title')}
                </h3>
            </div>
            <div className="profile-identity">
                <div className="profile-uploader">
                    <ImageUploader
                        currentImageUrl={user?.avatar || null}
                        onUpload={onAvatarUpload}
                        onDelete={onAvatarRemove}
                        isUploading={avatarUploading}
                        label={t('settings:profile.photoLabel')}
                        shape="circular"
                    />
                </div>
                <div className="profile-identity-text">
                    <h4 className="profile-name">{fullName}</h4>
                    <p className="profile-email">{user?.email}</p>
                    <div className="profile-meta">
                        <span className="badge badge-primary text-capitalize">{user?.role}</span>
                        <span className="profile-phone">
                            {t('settings:profile.phone')}: <bdi dir="ltr">{user?.phone || t('settings:profile.notSet')}</bdi>
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ProfileCard;
