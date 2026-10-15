import { useEffect, useState } from 'react';
import api from '../../config/api';

export default function PlpEmailConsentControl({ studentId = '' }) {
    const [consent, setConsent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await api.get('/plp/email-consent', {
                    params: studentId ? { studentId } : {},
                });
                if (active) setConsent(response.data.data);
            } catch (requestError) {
                if (active) setError(requestError.response?.data?.message || 'Unable to load PLP email preferences.');
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, [studentId]);

    const setOptIn = async (optedIn) => {
        setSaving(true);
        setError('');
        try {
            const response = await api.put('/plp/email-consent', { studentId: consent.studentId, optedIn });
            setConsent((previous) => ({ ...previous, ...response.data.data }));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Unable to save PLP email preference.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="plp-section">
            <h2>PLP Progress Email Preference</h2>
            {loading && <p>Loading preference...</p>}
            {error && <p role="alert" style={{ color: 'var(--danger, #b42318)' }}>{error}</p>}
            {!loading && consent && (
                <>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <input
                            type="checkbox"
                            checked={consent.optedIn}
                            disabled={saving}
                            onChange={(event) => setOptIn(event.target.checked)}
                        />
                        <span>
                            I agree to receive PLP progress updates at <strong>{consent.recipientEmail}</strong>.
                            Opting in records your preference. Teachers may also send to contacts listed in the student record
                            without an opt-in; if you opt in and later turn this off, teachers will not send to this address.
                        </span>
                    </label>
                    {consent.optedInAt && consent.optedIn && (
                        <div className="plp-evidence-meta">Opted in on {new Date(consent.optedInAt).toLocaleDateString()}</div>
                    )}
                    {!consent.optedIn && consent.revokedAt && (
                        <div className="plp-evidence-meta">
                            You opted out on {new Date(consent.revokedAt).toLocaleDateString()}. Teachers will not send PLP progress emails to this address.
                        </div>
                    )}
                    {!consent.optedIn && !consent.revokedAt && (
                        <div className="plp-evidence-meta">
                            No preference is recorded. Teachers may send to this address if it is listed in the student record.
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
