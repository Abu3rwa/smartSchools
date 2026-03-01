import React from 'react';
import { Grid } from '@mui/material';

const AcademicYearCard = ({ academicYear, isAdmin, onNavigateToSchoolSettings }) => {
    return (
        <Grid item xs={12} md={6}>
            <div className="card settings-card">
                <div className="card-header">
                    <h3 className="card-title">Academic Settings</h3>
                </div>
                <div className="setting-item">
                    <div className="setting-info">
                        <span className="setting-label">Current Academic Year</span>
                        <span className="setting-description">School-wide academic year controlled by School Admin</span>
                    </div>
                    <select
                        value={academicYear}
                        className="academic-year-select"
                        disabled
                    >
                        <option value={academicYear}>{academicYear}</option>
                    </select>
                </div>
                {isAdmin && (
                    <div className="setting-item" style={{ paddingTop: 0 }}>
                        <div className="setting-info">
                            <span className="setting-description">Need to change it for all users?</span>
                        </div>
                        <button className="btn btn-secondary" onClick={onNavigateToSchoolSettings}>
                            Open School Settings
                        </button>
                    </div>
                )}
            </div>
        </Grid>
    );
};

export default AcademicYearCard;
