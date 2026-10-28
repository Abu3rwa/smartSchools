import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import toast from 'react-hot-toast';
import '../finance/Finance.css';
import './LogLessonTimePage.css';

const todayInput = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const money = (value, currency = 'USD') => {
    const amount = Number(value) || 0;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
};

const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const LogLessonTimePage = () => {
    const [options, setOptions] = useState(null);
    const [entries, setEntries] = useState([]);
    const [currency, setCurrency] = useState('USD');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        occurredAt: todayInput(),
        classId: '',
        studentId: '',
        minutes: '',
        note: ''
    });
    const [saving, setSaving] = useState(false);

    const [voidTarget, setVoidTarget] = useState(null);
    const [voidReason, setVoidReason] = useState('');
    const [voiding, setVoiding] = useState(false);

    const loadEntries = useCallback(async () => {
        try {
            const response = await api.get('/finance/billing/manual/entries');
            setEntries(response.data?.data?.entries || []);
            setCurrency(response.data?.data?.currency || 'USD');
        } catch {
            // Keep the current list; a failed refresh must not look like a failed save.
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [optionsResponse, entriesResponse] = await Promise.all([
                api.get('/finance/billing/manual/options'),
                api.get('/finance/billing/manual/entries')
            ]);
            const nextOptions = optionsResponse.data?.data || null;
            setOptions(nextOptions);
            setCurrency(nextOptions?.currency || 'USD');
            setEntries(entriesResponse.data?.data?.entries || []);
            setForm((prev) => {
                if (prev.classId) return prev;
                const firstClass = nextOptions?.classes?.[0];
                return firstClass ? { ...prev, classId: firstClass.id } : prev;
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load lesson logging.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const classes = useMemo(() => options?.classes || [], [options]);
    const selectedClass = useMemo(
        () => classes.find((klass) => klass.id === form.classId) || null,
        [classes, form.classId]
    );
    const students = selectedClass?.students || [];
    const noRate = Boolean(selectedClass) && !(Number(selectedClass.hourlyRate) > 0);

    const chooseClass = (classId) => {
        setForm((prev) => ({ ...prev, classId, studentId: '' }));
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!form.classId || !form.studentId || !(Number(form.minutes) > 0)) return;
        setSaving(true);
        try {
            const response = await api.post('/finance/billing/manual/entries', {
                classId: form.classId,
                studentId: form.studentId,
                minutes: Number(form.minutes),
                occurredAt: form.occurredAt,
                note: form.note.trim()
            });
            const entry = response.data?.data?.entry;
            toast.success(
                `Logged ${entry?.minutes || form.minutes} minutes · ${money(entry?.amount, entry?.currency || currency)}`
            );
            setForm((prev) => ({ ...prev, studentId: '', minutes: '', note: '' }));
            await loadEntries();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not log this lesson.');
        } finally {
            setSaving(false);
        }
    };

    const confirmVoid = async () => {
        if (!voidTarget) return;
        setVoiding(true);
        try {
            await api.post(`/finance/billing/manual/entries/${voidTarget.id}/void`, { reason: voidReason });
            toast.success('Lesson voided. The balance has been updated.');
            setVoidTarget(null);
            setVoidReason('');
            await loadEntries();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not void this lesson.');
        } finally {
            setVoiding(false);
        }
    };

    return (
        <div className="finance-page log-time-page">
            <div className="finance-header">
                <div>
                    <h1>Log lesson time</h1>
                    <p className="log-time-sub">
                        Add lessons held on Zoom, in person, or anywhere else so each student&apos;s balance stays correct.
                    </p>
                </div>
            </div>

            {error && <div className="finance-error">{error}</div>}

            {loading ? (
                <div className="finance-loading">Loading…</div>
            ) : classes.length === 0 ? (
                <div className="finance-empty">
                    <p>You are not assigned to an active class yet. Ask the school admin to add you to a class.</p>
                </div>
            ) : (
                <div className="log-time-grid">
                    <div className="finance-card">
                        <h2>New lesson</h2>
                        <form className="log-time-form" onSubmit={submit}>
                            <div className="finance-form-row">
                                <div className="finance-form-group">
                                    <label htmlFor="log-time-date">Date</label>
                                    <input
                                        id="log-time-date"
                                        type="date"
                                        value={form.occurredAt}
                                        max={todayInput()}
                                        onChange={(event) => setForm((prev) => ({ ...prev, occurredAt: event.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="finance-form-group">
                                    <label htmlFor="log-time-minutes">Minutes</label>
                                    <input
                                        id="log-time-minutes"
                                        type="number"
                                        min="1"
                                        max="600"
                                        step="1"
                                        value={form.minutes}
                                        onChange={(event) => setForm((prev) => ({ ...prev, minutes: event.target.value }))}
                                        placeholder="60"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="finance-form-group">
                                <label htmlFor="log-time-class">Class</label>
                                <select
                                    id="log-time-class"
                                    value={form.classId}
                                    onChange={(event) => chooseClass(event.target.value)}
                                    required
                                >
                                    {classes.map((klass) => (
                                        <option key={klass.id} value={klass.id}>{klass.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="finance-form-group">
                                <label htmlFor="log-time-student">Student</label>
                                <select
                                    id="log-time-student"
                                    value={form.studentId}
                                    onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
                                    disabled={!students.length}
                                    required
                                >
                                    <option value="">{students.length ? 'Choose a student' : 'No active students in this class'}</option>
                                    {students.map((student) => (
                                        <option key={student.id} value={student.id}>{student.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="finance-form-group">
                                <label htmlFor="log-time-note">Note (optional)</label>
                                <input
                                    id="log-time-note"
                                    value={form.note}
                                    maxLength={500}
                                    onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                                    placeholder="For example: Zoom lesson, extra practice"
                                />
                            </div>

                            {selectedClass && (
                                noRate ? (
                                    <p className="log-time-warning">
                                        No hourly rate is set for {selectedClass.name}. Ask the school admin to add one before logging this lesson.
                                    </p>
                                ) : (
                                    <p className="log-time-hint">
                                        {money(selectedClass.hourlyRate, currency)} per hour.
                                        {' '}Time rounds up to {options.roundingMinutes} minute{options.roundingMinutes === 1 ? '' : 's'},
                                        {' '}with a {options.minimumBillableMinutes}-minute minimum.
                                    </p>
                                )
                            )}

                            <button
                                className="btn-primary"
                                type="submit"
                                disabled={saving || noRate || !form.studentId || !(Number(form.minutes) > 0)}
                            >
                                {saving ? 'Saving…' : 'Log lesson'}
                            </button>
                        </form>
                    </div>

                    <div className="finance-card">
                        <h2>Recent off-platform lessons</h2>
                        {entries.length === 0 ? (
                            <p className="log-time-empty">Nothing logged yet. Lessons you add here will appear in this list.</p>
                        ) : (
                            <div className="log-time-table-wrap">
                                <table className="finance-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Student</th>
                                            <th>Class</th>
                                            <th className="numeric">Minutes</th>
                                            <th className="numeric">Charge</th>
                                            <th>Note</th>
                                            <th aria-label="Actions" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((entry) => (
                                            <tr
                                                key={entry.id}
                                                className={entry.status === 'void' ? 'log-time-voided' : ''}
                                            >
                                                <td>{formatDate(entry.occurredAt)}</td>
                                                <td>{entry.studentName}</td>
                                                <td>{entry.className}</td>
                                                <td className="numeric">{Math.round(entry.minutes)}</td>
                                                <td className="numeric">
                                                    {money(entry.amount, entry.currency)}
                                                    {entry.status === 'void' && (
                                                        <span className="log-time-tag">Voided</span>
                                                    )}
                                                </td>
                                                <td className="log-time-note" title={entry.note || ''}>
                                                    {entry.note || '—'}
                                                    {entry.status === 'void' && entry.voidReason ? (
                                                        <span className="log-time-note-reason">{entry.voidReason}</span>
                                                    ) : null}
                                                </td>
                                                <td className="log-time-actions">
                                                    {entry.canVoid && (
                                                        <button
                                                            className="btn-sm btn-danger"
                                                            onClick={() => {
                                                                setVoidTarget(entry);
                                                                setVoidReason('');
                                                            }}
                                                        >
                                                            Void
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {voidTarget && (
                <div className="finance-modal-overlay" onClick={(event) => {
                    if (event.target === event.currentTarget) setVoidTarget(null);
                }}>
                    <div className="finance-modal">
                        <h2>Void this lesson?</h2>
                        <p className="log-time-modal-note">
                            {voidTarget.studentName} on {formatDate(voidTarget.occurredAt)} stays in the history
                            but no longer counts toward the balance.
                        </p>
                        <div className="finance-form-group">
                            <label>Reason</label>
                            <input
                                value={voidReason}
                                onChange={(event) => setVoidReason(event.target.value)}
                                placeholder="For example: entered the wrong time"
                            />
                        </div>
                        <div className="finance-modal-actions">
                            <button className="btn-secondary" onClick={() => setVoidTarget(null)}>Cancel</button>
                            <button className="btn-danger" onClick={confirmVoid} disabled={voiding || !voidReason.trim()}>
                                {voiding ? 'Voiding…' : 'Void lesson'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogLessonTimePage;
