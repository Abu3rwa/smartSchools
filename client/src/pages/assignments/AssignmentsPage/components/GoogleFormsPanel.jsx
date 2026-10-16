import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import googleClassroomService from '../../../../services/googleClassroomService';
import googleFormsService from '../../../../services/googleFormsService';

const GoogleFormsPanel = ({ user }) => {
    const { t } = useTranslation(['assignments']);
    const [searchParams, setSearchParams] = useSearchParams();
    const [status, setStatus] = useState({ enabled: false, configured: false, connected: false, email: null });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const canView = ['teacher', 'admin', 'department_principal'].includes(user?.role);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const response = await googleFormsService.getStatus();
            setStatus(response?.data || {});
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:googleForms.errors.status'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (canView) refresh();
    }, [canView, refresh]);

    useEffect(() => {
        window.addEventListener('google-suite-disconnected', refresh);
        return () => window.removeEventListener('google-suite-disconnected', refresh);
    }, [refresh]);

    useEffect(() => {
        const connected = searchParams.get('google_forms_connected');
        const error = searchParams.get('google_forms_error');
        if (!connected && !error) return;
        if (connected) {
            toast.success(t('assignments:googleForms.toasts.connected'));
            refresh();
        } else {
            toast.error(t(`assignments:googleForms.errors.${error}`, {
                defaultValue: t('assignments:googleForms.errors.connect')
            }));
        }
        const next = new URLSearchParams(searchParams);
        next.delete('google_forms_connected');
        next.delete('google_forms_error');
        setSearchParams(next, { replace: true });
    }, [refresh, searchParams, setSearchParams, t]);

    if (!canView || loading && !status.enabled) return null;

    const connect = async () => {
        setBusy(true);
        try {
            const response = await googleClassroomService.getAuthUrl();
            window.location.assign(response.authUrl);
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:googleForms.errors.connect'));
            setBusy(false);
        }
    };

    const disconnect = async () => {
        setBusy(true);
        try {
            await googleFormsService.disconnect();
            toast.success(t('assignments:googleForms.toasts.disconnected'));
            await refresh();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:googleForms.errors.disconnect'));
        } finally {
            setBusy(false);
        }
    };

    if (!status.enabled) return null;

    return (
        <section className="card google-forms-panel" aria-labelledby="google-forms-panel-title">
            <div className="card-header">
                <h3 className="card-title" id="google-forms-panel-title">{t('assignments:googleForms.title')}</h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={busy}>
                    {t('assignments:googleForms.refresh')}
                </button>
            </div>
            <div className="card-body">
                {!status.configured ? (
                    <p role="status">{t('assignments:googleForms.notConfigured')}</p>
                ) : status.connected ? (
                    <div className="google-forms-panel__connection">
                        <span>{t('assignments:googleForms.connectedAs', { email: status.email || '' })}</span>
                        <div className="assignment-csv-import__actions">
                            <button type="button" className="btn btn-secondary" onClick={connect} disabled={busy}>
                                {t('assignments:googleForms.reconnect')}
                            </button>
                            <button type="button" className="btn btn-outline" onClick={disconnect} disabled={busy}>
                                {t('assignments:googleForms.disconnect')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="google-forms-panel__connection">
                        <p>{t('assignments:googleForms.notConnected')}</p>
                        <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
                            {t('assignments:googleForms.connect')}
                        </button>
                    </div>
                )}
                <p className="text-muted">{t('assignments:googleForms.sharedAccessNotice')}</p>
                <p className="text-muted">{t('assignments:googleForms.verifiedEmailNotice')}</p>
            </div>
        </section>
    );
};

export default GoogleFormsPanel;
