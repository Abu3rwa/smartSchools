import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectUser } from '../../../store/slices/authSlice';
import { fetchBehaviorSettings } from '../../../api/behaviorApi';
import BehaviorLogWorkspace from './BehaviorLogWorkspace';
import BehaviorSetupGate from './consequences/BehaviorSetupGate';
import './BehaviorManagementPage.css';

const ADMIN_ROLES = ['super_admin', 'admin', 'department_principal', 'behavior_manager'];

const BehaviorManagementPage = () => {
    const { t } = useTranslation('behaviorConsequences');
    const user = useSelector(selectUser);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const readSettings = useCallback(async () => {
        const payload = await fetchBehaviorSettings();
        setSettings(payload?.settings || null);
    }, []);
    useEffect(() => {
        let cancelled = false;
        fetchBehaviorSettings()
            .then((payload) => { if (!cancelled) setSettings(payload?.settings || null); })
            .catch(() => { if (!cancelled) setFailed(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [retry]);
    return <div className="behavior-management-page">
        {loading ? <p role="status">{t('common.loading')}</p> : failed ? <div role="alert">{t('behaviorLog.failed')} <button onClick={() => { setLoading(true); setFailed(false); setRetry((value) => value + 1); }}>{t('common.retry')}</button></div> : settings?.enabled
            ? <BehaviorLogWorkspace user={user} settings={settings} />
            : <BehaviorSetupGate isAdmin={[user?.role, ...(user?.roles || [])].some((role) => ADMIN_ROLES.includes(role))} onEnabled={readSettings} />}
    </div>;
};

export default BehaviorManagementPage;
