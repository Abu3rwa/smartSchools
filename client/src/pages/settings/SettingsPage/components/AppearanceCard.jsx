import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';

const AppearanceCard = ({ theme, onThemeChange }) => {
    const { t } = useTranslation(['settings']);

    return (
        <section className="card settings-card" aria-labelledby="settings-appearance-title">
            <div className="card-header">
                <h3 className="card-title" id="settings-appearance-title">
                    {t('settings:appearance.title')}
                </h3>
            </div>
            <div className="setting-item">
                <div className="setting-info">
                    <span className="setting-label">{t('settings:appearance.theme')}</span>
                    <span className="setting-description">{t('settings:appearance.themeHint')}</span>
                </div>
                <div className="theme-options" role="group" aria-label={t('settings:appearance.theme')}>
                    <button
                        type="button"
                        className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                        aria-pressed={theme === 'dark'}
                        onClick={() => onThemeChange('dark')}
                    >
                        <HiOutlineMoon size={20} />
                        {t('settings:appearance.dark')}
                    </button>
                    <button
                        type="button"
                        className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                        aria-pressed={theme === 'light'}
                        onClick={() => onThemeChange('light')}
                    >
                        <HiOutlineSun size={20} />
                        {t('settings:appearance.light')}
                    </button>
                </div>
            </div>
        </section>
    );
};

export default AppearanceCard;
