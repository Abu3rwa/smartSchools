import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { saveBehaviorSettings } from '../../../../api/behaviorApi';

/**
 * Shown while behaviorSystem.enabled is false. The settings pair is the only
 * part of the API reachable in that state, so switching the module on from here
 * is the one path that does not need the workspace to already be visible.
 */
const BehaviorSetupGate = ({ isAdmin, onEnabled }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [busy, setBusy] = useState(false);

    const enable = async () => {
        setBusy(true);
        try {
            await saveBehaviorSettings({ enabled: true });
            toast.success(t('gate.enabledToast'));
            await onEnabled();
        } catch (error) {
            setBusy(false);
            toast.error(error?.response?.data?.message || t('gate.enableFailed'));
        }
    };

    return (
        <div className="bc-empty">
            <HiOutlineShieldCheck />
            <h3>{t('gate.title')}</h3>
            <p className="bc-hint">
                {isAdmin ? t('gate.adminBody') : t('gate.staffBody')}
            </p>
            {isAdmin && (
                <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
                    {busy ? t('gate.enabling') : t('gate.enable')}
                </button>
            )}
        </div>
    );
};

export default BehaviorSetupGate;
