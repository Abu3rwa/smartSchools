import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import toast from 'react-hot-toast';

const LANGUAGES = ['en', 'ar', 'both'];

const STATUS_KEYS = {
    sent: 'email.statusSent',
    failed: 'email.statusFailed',
    sending: 'email.statusSending',
    duplicate_blocked: 'email.statusDuplicateBlocked',
};

const LANGUAGE_CODE_KEYS = {
    en: 'email.languageCodeEn',
    ar: 'email.languageCodeAr',
    both: 'email.languageCodeBoth',
};

const LANGUAGE_LABEL_KEYS = {
    en: 'email.languageEn',
    ar: 'email.languageAr',
    both: 'email.languageBoth',
};

const STATUS_CLASSES = {
    sent: 'is-sent',
    failed: 'is-failed',
    sending: 'is-sending',
};

const formatStamp = (value) => (value ? new Date(value).toLocaleString() : '');

export default function PlpProgressEmailPanel({ recordId }) {
    const { t } = useTranslation('plp');
    const [language, setLanguage] = useState(LANGUAGES[0]);
    const [preview, setPreview] = useState(null);
    const [selectedEmails, setSelectedEmails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [showPlainText, setShowPlainText] = useState(false);
    const [history, setHistory] = useState({ rows: [], loading: true, failed: false });
    const [historyToken, setHistoryToken] = useState(0);

    useEffect(() => {
        let active = true;
        setHistory((previous) => ({ ...previous, loading: true }));
        api.get(`/plp/records/${recordId}/email-deliveries`)
            .then((response) => {
                if (active) setHistory({ rows: response.data.data || [], loading: false, failed: false });
            })
            .catch(() => {
                if (active) setHistory((previous) => ({ ...previous, loading: false, failed: true }));
            });
        return () => { active = false; };
    }, [recordId, historyToken]);

    const loadPreview = async (requestedLanguage) => {
        setLoading(true);
        try {
            const response = await api.get(`/plp/records/${recordId}/progress-email-preview`, {
                params: { language: requestedLanguage },
            });
            setPreview(response.data.data);
            setSelectedEmails(response.data.data.recipients.map((recipient) => recipient.email));
        } catch (error) {
            toast.error(error.response?.data?.message || t('email.loadPreviewFailed'));
        } finally {
            setLoading(false);
        }
    };

    const chooseLanguage = (value) => {
        setLanguage(value);
        if (preview) loadPreview(value);
    };

    const send = async (resend = false, recipientEmails = selectedEmails) => {
        if (!recipientEmails.length) {
            toast.error(t('email.selectRecipient'));
            return;
        }
        setSending(true);
        try {
            const response = await api.post(`/plp/records/${recordId}/progress-email`, {
                recipientEmails,
                resend,
                language,
            });
            const results = response.data.data || [];
            setHistoryToken((token) => token + 1);
            const sentCount = results.filter((result) => result.status === 'sent').length;
            const blocked = results.filter((result) => result.status === 'duplicate_blocked');
            if (blocked.length > 0) {
                const confirmed = window.confirm(
                    t('email.resendQuestion', { emails: blocked.map((result) => result.email).join(', ') })
                );
                if (confirmed) {
                    await send(true, blocked.map((result) => result.email));
                    return;
                }
            }
            if (sentCount) toast.success(t('email.sentSummary', { value: sentCount }));
            const failures = results.filter((result) => !['sent', 'duplicate_blocked'].includes(result.status));
            failures.forEach((result) => toast.error(t('email.deliveryFailed', { email: result.email, message: result.message })));
            if (!sentCount && !blocked.length && !failures.length) toast.error(t('email.nothingSent'));
        } catch (error) {
            toast.error(error.response?.data?.message || t('email.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="plp-section">
            <h2>{t('email.title')}</h2>
            <p className="plp-section-note">{t('email.intro')}</p>

            <div className="plp-email-language-picker">
                <span className="plp-email-language-label">{t('email.languageLabel')}</span>
                {LANGUAGES.map((value) => (
                    <label key={value} className="plp-email-language-option">
                        <input
                            type="radio"
                            name="plp-email-language"
                            value={value}
                            checked={language === value}
                            onChange={() => chooseLanguage(value)}
                            disabled={loading || sending}
                        />
                        {t(LANGUAGE_LABEL_KEYS[value])}
                    </label>
                ))}
            </div>
            <p className="plp-email-language-hint">{t('email.languageHint')}</p>

            <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPreview(language)} disabled={loading || sending}>
                {loading ? t('email.previewLoading') : (preview ? t('email.previewRefresh') : t('email.preview'))}
            </button>

            {preview && (
                <div className="plp-email-preview">
                    <div>
                        <strong>{t('email.subjectLabel')}</strong>
                        <p>{preview.subject}</p>
                    </div>

                    <fieldset className="plp-email-recipients">
                        <legend>{t('email.recipientsLabel')}</legend>
                        {preview.recipients.map((recipient) => (
                            <label key={recipient.email} className="plp-email-recipient">
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
                                    <strong>{recipient.name}</strong>
                                    {' '}({t(`email.types.${recipient.type}`)}) — {recipient.email}
                                    {' '}· {recipient.optedIn ? t('email.optedIn') : t('email.noOptIn')}
                                </span>
                            </label>
                        ))}
                        {preview.recipients.length === 0 && <p>{preview.message}</p>}
                    </fieldset>

                    <div className="plp-email-message">
                        <div className="plp-email-message-head">
                            <strong>{t('email.messagePreview')}</strong>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowPlainText((previous) => !previous)}
                            >
                                {showPlainText ? t('email.renderedView') : t('email.plainTextView')}
                            </button>
                        </div>
                        {showPlainText ? (
                            <pre className="plp-email-plain">{preview.text}</pre>
                        ) : (
                            <iframe
                                className="plp-email-frame"
                                title={t('email.previewFrameTitle')}
                                srcDoc={preview.html}
                                sandbox=""
                            />
                        )}
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => send(false)}
                        disabled={sending || !selectedEmails.length}
                    >
                        {sending ? t('email.sending') : t('email.send')}
                    </button>
                </div>
            )}

            <div className="plp-email-history">
                <h3>{t('email.historyTitle')}</h3>
                {history.loading && <p className="plp-evidence-meta">{t('email.historyLoading')}</p>}
                {!history.loading && history.failed && <p className="plp-evidence-meta">{t('email.historyFailed')}</p>}
                {!history.loading && !history.failed && history.rows.length === 0 && (
                    <p className="plp-evidence-meta">{t('email.historyEmpty')}</p>
                )}
                {!history.loading && history.rows.length > 0 && (
                    <div className="plp-table-wrap">
                      <table className="plp-table">
                          <thead>
                              <tr>
                                  <th>{t('email.historyRecipient')}</th>
                                  <th>{t('email.historyStatus')}</th>
                                  <th>{t('email.historyLanguage')}</th>
                                  <th>{t('email.historySent')}</th>
                                  <th>{t('email.historyBy')}</th>
                              </tr>
                          </thead>
                          <tbody>
                              {history.rows.map((row) => (
                                  <tr key={row.id}>
                                      <td>
                                          {row.recipientEmail}
                                          <div className="plp-evidence-meta">
                                              {t(`email.types.${row.recipientType}`)} · {t('email.historyAttempt', { value: row.attempt })}
                                          </div>
                                      </td>
                                      <td>
                                          <span className={`plp-email-status ${STATUS_CLASSES[row.status] || ''}`}>
                                              {t(STATUS_KEYS[row.status] || 'email.statusSending')}
                                          </span>
                                          {row.error && <div className="plp-evidence-meta">{row.error}</div>}
                                      </td>
                                      <td>{t(LANGUAGE_CODE_KEYS[row.language] || 'email.languageCodeEn')}</td>
                                      <td>{formatStamp(row.deliveredAt || row.sentAt)}</td>
                                      <td>{row.sentByName || '—'}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                    </div>
                )}
            </div>
        </section>
    );
}
