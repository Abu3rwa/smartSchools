import { useState } from 'react';
import api from '../../config/api';
import toast from 'react-hot-toast';

export default function PlpProgressEmailPanel({ recordId }) {
    const [preview, setPreview] = useState(null);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const loadPreview = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/plp/records/${recordId}/progress-email-preview`);
            setPreview(response.data.data);
            setSelectedEmails(response.data.data.recipients.map((recipient) => recipient.email));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to load the progress email preview');
        } finally {
            setLoading(false);
        }
    };

    const send = async (resend = false, recipientEmails = selectedEmails) => {
        if (!recipientEmails.length) {
            toast.error('Select at least one student or family contact');
            return;
        }
        setSending(true);
        try {
            const response = await api.post(`/plp/records/${recordId}/progress-email`, {
                recipientEmails,
                resend,
            });
            const results = response.data.data || [];
            const sentCount = results.filter((result) => result.status === 'sent').length;
            const blocked = results.filter((result) => result.status === 'duplicate_blocked');
            if (blocked.length > 0) {
                const confirmed = window.confirm(
                    `${blocked.length} recipient(s) already received this update. Send another copy to those recipients?`
                );
                if (confirmed) {
                    await send(true, blocked.map((result) => result.email));
                    return;
                }
            }
            if (sentCount) toast.success(`Progress update sent to ${sentCount} recipient(s)`);
            const failures = results.filter((result) => !['sent', 'duplicate_blocked'].includes(result.status));
            failures.forEach((result) => toast.error(`${result.email}: ${result.message}`));
            if (!sentCount && !blocked.length && !failures.length) toast.error('No emails were sent');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send PLP progress email');
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="plp-section">
            <h2>Progress Email</h2>
            <p>
                Recipients are the student and family email addresses listed in the student record.
                Contacts who explicitly opted out are excluded; other listed contacts are available even without a recorded opt-in.
                Review the recipients and message before sending.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={loadPreview} disabled={loading || sending}>
                {loading ? 'Loading preview...' : preview ? 'Refresh preview' : 'Preview progress email'}
            </button>
            {preview && (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                    <div>
                        <strong>Subject</strong>
                        <p>{preview.subject}</p>
                    </div>
                    <fieldset style={{ border: '1px solid var(--border-color, #ddd)', borderRadius: 8, padding: 12 }}>
                        <legend>Recipients</legend>
                        {preview.recipients.map((recipient) => (
                            <label key={recipient.email} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                <input
                                    type="checkbox"
                                    checked={selectedEmails.includes(recipient.email)}
                                    onChange={(event) => setSelectedEmails((previous) => (
                                        event.target.checked
                                            ? [...previous, recipient.email]
                                            : previous.filter((email) => email !== recipient.email)
                                    ))}
                                    disabled={sending}
                                />
                                <span>
                                    {recipient.name} ({recipient.type}) - {recipient.email}
                                    {recipient.optedIn ? ' · opted in' : ' · no opt-in recorded'}
                                </span>
                            </label>
                        ))}
                        {preview.recipients.length === 0 && <p>{preview.message}</p>}
                    </fieldset>
                    <details>
                        <summary>Message preview</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{preview.text}</pre>
                    </details>
                    <div>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => send(false)}
                            disabled={sending || !selectedEmails.length}
                        >
                            {sending ? 'Sending...' : 'Send progress update'}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
