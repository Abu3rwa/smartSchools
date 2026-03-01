import React from 'react';
import { Grid } from '@mui/material';
import { HiOutlineUser } from 'react-icons/hi';
import { getUserInitials } from '../utils/settingsPagePresentation';

const ProfileCard = ({ user }) => {
    return (
        <Grid item xs={12} md={6}>
            <div className="card settings-card">
                <div className="card-header">
                    <h3 className="card-title">
                        <HiOutlineUser /> Profile
                    </h3>
                </div>
                <div className="profile-section">
                    <div className="avatar-xl">
                        {getUserInitials(user?.firstName, user?.lastName)}
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
