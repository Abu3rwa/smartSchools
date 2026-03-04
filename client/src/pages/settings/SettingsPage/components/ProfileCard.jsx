import React from 'react';
import { Grid } from '@mui/material';
import { HiOutlineUser } from 'react-icons/hi';
import ImageUploader from '../../../../components/shared/ImageUploader';

const ProfileCard = ({ user, avatarUploading, onAvatarUpload, onAvatarRemove }) => {
    return (
        <Grid item xs={12} md={6}>
            <div className="card settings-card">
                <div className="card-header">
                    <h3 className="card-title">
                        <HiOutlineUser /> Profile
                    </h3>
                </div>
                <div className="profile-section">
                    <div className="profile-uploader">
                        <ImageUploader
                            currentImageUrl={user?.avatar || null}
                            onUpload={onAvatarUpload}
                            onDelete={onAvatarRemove}
                            isUploading={avatarUploading}
                            label="Personal Photo"
                            shape="circular"
                        />
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
        </Grid>
    );
};

export default ProfileCard;
