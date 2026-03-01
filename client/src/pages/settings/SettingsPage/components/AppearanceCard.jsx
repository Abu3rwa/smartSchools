import React from 'react';
import { Grid } from '@mui/material';
import { HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';

const AppearanceCard = ({ theme, onThemeChange }) => {
    return (
        <Grid item xs={12} md={6}>
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
                            onClick={() => onThemeChange('dark')}
                        >
                            <HiOutlineMoon size={20} />
                            Dark
                        </button>
                        <button
                            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => onThemeChange('light')}
                        >
                            <HiOutlineSun size={20} />
                            Light
                        </button>
                    </div>
                </div>
            </div>
        </Grid>
    );
};

export default AppearanceCard;
