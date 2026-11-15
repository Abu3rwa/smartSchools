import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineLogout } from 'react-icons/hi';

const AccountCard = ({ onLogout }) => {
    const { t } = useTranslation(['settings']);

    return (
        <section className="card settings-card danger-zone" aria-labelledby="settings-account-title">
            <div className="card-header">
                <h3 className="card-title" id="settings-account-title">{t('settings:account.title')}</h3>
            </div>
            <div className="setting-item">
                <div className="setting-info">
                    <span className="setting-label">{t('settings:account.signOut')}</span>
                    <span className="setting-description">{t('settings:account.signOutHint')}</span>
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={onLogout}>
                    <HiOutlineLogout />
                    {t('settings:account.signOut')}
                </button>
            </div>
        </section>
    );
};

export default AccountCard;
