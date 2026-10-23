import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';

export default function PlpEmailConsentControl({ studentId = '' }) {
    const { t, i18n } = useTranslation('plp');
    const [consent, setConsent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await api.get('/plp/email-consent', {
                    params: studentId ? { studentId } : {},
                });
                if (active) setConsent(response.data.data);
            } catch (requestError) {
                if (active) setError({ kind: 'load', message: requestError.response?.data?.message || '' });
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [studentId]);

    const setOptIn = async (optedIn) => {
        setSaving(true);
        setError(null);
        try {
            const response = await api.put('/plp/email-consent', { studentId: consent.studentId, optedIn });
            setConsent((previous) => ({ ...previous, ...response.data.data }));
        } catch (requestError) {
            setError({ kind: 'save', message: requestError.response?.data?.message || '' });
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (value) => new Date(value).toLocaleDateString(i18n.language);

    return (
        <section className="plp-section">
            <h2>{t('consent.title')}</h2>
            {loading && <p>{t('consent.loading')}</p>}
            {error && (
                <p role="alert" style={{ color: 'var(--danger, #b42318)' }}>
                    {error.message || t(error.kind === 'save' ? 'consent.saveFailed' : 'consent.loadFailed')}
                </p>
            )}
            {!loading && consent && (
                <>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <input
                            type="checkbox"
                            checked={consent.optedIn}
                            disabled={saving}
                            onChange={(event) => setOptIn(event.target.checked)}
                        />
                        <span>{t('consent.agreement', { email: consent.recipientEmail })}</span>
                    </label>
                    {consent.optedInAt && consent.optedIn && (
                        <div className="plp-evidence-meta">{t('consent.optedInOn', { date: formatDate(consent.optedInAt) })}</div>
                    )}
                    {!consent.optedIn && consent.revokedAt && (
                        <div className="plp-evidence-meta">
                            {t('consent.optedOutOn', { date: formatDate(consent.revokedAt) })}
                        </div>
                    )}
                    {!consent.optedIn && !consent.revokedAt && (
                        <div className="plp-evidence-meta">{t('consent.noPreference')}</div>
                    )}
                </>
            )}
        </section>
    );
}
