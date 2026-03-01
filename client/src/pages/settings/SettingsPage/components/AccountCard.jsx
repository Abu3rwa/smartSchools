import React from 'react';
import { Grid } from '@mui/material';
import { HiOutlineLogout } from 'react-icons/hi';

const AccountCard = ({ onLogout }) => {
    return (
        <Grid item xs={12} md={6}>
            <div className="card settings-card danger-zone">
                <div className="card-header">
                    <h3 className="card-title">Account</h3>
                </div>
                <div className="setting-item">
                    <div className="setting-info">
                        <span className="setting-label">Sign Out</span>
                        <span className="setting-description">Sign out from your account</span>
                    </div>
                    <button className="btn btn-danger" onClick={onLogout}>
                        <HiOutlineLogout />
                        Sign Out
                    </button>
                </div>
            </div>
        </Grid>
    );
};

export default AccountCard;
