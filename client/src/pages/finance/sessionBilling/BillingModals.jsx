import React, { useEffect, useRef, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    Icon,
    Modal,
    Spinner
} from './ui';
import { field, money, niceDate } from './utils';

const DEFAULT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank-transfer', label: 'Bank transfer' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'online', label: 'Online' },
    { value: 'other', label: 'Other' }
];

const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'Arabic' },
    { value: 'both', label: 'English and Arabic' }
];

const sourceOptions = [
    { value: 'in-person', label: 'In person' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'other', label: 'Other' },
    { value: 'manual', label: 'Manual entry' }
];

const todayInput = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const usePaymentMethods = () => {
    const [methods, setMethods] = useState(DEFAULT_METHODS);
    useEffect(() => {
        let active = true;
        api.get('/finance/billing/settings')
            .then((response) => {
                const enabled = response.data?.data?.settings?.enabledPaymentMethods;
                if (active && Array.isArray(enabled) && enabled.length) {
                    setMethods(DEFAULT_METHODS.filter((method) => enabled.includes(method.value)));
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);
    return methods;
};

const useStudentOptions = (preset = null) => {
    const [options, setOptions] = useState(
        preset?.id ? [{ id: preset.id, name: preset.name || 'Student' }] : []
    );
    useEffect(() => {
        let active = true;
        api.get('/students', { params: { limit: 'all', status: 'active' } })
            .then((response) => {
                if (!active) return;
                const list = (response.data?.data?.students || []).map((student) => ({
                    id: String(student._id),
                    name: `${student.firstName || ''} ${student.lastName || ''}`.trim()
                })).sort((a, b) => a.name.localeCompare(b.name));
                setOptions((prev) => {
                    const merged = new Map(list.map((item) => [item.id, item]));
                    for (const item of prev) {
                        if (!merged.has(item.id)) merged.set(item.id, item);
                    }
                    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
                });
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);
    return options;
};

const ResultList = ({ results }) => {
    if (!results || results.length === 0) return null;
    return (
        <ul className="sb-send-results">
            {results.map((result) => (
                <li key={result.email} className={`is-${result.status}`}>
                    <Icon name={result.status === 'sent' ? 'check' : result.status === 'failed' ? 'warn' : 'mail'} size={14} />
                    <div>
                        <strong>{result.email}</strong>
                        <small>{result.message || (result.status === 'sent' ? 'Delivered' : result.status.replace('_', ' '))}</small>
                    </div>
                    <Badge tone={result.status === 'sent' ? 'good' : result.status === 'failed' ? 'danger' : 'warning'}>
                        {result.status === 'sent' ? 'Sent' : result.status === 'failed' ? 'Failed' : 'Held'}
                    </Badge>
                </li>
            ))}
        </ul>
    );
};

const RecipientPicker = ({ recipients, selected, onChange }) => {
    if (!recipients?.length) {
        return (
            <div className="sb-recipient-empty">
                <Icon name="warn" size={16} />
                <span>No parent or student email is on file, or every contact has turned school email off.</span>
            </div>
        );
    }
    const toggle = (email) => {
        const next = new Set(selected);
        if (next.has(email)) next.delete(email);
        else next.add(email);
        onChange(next);
    };
    return (
        <div className="sb-recipient-list">
            {recipients.map((recipient) => (
                <label key={recipient.email} className="sb-recipient">
                    <input
                        type="checkbox"
                        checked={selected.has(recipient.email)}
                        onChange={() => toggle(recipient.email)}
                    />
                    <span>
                        <strong>{recipient.name || recipient.type}</strong>
                        <small>{recipient.email} · {recipient.type}</small>
                    </span>
                </label>
            ))}
        </div>
    );
};

const MailPreview = ({ html, subject, text }) => {
    if (html) {
        return (
            <iframe
                title="Email preview"
                className="sb-mail-preview"
                sandbox=""
                srcDoc={html}
            />
        );
    }
    return (
        <div className="sb-mail-preview sb-mail-preview-text">
            <strong>{subject}</strong>
            <pre>{text}</pre>
        </div>
    );
};

const MailPreviewBlock = ({ preview, loading, error }) => {
    const [tab, setTab] = useState('preview');
    if (loading) return <div className="sb-preview-loading"><Spinner /> Building the email…</div>;
    if (error) return <div className="finance-error">{error}</div>;
    if (!preview) return null;
    return (
        <div className="sb-mail-block">
            <div className="sb-mail-head">
                <div>
                    <span className="sb-eyebrow">Subject</span>
                    <strong>{preview.subject}</strong>
                </div>
                <div className="sb-segmented">
                    <button className={tab === 'preview' ? 'is-active' : ''} onClick={() => setTab('preview')}>Preview</button>
                    <button className={tab === 'text' ? 'is-active' : ''} onClick={() => setTab('text')}>Plain text</button>
                </div>
            </div>
            {tab === 'preview'
                ? <MailPreview html={preview.html} subject={preview.subject} text={preview.text} />
                : <div className="sb-mail-preview sb-mail-preview-text"><pre>{preview.text}</pre></div>}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

const PaymentModal = ({ preset, onClose, onDone, range }) => {
    const methods = usePaymentMethods();
    const students = useStudentOptions(preset);
    const [form, setForm] = useState({
        studentId: preset?.studentId || '',
        amount: '',
        method: methods[0]?.value || 'cash',
        receivedAt: todayInput(),
        reference: '',
        note: ''
    });
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            await api.post('/finance/billing/payments', {
                ...form,
                amount: Number(form.amount)
            });
            toast.success('Payment recorded.');
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record the payment.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            title="Record a payment"
            eyebrow="Money received"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={submit}
                        disabled={saving || !form.studentId || !(Number(form.amount) > 0)}
                    >
                        {saving ? 'Saving…' : 'Record payment'}
                    </button>
                </>
            )}
        >
            <div className="sb-form-stack">
                {field('Student',
                    <select
                        value={form.studentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    >
                        <option value="">Choose a student</option>
                        {students.map((student) => (
                            <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </select>
                )}
                <div className="sb-form-grid">
                    {field('Amount',
                        <input
                            type="number" min="0" step="0.01" autoFocus
                            value={form.amount}
                            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                        />
                    )}
                    {field('Method',
                        <select
                            value={form.method}
                            onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
                        >
                            {methods.map((method) => (
                                <option key={method.value} value={method.value}>{method.label}</option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="sb-form-grid">
                    {field('Payment date',
                        <input
                            type="date"
                            max={todayInput()}
                            value={form.receivedAt}
                            onChange={(event) => setForm((prev) => ({ ...prev, receivedAt: event.target.value }))}
                        />
                    )}
                    {field('Reference',
                        <input
                            value={form.reference}
                            maxLength={200}
                            placeholder="Transfer or receipt number"
                            onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
                        />
                    )}
                </div>
                {field('Note',
                    <input
                        value={form.note}
                        maxLength={500}
                        placeholder="Optional staff note"
                        onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                    />
                )}
            </div>
        </Modal>
    );
};

const RefundModal = ({ preset, onClose, onDone }) => {
    const methods = usePaymentMethods();
    const students = useStudentOptions(preset);
    const [form, setForm] = useState({
        studentId: preset?.studentId || '',
        amount: '',
        method: 'other',
        receivedAt: todayInput(),
        reason: '',
        reference: ''
    });
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            await api.post('/finance/billing/refunds', { ...form, amount: Number(form.amount) });
            toast.success('Refund recorded.');
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record the refund.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            title="Record a refund"
            eyebrow="Money returned"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-danger"
                        onClick={submit}
                        disabled={saving || !form.studentId || !(Number(form.amount) > 0) || !form.reason.trim()}
                    >
                        {saving ? 'Saving…' : 'Record refund'}
                    </button>
                </>
            )}
        >
            <div className="sb-form-stack">
                {field('Student',
                    <select
                        value={form.studentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    >
                        <option value="">Choose a student</option>
                        {students.map((student) => (
                            <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </select>
                )}
                <div className="sb-form-grid">
                    {field('Amount',
                        <input
                            type="number" min="0" step="0.01"
                            value={form.amount}
                            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                        />
                    )}
                    {field('Method',
                        <select
                            value={form.method}
                            onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
                        >
                            {methods.map((method) => (
                                <option key={method.value} value={method.value}>{method.label}</option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="sb-form-grid">
                    {field('Refund date',
                        <input
                            type="date"
                            value={form.receivedAt}
                            onChange={(event) => setForm((prev) => ({ ...prev, receivedAt: event.target.value }))}
                        />
                    )}
                    {field('Reference',
                        <input
                            value={form.reference}
                            maxLength={200}
                            placeholder="Optional transfer reference"
                            onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
                        />
                    )}
                </div>
                {field('Reason',
                    <textarea
                        rows={3}
                        maxLength={500}
                        value={form.reason}
                        placeholder="Why is this money going back to the family?"
                        onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                    />
                )}
                <p className="sb-card-note">
                    A refund cannot be larger than the money still held on the account. The entry stays in the ledger
                    and can be voided later if needed.
                </p>
            </div>
        </Modal>
    );
};

const AdjustmentModal = ({ preset, onClose, onDone }) => {
    const students = useStudentOptions(preset);
    const [form, setForm] = useState({
        studentId: preset?.studentId || '',
        direction: 'credit',
        amount: '',
        occurredAt: todayInput(),
        reason: ''
    });
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            await api.post('/finance/billing/adjustments', { ...form, amount: Number(form.amount) });
            toast.success('Adjustment recorded.');
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record the adjustment.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            title="Adjust the account"
            eyebrow="Correction"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={submit}
                        disabled={saving || !form.studentId || !(Number(form.amount) > 0) || !form.reason.trim()}
                    >
                        {saving ? 'Saving…' : 'Record adjustment'}
                    </button>
                </>
            )}
        >
            <div className="sb-form-stack">
                <div className="sb-segmented sb-segmented-lg">
                    <button className={form.direction === 'credit' ? 'is-active' : ''} onClick={() => setForm((prev) => ({ ...prev, direction: 'credit' }))}>
                        Credit the family
                    </button>
                    <button className={form.direction === 'debit' ? 'is-active' : ''} onClick={() => setForm((prev) => ({ ...prev, direction: 'debit' }))}>
                        Debit the family
                    </button>
                </div>
                <p className="sb-card-note">
                    A credit lowers what the family owes. A debit adds a charge without a lesson. Use this for a
                    goodwill credit, a missing fee, or a correction.
                </p>
                {field('Student',
                    <select
                        value={form.studentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    >
                        <option value="">Choose a student</option>
                        {students.map((student) => (
                            <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </select>
                )}
                <div className="sb-form-grid">
                    {field('Amount',
                        <input
                            type="number" min="0" step="0.01"
                            value={form.amount}
                            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                        />
                    )}
                    {field('Date',
                        <input
                            type="date"
                            value={form.occurredAt}
                            onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
                        />
                    )}
                </div>
                {field('Reason',
                    <textarea
                        rows={3}
                        maxLength={500}
                        value={form.reason}
                        placeholder="What is this correction for?"
                        onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                    />
                )}
            </div>
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Packages                                                            */
/* ------------------------------------------------------------------ */

const SellPackageModal = ({ preset, onClose, onDone }) => {
    const students = useStudentOptions(preset);
    const methods = usePaymentMethods();
    const [packages, setPackages] = useState([]);
    const [form, setForm] = useState({
        studentId: preset?.studentId || '',
        packageId: '',
        name: '',
        minutes: '',
        price: '',
        expiryDays: 0,
        method: methods[0]?.value || 'cash',
        purchasedAt: todayInput(),
        note: ''
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        api.get('/finance/billing/packages')
            .then((response) => {
                if (active) setPackages(response.data?.data?.packages || []);
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    const choosePackage = (packageId) => {
        const pkg = packages.find((item) => item.id === packageId);
        setForm((prev) => ({
            ...prev,
            packageId,
            name: pkg?.name || '',
            minutes: pkg?.minutes ?? '',
            price: pkg?.price ?? '',
            expiryDays: pkg?.expiryDays ?? 0
        }));
    };

    const submit = async () => {
        setSaving(true);
        try {
            const response = await api.post('/finance/billing/packages/purchases', {
                ...form,
                minutes: Number(form.minutes),
                price: Number(form.price),
                expiryDays: Number(form.expiryDays)
            });
            const refundable = response.data?.data?.entry?.amount;
            toast.success(refundable ? 'Package sold and payment recorded.' : 'Package sold.');
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not sell the package.');
        } finally {
            setSaving(false);
        }
    };

    const activePackages = packages.filter((pkg) => pkg.active !== false);
    const packageCurrency = activePackages[0]?.currency || 'USD';

    return (
        <Modal
            open
            title="Sell a lesson package"
            eyebrow="Prepaid minutes"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={submit}
                        disabled={saving || !form.studentId || !(Number(form.minutes) > 0)}
                    >
                        {saving ? 'Selling…' : 'Sell package'}
                    </button>
                </>
            )}
        >
            <div className="sb-form-stack">
                {field('Student',
                    <select
                        value={form.studentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    >
                        <option value="">Choose a student</option>
                        {students.map((student) => (
                            <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </select>
                )}
                {field('Package',
                    <select value={form.packageId} onChange={(event) => choosePackage(event.target.value)}>
                        <option value="">Custom package</option>
                        {activePackages.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                                {pkg.name} · {pkg.minutes} min · {money(pkg.price, pkg.currency)}
                            </option>
                        ))}
                    </select>
                )}
                <div className="sb-form-grid">
                    {field('Minutes included',
                        <input
                            type="number" min="1"
                            value={form.minutes}
                            onChange={(event) => setForm((prev) => ({ ...prev, minutes: event.target.value }))}
                        />
                    )}
                    {field('Price',
                        <input
                            type="number" min="0" step="0.01"
                            value={form.price}
                            onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                        />,
                        Number(form.minutes) > 0
                            ? `${money((Number(form.price) || 0) / (Number(form.minutes) / 60), packageCurrency)}/hr effective`
                            : ''
                    )}
                </div>
                <div className="sb-form-grid">
                    {field('Method',
                        <select
                            value={form.method}
                            onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
                        >
                            {methods.map((method) => (
                                <option key={method.value} value={method.value}>{method.label}</option>
                            ))}
                        </select>
                    )}
                    {field('Purchase date',
                        <input
                            type="date"
                            max={todayInput()}
                            value={form.purchasedAt}
                            onChange={(event) => setForm((prev) => ({ ...prev, purchasedAt: event.target.value }))}
                        />
                    )}
                </div>
                {field('Expires after (days)',
                    <input
                        type="number" min="0" max="3650"
                        value={form.expiryDays}
                        onChange={(event) => setForm((prev) => ({ ...prev, expiryDays: event.target.value }))}
                    />,
                    '0 means the minutes never expire.'
                )}
            </div>
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

const useMailRecipients = (preview) => {
    const [selected, setSelected] = useState(new Set());
    useEffect(() => {
        if (!preview) return;
        setSelected(new Set((preview.recipients || []).map((recipient) => recipient.email)));
    }, [preview]);
    return [selected, setSelected];
};

const EmailStatementModal = ({ studentId, studentName, activeRange, onClose, onDone, onPrint }) => {
    const [language, setLanguage] = useState('en');
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);
    const [sending, setSending] = useState(false);
    const [resend, setResend] = useState(false);
    const [selected, setSelected] = useMailRecipients(preview);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        setResults(null);
        api.get(`/finance/billing/students/${studentId}/email/preview`, {
            params: { ...activeRange, language }
        })
            .then((response) => {
                if (active) setPreview(response.data?.data || null);
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || 'Could not build the statement email.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [studentId, activeRange.from, activeRange.to, language]);

    const send = async () => {
        setSending(true);
        try {
            const response = await api.post(`/finance/billing/students/${studentId}/email`, {
                recipientEmails: [...selected],
                language,
                resend,
                from: activeRange.from,
                to: activeRange.to
            });
            setResults(response.data?.data || []);
            const sent = (response.data?.data || []).filter((result) => result.status === 'sent').length;
            if (sent) {
                toast.success(`${sent} statement${sent === 1 ? '' : 's'} sent.`);
                onDone?.();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send the statement.');
        } finally {
            setSending(false);
        }
    };

    const duplicate = (results || []).some((result) => result.status === 'duplicate_blocked');

    return (
        <Modal
            open
            wide
            title={`Statement for ${studentName || preview?.recipients?.[0]?.name || 'this student'}`}
            eyebrow="Email a statement"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={() => onPrint?.({
                        kind: 'statement',
                        studentId,
                        language: language === 'both' ? 'en' : language,
                        title: 'Statement'
                    })}>
                        <Icon name="print" size={14} /> Print
                    </button>
                    <button className="btn-secondary" onClick={onClose}>Close</button>
                    <button
                        className="btn-primary"
                        onClick={send}
                        disabled={sending || selected.size === 0 || loading}
                    >
                        {sending ? 'Sending…' : `Send to ${selected.size || 0}`}
                    </button>
                </>
            )}
        >
            <div className="sb-mail-modal">
                <div className="sb-mail-side">
                    {field('Language',
                        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                            {LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    )}
                    <div>
                        <span className="sb-field-label">Recipients</span>
                        {loading ? <div className="sb-preview-loading"><Spinner /></div> : (
                            <RecipientPicker recipients={preview?.recipients || []} selected={selected} onChange={setSelected} />
                        )}
                    </div>
                    {preview?.message && <p className="sb-card-note">{preview.message}</p>}
                    <label className="sb-checkbox">
                        <input type="checkbox" checked={resend} onChange={(event) => setResend(event.target.checked)} />
                        <span>Send again even if already sent this period</span>
                    </label>
                    {duplicate && (
                        <p className="sb-card-note sb-note-warn">
                            This statement was already emailed for this period. Tick the box above to send another copy.
                        </p>
                    )}
                    <ResultList results={results} />
                </div>
                <MailPreviewBlock preview={preview} loading={loading} error={error} />
            </div>
        </Modal>
    );
};

const ReminderModal = ({ studentId, studentName, onClose, onDone }) => {
    const [language, setLanguage] = useState('en');
    const [opening, setOpening] = useState('');
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);
    const [sending, setSending] = useState(false);
    const [drafting, setDrafting] = useState(false);
    const [selected, setSelected] = useMailRecipients(preview);

    const load = async (nextLanguage = language, nextOpening = opening) => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get(`/finance/billing/students/${studentId}/reminder/preview`, {
                params: { language: nextLanguage, opening: nextOpening }
            });
            setPreview(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Could not build the reminder.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, language]);

    const draft = async () => {
        setDrafting(true);
        try {
            const response = await api.post(`/finance/billing/students/${studentId}/message-draft`, { language });
            setOpening(response.data?.data?.opening || '');
            toast.success('Draft ready. Review it before sending.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not draft a message.');
        } finally {
            setDrafting(false);
        }
    };

    const send = async () => {
        setSending(true);
        try {
            const response = await api.post(`/finance/billing/students/${studentId}/reminder`, {
                recipientEmails: [...selected],
                language,
                opening
            });
            setResults(response.data?.data || []);
            const sent = (response.data?.data || []).filter((result) => result.status === 'sent').length;
            if (sent) {
                toast.success(`${sent} reminder${sent === 1 ? '' : 's'} sent.`);
                onDone?.();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send the reminder.');
        } finally {
            setSending(false);
        }
    };

    const applyOpening = () => load(language, opening);

    return (
        <Modal
            open
            wide
            title={`Remind ${studentName || 'this family'}`}
            eyebrow="Payment reminder"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Close</button>
                    <button
                        className="btn-primary"
                        onClick={send}
                        disabled={sending || selected.size === 0 || loading}
                    >
                        {sending ? 'Sending…' : `Send to ${selected.size || 0}`}
                    </button>
                </>
            )}
        >
            <div className="sb-mail-modal">
                <div className="sb-mail-side">
                    {preview && (
                        <div className="sb-reminder-summary">
                            <span className="sb-eyebrow">Owed</span>
                            <strong>{money(preview.owed, preview.currency)}</strong>
                            <small>{studentName}</small>
                        </div>
                    )}
                    {field('Language',
                        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                            {LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    )}
                    {field('Opening line',
                        <textarea
                            rows={3}
                            maxLength={600}
                            value={opening}
                            placeholder="Optional personal note"
                            onChange={(event) => setOpening(event.target.value)}
                        />,
                        'Leave blank to use the standard reminder.'
                    )}
                    <div className="sb-inline-actions">
                        <button className="btn-secondary btn-sm" onClick={draft} disabled={drafting}>
                            {drafting ? <Spinner /> : <Icon name="sparkles" size={14} />} Draft with AI
                        </button>
                        <button className="btn-secondary btn-sm" onClick={applyOpening} disabled={loading}>
                            Refresh preview
                        </button>
                    </div>
                    <div>
                        <span className="sb-field-label">Recipients</span>
                        {loading ? <div className="sb-preview-loading"><Spinner /></div> : (
                            <RecipientPicker recipients={preview?.recipients || []} selected={selected} onChange={setSelected} />
                        )}
                    </div>
                    <ResultList results={results} />
                </div>
                <MailPreviewBlock preview={preview} loading={loading} error={error} />
            </div>
            <p className="sb-card-note">
                AI only writes a suggested opening line. Nothing is sent until you press Send.
            </p>
        </Modal>
    );
};

const ReceiptModal = ({ payment, onClose, onDone, onPrint }) => {
    const [language, setLanguage] = useState('en');
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);
    const [sending, setSending] = useState(false);
    const [resend, setResend] = useState(false);
    const [selected, setSelected] = useMailRecipients(preview);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        api.get(`/finance/billing/payments/${payment.id}/receipt/preview`)
            .then((response) => {
                if (active) setPreview(response.data?.data || null);
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || 'Could not build the receipt email.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [payment.id]);

    const send = async () => {
        setSending(true);
        try {
            const response = await api.post(`/finance/billing/payments/${payment.id}/receipt`, {
                recipientEmails: [...selected],
                language,
                resend
            });
            setResults(response.data?.data || []);
            const sent = (response.data?.data || []).filter((result) => result.status === 'sent').length;
            if (sent) {
                toast.success(`${sent} receipt${sent === 1 ? '' : 's'} sent.`);
                onDone?.();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send the receipt.');
        } finally {
            setSending(false);
        }
    };

    const entry = preview?.entry || payment;
    const currency = entry.currency || 'USD';

    return (
        <Modal
            open
            wide
            title="Payment receipt"
            eyebrow="Email a receipt"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={() => onPrint?.({
                        kind: 'receipt',
                        entryId: payment.id,
                        title: 'Receipt'
                    })}>
                        <Icon name="print" size={14} /> Print
                    </button>
                    <button className="btn-secondary" onClick={onClose}>Close</button>
                    <button
                        className="btn-primary"
                        onClick={send}
                        disabled={sending || selected.size === 0 || loading}
                    >
                        {sending ? 'Sending…' : `Send to ${selected.size || 0}`}
                    </button>
                </>
            )}
        >
            <div className="sb-mail-modal">
                <div className="sb-mail-side">
                    <div className="sb-reminder-summary">
                        <span className="sb-eyebrow">Amount received</span>
                        <strong>{money(entry.amount, currency)}</strong>
                        <small>{payment.studentName} · {niceDate(entry.occurredAt || payment.occurredAt)}</small>
                    </div>
                    {field('Language',
                        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                            {LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    )}
                    <div>
                        <span className="sb-field-label">Recipients</span>
                        {loading ? <div className="sb-preview-loading"><Spinner /></div> : (
                            <RecipientPicker recipients={preview?.recipients || []} selected={selected} onChange={setSelected} />
                        )}
                    </div>
                    <label className="sb-checkbox">
                        <input type="checkbox" checked={resend} onChange={(event) => setResend(event.target.checked)} />
                        <span>Send another copy of this receipt</span>
                    </label>
                    <ResultList results={results} />
                </div>
                <MailPreviewBlock preview={preview} loading={loading} error={error} />
            </div>
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Manual lesson time                                                  */
/* ------------------------------------------------------------------ */

const LogTimeModal = ({ onClose, onDone }) => {
    const [options, setOptions] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        classId: '',
        studentId: '',
        basis: 'attended',
        minutes: '',
        occurredAt: todayInput(),
        lessonSource: 'in-person',
        note: ''
    });

    useEffect(() => {
        let active = true;
        api.get('/finance/billing/manual/options')
            .then((response) => {
                if (active) setOptions(response.data?.data || null);
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || 'Could not load your classes.');
            });
        return () => { active = false; };
    }, []);

    const classes = options?.classes || [];
    const selectedClass = classes.find((klass) => klass.id === form.classId);
    const students = selectedClass?.students || [];
    const selectedStudent = students.find((student) => student.id === form.studentId);

    const submit = async () => {
        setSaving(true);
        try {
            await api.post('/finance/billing/manual/entries', {
                classId: form.classId,
                studentId: form.studentId,
                basis: form.basis,
                minutes: form.basis === 'attended' ? Number(form.minutes) : 0,
                occurredAt: form.occurredAt,
                lessonSource: form.lessonSource,
                note: form.note
            });
            toast.success('Lesson time logged.');
            onDone?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not log this lesson.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            title="Log lesson time"
            eyebrow="Off-platform lesson"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={submit}
                        disabled={saving || !form.classId || !form.studentId || (form.basis === 'attended' && !(Number(form.minutes) > 0))}
                    >
                        {saving ? 'Saving…' : 'Log and charge'}
                    </button>
                </>
            )}
        >
            {!options && !error ? <div className="sb-preview-loading"><Spinner /> Loading your classes…</div> : error ? (
                <div className="finance-error">{error}</div>
            ) : (
                <div className="sb-form-stack">
                    <div className="sb-segmented sb-segmented-lg">
                        <button className={form.basis === 'attended' ? 'is-active' : ''} onClick={() => setForm((prev) => ({ ...prev, basis: 'attended' }))}>Attended</button>
                        <button className={form.basis === 'no-show' ? 'is-active' : ''} onClick={() => setForm((prev) => ({ ...prev, basis: 'no-show' }))}>No-show</button>
                        <button className={form.basis === 'late-cancellation' ? 'is-active' : ''} onClick={() => setForm((prev) => ({ ...prev, basis: 'late-cancellation' }))}>Late cancellation</button>
                    </div>
                    <div className="sb-form-grid">
                        {field('Class',
                            <select
                                value={form.classId}
                                onChange={(event) => setForm((prev) => ({
                                    ...prev,
                                    classId: event.target.value,
                                    studentId: ''
                                }))}
                            >
                                <option value="">Choose a class</option>
                                {classes.map((klass) => (
                                    <option key={klass.id} value={klass.id}>
                                        {klass.name} · {money(klass.hourlyRate, options.currency)}/hr
                                    </option>
                                ))}
                            </select>
                        )}
                        {field('Student',
                            <select
                                value={form.studentId}
                                onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                                disabled={!selectedClass}
                            >
                                <option value="">{selectedClass ? 'Choose a student' : 'Choose a class first'}</option>
                                {students.map((student) => (
                                    <option key={student.id} value={student.id}>{student.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    {selectedStudent?.packageName && (
                        <p className="sb-card-note">
                            This student has {Math.floor(selectedStudent.packageMinutes)} minutes left on {selectedStudent.packageName}.
                            Those minutes are used first.
                        </p>
                    )}
                    <div className="sb-form-grid">
                        {form.basis === 'attended' && field('Minutes',
                            <input
                                type="number" min="1" max="600"
                                value={form.minutes}
                                onChange={(event) => setForm((prev) => ({ ...prev, minutes: event.target.value }))}
                            />,
                            options ? `Rounded to ${options.roundingMinutes} min · minimum ${options.minimumBillableMinutes} min` : ''
                        )}
                        {field('Date',
                            <input
                                type="date"
                                max={todayInput()}
                                value={form.occurredAt}
                                onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
                            />
                        )}
                    </div>
                    <div className="sb-form-grid">
                        {field('Where',
                            <select
                                value={form.lessonSource}
                                onChange={(event) => setForm((prev) => ({ ...prev, lessonSource: event.target.value }))}
                            >
                                {sourceOptions.map((source) => (
                                    <option key={source.value} value={source.value}>{source.label}</option>
                                ))}
                            </select>
                        )}
                        {field('Note',
                            <input
                                value={form.note}
                                maxLength={500}
                                placeholder="Optional"
                                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                            />
                        )}
                    </div>
                    {selectedClass && (
                        <p className="sb-card-note">
                            This lesson will be charged at {money(selectedClass.hourlyRate, options.currency)}/hr using the
                            school rounding and minimum rules.
                        </p>
                    )}
                </div>
            )}
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Bulk messages                                                       */
/* ------------------------------------------------------------------ */

const BulkProgress = ({ total, done, sent, failed, held }) => (
    <div className="sb-bulk-progress">
        <div className="sb-bulk-track">
            <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
        <small>{done} of {total} · {sent} sent · {failed} failed · {held} held</small>
    </div>
);

const BulkStatementsModal = ({ activeRange, onClose, onDone }) => {
    const [roster, setRoster] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [language, setLanguage] = useState('en');
    const [progress, setProgress] = useState({ done: 0, sent: 0, failed: 0, held: 0 });
    const [running, setRunning] = useState(false);

    useEffect(() => {
        let active = true;
        api.get('/finance/billing/email/roster', { params: activeRange })
            .then((response) => {
                if (!active) return;
                const data = response.data?.data || null;
                setRoster(data);
                setSelected(new Set((data?.students || [])
                    .filter((student) => student.recipients?.length)
                    .map((student) => student.studentId)));
            })
            .catch(() => {
                if (active) setRoster({ students: [] });
            });
        return () => { active = false; };
    }, [activeRange]);

    const students = (roster?.students || []).filter((student) => student.recipients?.length);
    const total = selected.size;

    const send = async () => {
        setRunning(true);
        const next = { done: 0, sent: 0, failed: 0, held: 0 };
        for (const student of students) {
            if (!selected.has(student.studentId)) continue;
            try {
                const response = await api.post(`/finance/billing/students/${student.studentId}/email`, {
                    recipientEmails: student.recipients.map((recipient) => recipient.email),
                    language,
                    from: activeRange.from,
                    to: activeRange.to
                });
                for (const result of response.data?.data || []) {
                    if (result.status === 'sent') next.sent += 1;
                    else if (result.status === 'failed') next.failed += 1;
                    else next.held += 1;
                }
            } catch {
                next.failed += student.recipients.length;
            }
            next.done += 1;
            setProgress({ ...next });
        }
        setRunning(false);
        toast.success(`Finished: ${next.sent} delivered, ${next.failed} failed, ${next.held} held.`);
        onDone?.();
    };

    return (
        <Modal
            open
            wide
            title="Email statements"
            eyebrow="Family communication"
            onClose={running ? undefined : onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose} disabled={running}>Close</button>
                    <button className="btn-primary" onClick={send} disabled={running || !total}>
                        {running ? 'Sending…' : `Send ${total} statement${total === 1 ? '' : 's'}`}
                    </button>
                </>
            )}
        >
            {!roster ? <div className="sb-preview-loading"><Spinner /> Loading families…</div> : (
                <div className="sb-form-stack">
                    <div className="sb-form-grid">
                        {field('Language',
                            <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={running}>
                                {LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        )}
                        <div className="sb-bulk-selectall">
                            <button
                                className="btn-secondary btn-sm"
                                disabled={running}
                                onClick={() => setSelected(
                                    selected.size === students.length
                                        ? new Set()
                                        : new Set(students.map((student) => student.studentId))
                                )}
                            >
                                {selected.size === students.length ? 'Clear all' : 'Select all'}
                            </button>
                        </div>
                    </div>
                    {students.length === 0 ? (
                        <div className="sb-recipient-empty">
                            <Icon name="warn" size={16} />
                            <span>No student has a reachable parent or student email for this period.</span>
                        </div>
                    ) : (
                        <ul className="sb-bulk-list">
                            {students.map((student) => {
                                const active = selected.has(student.studentId);
                                return (
                                    <li key={student.studentId} className={active ? 'is-active' : ''}>
                                        <label className="sb-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                disabled={running}
                                                onChange={() => {
                                                    const nextSet = new Set(selected);
                                                    if (active) nextSet.delete(student.studentId);
                                                    else nextSet.add(student.studentId);
                                                    setSelected(nextSet);
                                                }}
                                            />
                                            <span>
                                                <strong>{student.name}</strong>
                                                <small>
                                                    {student.recipients.map((recipient) => recipient.email).join(', ')}
                                                    {student.lastSentAt ? ` · last sent ${niceDate(student.lastSentAt)}` : ''}
                                                </small>
                                            </span>
                                        </label>
                                        <BalanceAmount balance={student.balance} currency={roster.currency} />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {(running || progress.done > 0) && (
                        <BulkProgress total={total} {...progress} />
                    )}
                    <p className="sb-card-note">
                        Already-sent statements are held back automatically. Use a single student's email action to
                        deliberately resend one.
                    </p>
                </div>
            )}
        </Modal>
    );
};

const BalanceAmount = ({ balance, currency }) => (
    <span className={`sb-balance sb-balance-${balance > 0 ? 'credit' : balance < 0 ? 'owed' : 'settled'}`}>
        {balance < 0 ? `${money(-balance, currency)} owed` : balance > 0 ? `${money(balance, currency)} credit` : 'Settled'}
    </span>
);

const BulkRemindersModal = ({ candidates, currency = 'USD', onClose, onDone }) => {
    const [language, setLanguage] = useState('en');
    const [progress, setProgress] = useState({ done: 0, sent: 0, failed: 0, held: 0 });
    const [running, setRunning] = useState(false);
    const total = candidates.length;

    const send = async () => {
        setRunning(true);
        const next = { done: 0, sent: 0, failed: 0, held: 0 };
        for (const candidate of candidates) {
            try {
                const response = await api.post(`/finance/billing/students/${candidate.studentId}/reminder`, {
                    recipientEmails: candidate.recipients.map((recipient) => recipient.email),
                    language
                });
                for (const result of response.data?.data || []) {
                    if (result.status === 'sent') next.sent += 1;
                    else if (result.status === 'failed') next.failed += 1;
                    else next.held += 1;
                }
            } catch {
                next.failed += candidate.recipients.length;
            }
            next.done += 1;
            setProgress({ ...next });
        }
        setRunning(false);
        toast.success(`Finished: ${next.sent} delivered, ${next.failed} failed, ${next.held} held.`);
        onDone?.();
    };

    return (
        <Modal
            open
            title="Remind eligible families"
            eyebrow="Payment reminders"
            onClose={running ? undefined : onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose} disabled={running}>Close</button>
                    <button className="btn-primary" onClick={send} disabled={running || !total}>
                        {running ? 'Sending…' : `Send ${total} reminder${total === 1 ? '' : 's'}`}
                    </button>
                </>
            )}
        >
            <div className="sb-form-stack">
                {field('Language',
                    <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={running}>
                        {LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                )}
                <ul className="sb-bulk-list">
                    {candidates.map((candidate) => (
                        <li key={candidate.studentId} className="is-active">
                            <div className="sb-bulk-person">
                                <strong>{candidate.name}</strong>
                                <small>{candidate.recipients.map((recipient) => recipient.email).join(', ')}</small>
                            </div>
                            <strong>{money(candidate.owed, currency)} owed</strong>
                        </li>
                    ))}
                </ul>
                {(running || progress.done > 0) && <BulkProgress total={total} {...progress} />}
                <p className="sb-card-note">
                    Families reminded within the quiet period are excluded. A reminder is skipped automatically if it
                    was already sent today.
                </p>
            </div>
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Printable document                                                  */
/* ------------------------------------------------------------------ */

const PrintModal = ({ request, onClose }) => {
    const iframeRef = useRef(null);
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        const url = request.kind === 'receipt'
            ? `/finance/billing/payments/${request.entryId}/receipt/print`
            : request.kind === 'report'
                ? '/finance/billing/reports/print'
                : request.family
                    ? `/finance/billing/family/statement/${request.studentId}/print`
                    : `/finance/billing/students/${request.studentId}/print`;
        const params = request.kind === 'report'
            ? request.params
            : { language: request.language || 'en' };
        api.get(url, { params, responseType: 'text' })
            .then((response) => {
                if (active) setHtml(typeof response.data === 'string' ? response.data : String(response.data || ''));
            })
            .catch((err) => {
                if (active) setError(err.response?.data?.message || 'Could not build the printable document.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [request]);

    const print = () => {
        const frame = iframeRef.current;
        if (!frame?.contentWindow) {
            toast.error('The document is still loading.');
            return;
        }
        frame.contentWindow.focus();
        frame.contentWindow.print();
    };

    return (
        <Modal
            open
            wide
            title={request.title || 'Printable document'}
            eyebrow="A4 preview"
            onClose={onClose}
            footer={(
                <>
                    <button className="btn-secondary" onClick={onClose}>Close</button>
                    <button className="btn-primary" onClick={print} disabled={loading || !html}>
                        <Icon name="print" size={14} /> Print
                    </button>
                </>
            )}
        >
            {loading ? (
                <div className="sb-print-loading"><Spinner /> Preparing the document…</div>
            ) : error ? (
                <div className="finance-error">{error}</div>
            ) : (
                <iframe
                    ref={iframeRef}
                    title="Printable document"
                    className="sb-print-preview"
                    srcDoc={html}
                />
            )}
        </Modal>
    );
};

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const BillingModals = ({ modal, range, onClose, onDone }) => {
    if (!modal) return null;
    const activeRange = { from: range?.from, to: range?.to };
    switch (modal.type) {
        case 'payment':
            return <PaymentModal preset={modal} onClose={onClose} onDone={onDone} range={activeRange} />;
        case 'refund':
            return <RefundModal preset={modal} onClose={onClose} onDone={onDone} />;
        case 'adjustment':
            return <AdjustmentModal preset={modal} onClose={onClose} onDone={onDone} />;
        case 'sell-package':
            return <SellPackageModal preset={modal} onClose={onClose} onDone={onDone} />;
        case 'statement':
            return (
                <EmailStatementModal
                    studentId={modal.studentId}
                    studentName={modal.name}
                    activeRange={activeRange}
                    onClose={onClose}
                    onDone={onDone}
                    onPrint={(request) => onDone?.(null, request)}
                />
            );
        case 'reminder':
            return (
                <ReminderModal
                    studentId={modal.studentId}
                    studentName={modal.name}
                    onClose={onClose}
                    onDone={onDone}
                />
            );
        case 'receipt':
            return (
                <ReceiptModal
                    payment={modal.payment}
                    onClose={onClose}
                    onDone={onDone}
                    onPrint={(request) => onDone?.(null, request)}
                />
            );
        case 'log-time':
            return <LogTimeModal onClose={onClose} onDone={onDone} />;
        case 'bulk-statements':
            return <BulkStatementsModal activeRange={activeRange} onClose={onClose} onDone={onDone} />;
        case 'bulk-reminders':
            return <BulkRemindersModal candidates={modal.candidates || []} onClose={onClose} onDone={onDone} />;
        case 'print':
            return <PrintModal request={modal} onClose={onClose} />;
        default:
            return null;
    }
};

export default BillingModals;
