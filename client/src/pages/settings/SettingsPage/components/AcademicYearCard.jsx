import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCalendar } from 'react-icons/hi';

const AcademicYearCard = ({ academicYear, isAdmin, onNavigateToSchoolSettings }) => {
    const { t } = useTranslation(['settings']);

    const handleOpenSchoolSettings = () => {
        if (typeof onNavigateToSchoolSettings === 'function') {
            onNavigateToSchoolSettings();
            return;
        }

        // Fallback for rare cases where parent handler is not bound.
        window.location.assign('/portal/school-settings');
    };

    return (
        <section className="card settings-card" aria-labelledby="settings-academic-title">
            <div className="card-header">
                <h3 className="card-title" id="settings-academic-title">
                    <HiOutlineCalendar /> {t('settings:academic.title')}
                </h3>
            </div>
            <div className="setting-item">
                <div className="setting-info">
                    <span className="setting-label">{t('settings:academic.currentYear')}</span>
                    <span className="setting-description">{t('settings:academic.hint')}</span>
                </div>
                <span className="academic-year-value">{academicYear}</span>
            </div>
            {isAdmin && (
                <div className="setting-item setting-item--tight">
                    <div className="setting-info">
                        <span className="setting-description">{t('settings:academic.changeHint')}</span>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenSchoolSettings}>
                        {t('settings:academic.editSchool')}
                    </button>
                </div>
            )}
        </section>
    );
};

export default AcademicYearCard;
