import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    BalancePill,
    Drawer,
    EmptyState,
    Icon,
    PersonAvatar,
    Skeleton,
    Spinner
} from './ui';
import { money, niceDate, relativeTime } from './utils';

const STATUS_CHIPS = [
    { value: '', label: 'All accounts' },
    { value: 'owed', label: 'Owing' },
    { value: 'credit', label: 'Credit' },
    { value: 'settled', label: 'Settled' },
    { value: 'review', label: 'Needs review' }
];

const kindLabel = (entry) => {
    if (entry.status === 'void') return 'Voided entry';
    if (entry.kind === 'payment') return 'Payment';
    if (entry.kind === 'refund') return 'Refund';
    if (entry.kind === 'adjustment') return entry.direction === 'credit' ? 'Credit adjustment' : 'Debit adjustment';
    return entry.sessionTitle || 'Lesson charge';
};

const signedAmount = (entry, currency) => {
    if (entry.kind === 'payment') return `+ ${money(entry.amount, currency)}`;
    if (entry.kind === 'refund') return `− ${money(entry.amount, currency)}`;
    if (entry.kind === 'adjustment') {
        return `${entry.direction === 'debit' ? '−' : '+'} ${money(entry.amount, currency)}`;
    }
    return `− ${money(entry.amount, currency)}`;
};

const AccountDrawer = ({
    studentId,
    open,
    onClose,
    onRecordPayment,
    onEmailStatement,
    onPrintStatement,
    onSellPackage,
    onOpenLessons,
    refreshKey
}) => {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pane, setPane] = useState('ledger');
    const [note, setNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const load = useCallback(async () => {
        if (!studentId) return;
        setLoading(true);
        setError('');
        try {
            const response = await api.get(`/finance/billing/students/${studentId}`);
            setAccount(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load this account.');
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    useEffect(() => {
        if (open) {
            setPane('ledger');
            setNote('');
            load();
        }
    }, [open, load, refreshKey]);

    const saveNote = async () => {
        if (!note.trim()) return;
        setSavingNote(true);
        try {
            await api.post(`/finance/billing/students/${studentId}/notes`, { body: note });
            setNote('');
            toast.success('Note added.');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not add the note.');
        } finally {
            setSavingNote(false);
        }
    };

    const deleteNote = async (noteId) => {
        try {
            await api.delete(`/finance/billing/students/${studentId}/notes/${noteId}`);
            toast.success('Note removed.');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the note.');
        }
    };

    const currency = account?.currency || 'USD';
    const balance = account?.totals?.balance || 0;

    return (
        <Drawer
            open={open}
            title={account?.student?.name || 'Student account'}
            subtitle={account?.profile?.classes?.map((klass) => klass.name).join(' · ') || 'Student account'}
            onClose={onClose}
            width="640px"
            footer={account ? (
                <div className="sb-drawer-actions">
                    <button className="btn-secondary" onClick={() => onPrintStatement(account.student.id)}>
                        <Icon name="print" size={15} /> Print
                    </button>
                    <button className="btn-secondary" onClick={() => onEmailStatement({ studentId: account.student.id, name: account.student.name })}>
                        <Icon name="mail" size={15} /> Email statement
                    </button>
                    <button className="btn-secondary" onClick={() => onSellPackage(account.student.id)}>
                        <Icon name="plus" size={15} /> Sell package
                    </button>
                    <button className="btn-primary" onClick={() => onRecordPayment(account.student.id)}>
                        <Icon name="money" size={15} /> Record payment
                    </button>
                </div>
            ) : null}
        >
            {loading && !account ? <Skeleton rows={6} /> : error ? <div className="finance-error">{error}</div> : account && (
                <div className="sb-account">
                    <section className="sb-account-hero">
                        <div className="sb-account-who">
                            <PersonAvatar name={account.student.name} size={46} />
                            <div>
                                <span className="sb-eyebrow">Current balance</span>
                                <strong className={balance < 0 ? 'negative' : balance > 0 ? 'positive' : ''}>
                                    {balance < 0 ? `${money(-balance, currency)} owed` : balance > 0 ? `${money(balance, currency)} credit` : 'Settled'}
                                </strong>
                                <small>{Math.floor(account.totals.minutesRemaining || 0)} min remaining · {account.totals.sessions} lesson{account.totals.sessions === 1 ? '' : 's'} recorded</small>
                            </div>
                        </div>
                        <div className="sb-account-mini">
                            <span><em>{money(account.totals.charged, currency)}</em>Charged</span>
                            <span><em>{money(account.totals.paid, currency)}</em>Paid</span>
                            <span><em>{money(account.rate.hourlyRate, currency)}</em>Rate/hr</span>
                        </div>
                    </section>

                    <section className="sb-account-grid">
                        <div className="sb-account-panel">
                            <h3>Family contacts</h3>
                            {account.profile.contacts.length === 0 ? (
                                <p className="sb-muted">No email address is on file for this family.</p>
                            ) : (
                                <ul className="sb-contact-list">
                                    {account.profile.contacts.map((contact) => (
                                        <li key={contact.email}>
                                            <span className={`sb-contact-dot ${contact.optedOut ? 'is-off' : ''}`} />
                                            <div>
                                                <strong>{contact.name || contact.email}</strong>
                                                <small>{contact.email} · {contact.type}</small>
                                            </div>
                                            {contact.optedOut && <Badge tone="warning">Email off</Badge>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="sb-account-panel">
                            <h3>Rate and rules</h3>
                            <dl className="sb-facts">
                                <div><dt>Rate</dt><dd>{money(account.rate.hourlyRate, currency)}/hr</dd></div>
                                <div><dt>Source</dt><dd>{account.rate.source === 'student' ? 'Student override' : account.rate.source === 'class' ? 'Class rate' : 'School default'}</dd></div>
                                <div><dt>Rounding</dt><dd>Up to {account.rules.roundingMinutes} min</dd></div>
                                <div><dt>Minimum</dt><dd>{account.rules.minimumBillableMinutes} min</dd></div>
                                <div><dt>No-show</dt><dd>{account.rules.noShowMinutes} min</dd></div>
                                <div><dt>Late cancel</dt><dd>{account.rules.lateCancellationMinutes} min</dd></div>
                                <div><dt>Grace</dt><dd>{account.rules.graceMinutes} min</dd></div>
                                <div><dt>Billing</dt><dd>{account.rules.billingBasis === 'session' ? 'Whole session' : 'Per student'}</dd></div>
                            </dl>
                        </div>
                    </section>

                    {account.package && (
                        <section className="sb-package-strip">
                            <span className="sb-package-icon"><Icon name="check" size={18} /></span>
                            <div>
                                <strong>{account.package.name}</strong>
                                <small>{Math.floor(account.package.minutesRemaining)} of {account.package.minutesIncluded} min left · {money(account.package.effectiveHourlyRate, currency)}/hr effective</small>
                            </div>
                            <Badge tone="good">{account.package.expiresAt ? `Expires ${niceDate(account.package.expiresAt)}` : 'No expiry'}</Badge>
                        </section>
                    )}

                    <nav className="sb-segmented">
                        {[
                            ['ledger', `Ledger (${account.entries.length})`],
                            ['notes', `Notes (${account.notes.length})`],
                            ['packages', `Packages (${account.packages.length})`],
                            ['statements', `Statements (${account.statements.length})`]
                        ].map(([value, label]) => (
                            <button key={value} className={pane === value ? 'is-active' : ''} onClick={() => setPane(value)}>
                                {label}
                            </button>
                        ))}
                    </nav>

                    {pane === 'ledger' && (
                        account.entries.length === 0 ? (
                            <EmptyState title="No ledger entries" body="Charged lessons and payments will appear here in order." />
                        ) : (
                            <div className="sb-ledger">
                                {[...account.entries].reverse().map((entry) => (
                                    <div key={entry.id} className={`sb-ledger-row ${entry.status === 'void' ? 'is-void' : ''}`}>
                                        <span className={`sb-ledger-icon sb-kind-${entry.kind}`}>
                                            <Icon name={entry.kind === 'payment' ? 'money' : entry.kind === 'adjustment' || entry.kind === 'refund' ? 'refresh' : 'lessons'} size={15} />
                                        </span>
                                        <div className="sb-ledger-main">
                                            <strong>{kindLabel(entry)}</strong>
                                            <small>
                                                {niceDate(entry.occurredAt)}
                                                {entry.minutes ? ` · ${Math.round(entry.minutes)} min` : ''}
                                                {entry.hourlyRate ? ` · ${money(entry.hourlyRate, currency)}/hr` : ''}
                                                {entry.createdByName ? ` · ${entry.createdByName}` : ''}
                                            </small>
                                        </div>
                                        <div className="sb-ledger-money">
                                            <em>{signedAmount(entry, currency)}</em>
                                            <small>{money(entry.balanceAfter, currency)}</small>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {pane === 'notes' && (
                        <div className="sb-notes">
                            <div className="sb-note-compose">
                                <textarea
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder="Add a note about this account. Staff only."
                                    rows={3}
                                    maxLength={1000}
                                />
                                <button className="btn-primary btn-sm" onClick={saveNote} disabled={savingNote || !note.trim()}>
                                    {savingNote ? 'Saving…' : 'Add note'}
                                </button>
                            </div>
                            {account.notes.length === 0 ? (
                                <EmptyState title="No notes yet" body="Use notes for payment arrangements or anything the next staff member should know." />
                            ) : (
                                <ul className="sb-note-list">
                                    {account.notes.map((row) => (
                                        <li key={row.id}>
                                            <p>{row.body}</p>
                                            <small>{row.createdByName || 'Staff'} · {relativeTime(row.createdAt)}</small>
                                            <button className="sb-icon-btn" onClick={() => deleteNote(row.id)} aria-label="Delete note">
                                                <Icon name="close" size={14} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {pane === 'packages' && (
                        account.packages.length === 0 ? (
                            <EmptyState title="No packages" body="Prepaid lesson packages will appear here with the minutes left." />
                        ) : (
                            <ul className="sb-package-list">
                                {account.packages.map((pkg) => (
                                    <li key={pkg.id}>
                                        <div>
                                            <strong>{pkg.name}</strong>
                                            <small>{niceDate(pkg.purchasedAt)}{pkg.expiresAt ? ` · expires ${niceDate(pkg.expiresAt)}` : ''}</small>
                                        </div>
                                        <span>{Math.floor(pkg.minutesRemaining)} / {pkg.minutesIncluded} min</span>
                                        <Badge tone={pkg.status === 'active' ? 'good' : 'neutral'}>{pkg.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}

                    {pane === 'statements' && (
                        account.statements.length === 0 ? (
                            <EmptyState title="No statements sent" body="Email a statement to see the delivery history here." />
                        ) : (
                            <ul className="sb-statement-list">
                                {account.statements.map((row) => (
                                    <li key={row.id}>
                                        <Icon name="mail" size={15} />
                                        <div>
                                            <strong>{row.recipientEmail}</strong>
                                            <small>{row.recipientType} · {row.language} · {niceDate(row.sentAt, true)}</small>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}

                    <div className="sb-drawer-links">
                        <button className="sb-link" onClick={() => onOpenLessons(account.student.id)}>
                            See all recorded lessons <Icon name="chevron" size={13} />
                        </button>
                        <span>Last statement: {account.lastStatementAt ? niceDate(account.lastStatementAt) : 'never'}</span>
                    </div>
                </div>
            )}
        </Drawer>
    );
};

const StudentsTab = ({
    range,
    filters,
    refreshKey,
    onRecordPayment,
    onEmailStatement,
    onPrintStatement,
    onSellPackage,
    onOpenLessons,
    openStudentId,
    onOpenStudent,
    onCloseStudent
}) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState(filters.status || '');

    const params = useMemo(() => ({ ...range, ...filters, status }), [range, filters, status]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/students', { params });
            setData(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load student accounts.');
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const currency = data?.currency || data?.settings?.currency || 'USD';
    const students = data?.students || [];

    return (
        <div className="sb-tab">
            <div className="sb-toolbar">
                <div className="sb-chip-row">
                    {STATUS_CHIPS.map((chip) => (
                        <button
                            key={chip.value}
                            className={`sb-chip ${status === chip.value ? 'is-active' : ''}`}
                            onClick={() => setStatus(chip.value)}
                        >
                            {chip.label}
                            {chip.value === 'owed' && data ? <b>{data.balanceStatus.owed.count}</b> : null}
                            {chip.value === 'credit' && data ? <b>{data.balanceStatus.credit.count}</b> : null}
                            {chip.value === 'review' && data ? <b>{students.filter((row) => row.needsReview).length}</b> : null}
                        </button>
                    ))}
                </div>
                <div className="sb-toolbar-meta">
                    {data && (
                        <>
                            <span>{students.length} account{students.length === 1 ? '' : 's'}</span>
                            <span className="sb-divider" />
                            <span>{money(students.reduce((sum, row) => sum + (row.balance < 0 ? -row.balance : 0), 0), currency)} owed</span>
                        </>
                    )}
                </div>
            </div>

            {error && <div className="finance-error">{error}</div>}

            <section className="sb-card sb-table-card">
                {loading ? <Skeleton rows={8} /> : students.length === 0 ? (
                    <EmptyState icon="students" title="No accounts match" body="Try another status or clear the filters in the header." />
                ) : (
                    <div className="sb-table-wrap">
                        <table className="sb-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Class</th>
                                    <th className="num">Lessons</th>
                                    <th className="num">Minutes</th>
                                    <th className="num">Charged</th>
                                    <th className="num">Paid</th>
                                    <th>Balance</th>
                                    <th>Contact</th>
                                    <th aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student) => (
                                    <tr key={student.studentId} className={student.needsReview ? 'has-review' : ''}>
                                        <td>
                                            <button className="sb-person-cell" onClick={() => onOpenStudent(student.studentId)}>
                                                <PersonAvatar name={student.name} />
                                                <span>
                                                    <strong>{student.name}</strong>
                                                    <small>{student.lastAt ? `Active ${relativeTime(student.lastAt)}` : 'No activity'}</small>
                                                </span>
                                            </button>
                                        </td>
                                        <td className="sb-muted">{student.classes.join(' · ') || '—'}</td>
                                        <td className="num">{student.rangeSessions}</td>
                                        <td className="num">{Math.round(student.rangeMinutes)}</td>
                                        <td className="num">{money(student.rangeCharged, currency)}</td>
                                        <td className="num positive">{money(student.rangePaid, currency)}</td>
                                        <td><BalancePill balance={student.balance} currency={currency} /></td>
                                        <td>
                                            {student.hasContact ? (
                                                <Badge tone="good">{student.availableContactCount} email{student.availableContactCount === 1 ? '' : 's'}</Badge>
                                            ) : (
                                                <Badge tone="warning">No contact</Badge>
                                            )}
                                        </td>
                                        <td className="sb-row-actions">
                                            <button className="sb-icon-btn" onClick={() => onOpenStudent(student.studentId)} aria-label="Open account">
                                                <Icon name="eye" size={16} />
                                            </button>
                                            <button className="sb-icon-btn" onClick={() => onRecordPayment(student.studentId)} aria-label="Record payment">
                                                <Icon name="money" size={16} />
                                            </button>
                                            <button className="sb-icon-btn" onClick={() => onEmailStatement({ studentId: student.studentId, name: student.name })} aria-label="Email statement">
                                                <Icon name="mail" size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <AccountDrawer
                studentId={openStudentId}
                open={Boolean(openStudentId)}
                onClose={onCloseStudent}
                refreshKey={refreshKey}
                onRecordPayment={onRecordPayment}
                onEmailStatement={onEmailStatement}
                onPrintStatement={onPrintStatement}
                onSellPackage={onSellPackage}
                onOpenLessons={onOpenLessons}
            />
        </div>
    );
};

export default StudentsTab;
