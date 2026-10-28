import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    EmptyState,
    Icon,
    Modal,
    Skeleton,
    Spinner,
    Toggle
} from './ui';
import { field, money, niceDate, relativeTime } from './utils';

const ROUNDING_OPTIONS = [1, 5, 10, 15];
const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank-transfer', label: 'Bank transfer' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'online', label: 'Online' },
    { value: 'other', label: 'Other' }
];
const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'Arabic' },
    { value: 'both', label: 'English and Arabic' }
];
const SECTIONS = [
    { key: 'rates', label: 'Rates', icon: 'money', hint: 'Default, class and student rates' },
    { key: 'rules', label: 'Time rules', icon: 'lessons', hint: 'Rounding, minimums and no-shows' },
    { key: 'packages', label: 'Packages', icon: 'check', hint: 'Prepaid lesson bundles' },
    { key: 'payments', label: 'Payments', icon: 'payments', hint: 'Accepted methods' },
    { key: 'messages', label: 'Statements', icon: 'mail', hint: 'Family email and reminders' },
    { key: 'audit', label: 'Audit trail', icon: 'overview', hint: 'Every money change' }
];

const blankRate = (kind) => ({
    classId: '',
    studentId: '',
    hourlyRate: 0,
    effectiveFrom: '',
    effectiveTo: '',
    reason: kind === 'student' ? '' : ''
});

const dateInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toRateRow = (row) => ({
    classId: row.classId ? String(row.classId) : '',
    studentId: row.studentId ? String(row.studentId) : '',
    hourlyRate: row.hourlyRate,
    effectiveFrom: dateInput(row.effectiveFrom),
    effectiveTo: dateInput(row.effectiveTo),
    reason: row.reason || ''
});

const actionLabel = (action) => {
    const labels = {
        'settings.updated': 'Settings updated',
        'payment.recorded': 'Payment recorded',
        'refund.recorded': 'Refund issued',
        'adjustment.recorded': 'Adjustment made',
        'charge.voided': 'Charge voided',
        'payment.voided': 'Payment voided',
        'refund.voided': 'Refund voided',
        'adjustment.voided': 'Adjustment voided',
        'package.created': 'Package created',
        'package.updated': 'Package updated',
        'package.archived': 'Package archived',
        'package.sold': 'Package sold',
        'package.cancelled': 'Package cancelled',
        'issue.resolved': 'Issue resolved',
        'issue.ignored': 'Issue ignored'
    };
    return labels[action] || action.replace(/\./g, ' ');
};

const SettingsTab = ({ range, filters, refreshKey, initialSection = 'rates', onMutated }) => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [section, setSection] = useState(initialSection);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [rateEditor, setRateEditor] = useState(null);
    const [packageEditor, setPackageEditor] = useState(null);
    const [packages, setPackages] = useState(null);
    const [audit, setAudit] = useState(null);
    const [auditLoading, setAuditLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/settings');
            setSettings(response.data?.data?.settings || null);
            setDirty(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load billing settings.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadPackages = useCallback(async () => {
        try {
            const response = await api.get('/finance/billing/packages');
            setPackages(response.data?.data || null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not load packages.');
        }
    }, []);

    const loadAudit = useCallback(async () => {
        setAuditLoading(true);
        try {
            const response = await api.get('/finance/billing/audit', { params: { ...range, ...filters } });
            setAudit(response.data?.data || null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not load the audit trail.');
        } finally {
            setAuditLoading(false);
        }
    }, [range, filters]);

    useEffect(() => { load(); }, [load, refreshKey]);
    useEffect(() => { loadPackages(); }, [loadPackages, refreshKey]);

    useEffect(() => {
        let active = true;
        Promise.all([
            api.get('/classes', { params: { limit: 'all' } }),
            api.get('/students', { params: { limit: 'all', status: 'active' } })
        ])
            .then(([classResponse, studentResponse]) => {
                if (!active) return;
                setClasses(classResponse.data?.data?.classes || []);
                setStudents(studentResponse.data?.data?.students || []);
            })
            .catch(() => {
                if (!active) return;
                setClasses([]);
                setStudents([]);
            });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (section === 'audit') loadAudit();
    }, [section, loadAudit, refreshKey]);

    const currency = settings?.currency || 'USD';
    const classOptions = useMemo(() => classes
        .map((klass) => ({ id: String(klass._id), name: klass.name }))
        .sort((a, b) => a.name.localeCompare(b.name)), [classes]);
    const studentOptions = useMemo(() => students
        .map((student) => ({
            id: String(student._id),
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim()
        }))
        .sort((a, b) => a.name.localeCompare(b.name)), [students]);
    const classNameById = useMemo(() => new Map(classOptions.map((option) => [option.id, option.name])), [classOptions]);
    const studentNameById = useMemo(() => new Map(studentOptions.map((option) => [option.id, option.name])), [studentOptions]);

    const patch = (updater) => {
        setSettings((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            const payload = {
                ...settings,
                classRates: settings.classRates.map((row) => ({
                    ...row,
                    effectiveFrom: row.effectiveFrom || null,
                    effectiveTo: row.effectiveTo || null
                })),
                studentRates: settings.studentRates.map((row) => ({
                    ...row,
                    effectiveFrom: row.effectiveFrom || null,
                    effectiveTo: row.effectiveTo || null
                }))
            };
            const response = await api.put('/finance/billing/settings', payload);
            setSettings(response.data?.data?.settings || settings);
            setDirty(false);
            toast.success('Billing settings saved.');
            onMutated?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save billing settings.');
        } finally {
            setSaving(false);
        }
    };

    const saveRate = () => {
        if (!rateEditor) return;
        const { kind, index, row } = rateEditor;
        if (kind === 'class' && !row.classId) { toast.error('Choose a class.'); return; }
        if (kind === 'student' && !row.studentId) { toast.error('Choose a student.'); return; }
        if (Number(row.hourlyRate) < 0) { toast.error('The rate cannot be negative.'); return; }
        if (row.effectiveFrom && row.effectiveTo && row.effectiveTo < row.effectiveFrom) {
            toast.error('The end date must be after the start date.');
            return;
        }
        patch((prev) => {
            const key = kind === 'class' ? 'classRates' : 'studentRates';
            const rows = [...prev[key]];
            if (index === null) rows.push(row);
            else rows[index] = row;
            return { ...prev, [key]: rows };
        });
        setRateEditor(null);
    };

    const savePackage = async () => {
        if (!packageEditor) return;
        const payload = packageEditor;
        const isEdit = Boolean(payload.id);
        try {
            await api[isEdit ? 'put' : 'post'](
                isEdit ? `/finance/billing/packages/${payload.id}` : '/finance/billing/packages',
                payload
            );
            toast.success(isEdit ? 'Package updated.' : 'Package created.');
            setPackageEditor(null);
            loadPackages();
            onMutated?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the package.');
        }
    };

    const archivePackage = async (pkg) => {
        try {
            await api.delete(`/finance/billing/packages/${pkg.id}`);
            toast.success(`${pkg.name} archived.`);
            loadPackages();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not archive the package.');
        }
    };

    const toggleMethod = (method) => {
        patch((prev) => {
            const enabled = new Set(prev.enabledPaymentMethods);
            if (enabled.has(method)) enabled.delete(method);
            else enabled.add(method);
            return { ...prev, enabledPaymentMethods: [...enabled] };
        });
    };

    if (loading || !settings) {
        return <div className="sb-tab"><Skeleton rows={10} /></div>;
    }
    if (error) return <div className="finance-error">{error}</div>;

    return (
        <div className="sb-tab sb-settings">
            <div className="sb-settings-layout">
                <aside className="sb-settings-rail">
                    {SECTIONS.map((item) => (
                        <button
                            key={item.key}
                            className={`sb-settings-link ${section === item.key ? 'is-active' : ''}`}
                            onClick={() => setSection(item.key)}
                        >
                            <span><Icon name={item.icon} size={16} /></span>
                            <div>
                                <strong>{item.label}</strong>
                                <small>{item.hint}</small>
                            </div>
                        </button>
                    ))}
                    <div className="sb-settings-currency">
                        <span className="sb-eyebrow">Currency</span>
                        <strong>{currency}</strong>
                        <small>Three-letter ISO code</small>
                    </div>
                </aside>

                <div className="sb-settings-main">
                    <header className="sb-settings-bar">
                        <div>
                            <span className="sb-eyebrow">Session billing</span>
                            <h2>{SECTIONS.find((item) => item.key === section)?.label}</h2>
                        </div>
                        <div className="sb-settings-actions">
                            {dirty && <Badge tone="warning" dot>Unsaved changes</Badge>}
                            <button className="btn-secondary btn-sm" onClick={load} disabled={saving}>
                                <Icon name="refresh" size={14} /> Reload
                            </button>
                            <button className="btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
                                {saving && <Spinner />} {saving ? 'Saving…' : 'Save settings'}
                            </button>
                        </div>
                    </header>

                    {section === 'rates' && (
                        <div className="sb-settings-stack">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Default rate</span>
                                        <h3>What a lesson hour costs</h3>
                                    </div>
                                </header>
                                <div className="sb-form-grid">
                                    {field('Currency',
                                        <input
                                            value={settings.currency}
                                            maxLength={3}
                                            onChange={(event) => patch({ currency: event.target.value.toUpperCase() })}
                                        />,
                                        'Currency cannot change after entries exist.'
                                    )}
                                    {field('Default hourly rate',
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={settings.defaultHourlyRate}
                                            onChange={(event) => patch({ defaultHourlyRate: event.target.value })}
                                        />,
                                        `${money(settings.defaultHourlyRate, currency)} per hour`
                                    )}
                                </div>
                                <p className="sb-card-note">
                                    A student override wins over a class rate, and a class rate wins over the default.
                                    Changes apply to new lessons; recorded charges keep their original rate.
                                </p>
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Class rates</span>
                                        <h3>Rates by class</h3>
                                    </div>
                                    <button
                                        className="btn-secondary btn-sm"
                                        onClick={() => setRateEditor({ kind: 'class', index: null, row: blankRate('class') })}
                                    >
                                        <Icon name="plus" size={14} /> Add class rate
                                    </button>
                                </header>
                                {settings.classRates.length === 0 ? (
                                    <EmptyState title="Every class uses the default rate" body="Add a class rate when a subject or grade is priced differently." />
                                ) : (
                                    <div className="sb-rate-list">
                                        {settings.classRates.map((row, index) => (
                                            <div key={`${row.classId}-${index}`} className="sb-rate-row">
                                                <div className="sb-rate-main">
                                                    <strong>{classNameById.get(row.classId) || 'Unknown class'}</strong>
                                                    <small>
                                                        {row.effectiveFrom || row.effectiveTo
                                                            ? `${row.effectiveFrom ? niceDate(row.effectiveFrom) : 'Always'} → ${row.effectiveTo ? niceDate(row.effectiveTo) : 'No end'}`
                                                            : 'Applies now'}
                                                        {row.reason ? ` · ${row.reason}` : ''}
                                                    </small>
                                                </div>
                                                <strong className="sb-rate-value">{money(row.hourlyRate, currency)}/hr</strong>
                                                <div className="sb-rate-actions">
                                                    <button className="sb-icon-btn" onClick={() => setRateEditor({ kind: 'class', index, row: toRateRow(row) })} aria-label="Edit rate">
                                                        <Icon name="settings" size={15} />
                                                    </button>
                                                    <button
                                                        className="sb-icon-btn"
                                                        onClick={() => patch((prev) => ({
                                                            ...prev,
                                                            classRates: prev.classRates.filter((_, rowIndex) => rowIndex !== index)
                                                        }))}
                                                        aria-label="Remove rate"
                                                    >
                                                        <Icon name="close" size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Student overrides</span>
                                        <h3>Rates for one student</h3>
                                    </div>
                                    <button
                                        className="btn-secondary btn-sm"
                                        onClick={() => setRateEditor({ kind: 'student', index: null, row: blankRate('student') })}
                                    >
                                        <Icon name="plus" size={14} /> Add student rate
                                    </button>
                                </header>
                                {settings.studentRates.length === 0 ? (
                                    <EmptyState title="No student overrides" body="Use an override for a scholarship, sibling discount, or an agreed private rate." />
                                ) : (
                                    <div className="sb-rate-list">
                                        {settings.studentRates.map((row, index) => (
                                            <div key={`${row.studentId}-${index}`} className="sb-rate-row">
                                                <div className="sb-rate-main">
                                                    <strong>{studentNameById.get(row.studentId) || 'Unknown student'}</strong>
                                                    <small>
                                                        {row.effectiveFrom || row.effectiveTo
                                                            ? `${row.effectiveFrom ? niceDate(row.effectiveFrom) : 'Always'} → ${row.effectiveTo ? niceDate(row.effectiveTo) : 'No end'}`
                                                            : 'Applies now'}
                                                        {row.reason ? ` · ${row.reason}` : ''}
                                                    </small>
                                                </div>
                                                <strong className="sb-rate-value">{money(row.hourlyRate, currency)}/hr</strong>
                                                <div className="sb-rate-actions">
                                                    <button className="sb-icon-btn" onClick={() => setRateEditor({ kind: 'student', index, row: toRateRow(row) })} aria-label="Edit rate">
                                                        <Icon name="settings" size={15} />
                                                    </button>
                                                    <button
                                                        className="sb-icon-btn"
                                                        onClick={() => patch((prev) => ({
                                                            ...prev,
                                                            studentRates: prev.studentRates.filter((_, rowIndex) => rowIndex !== index)
                                                        }))}
                                                        aria-label="Remove rate"
                                                    >
                                                        <Icon name="close" size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}

                    {section === 'rules' && (
                        <div className="sb-settings-stack">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Lesson time</span>
                                        <h3>How minutes become money</h3>
                                    </div>
                                </header>
                                <div className="sb-form-grid">
                                    {field('Round time up to',
                                        <select
                                            value={settings.roundingMinutes}
                                            onChange={(event) => patch({ roundingMinutes: Number(event.target.value) })}
                                        >
                                            {ROUNDING_OPTIONS.map((minutes) => (
                                                <option key={minutes} value={minutes}>{minutes} minute{minutes === 1 ? '' : 's'}</option>
                                            ))}
                                        </select>
                                    )}
                                    {field('Minimum billable minutes',
                                        <input
                                            type="number" min="0" max="600"
                                            value={settings.minimumBillableMinutes}
                                            onChange={(event) => patch({ minimumBillableMinutes: event.target.value })}
                                        />,
                                        'A short lesson still bills at least this long.'
                                    )}
                                    {field('Grace minutes',
                                        <input
                                            type="number" min="0" max="60"
                                            value={settings.graceMinutes}
                                            onChange={(event) => patch({ graceMinutes: event.target.value })}
                                        />,
                                        'Late joiners are not billed for this opening window.'
                                    )}
                                </div>
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Missed lessons</span>
                                        <h3>No-show and cancellation</h3>
                                    </div>
                                </header>
                                <div className="sb-form-grid">
                                    {field('No-show charge (minutes)',
                                        <input
                                            type="number" min="0" max="600"
                                            value={settings.noShowMinutes}
                                            onChange={(event) => patch({ noShowMinutes: event.target.value })}
                                        />,
                                        'Minutes billed when a student never joins.'
                                    )}
                                    {field('Late cancellation (minutes)',
                                        <input
                                            type="number" min="0" max="600"
                                            value={settings.lateCancellationMinutes}
                                            onChange={(event) => patch({ lateCancellationMinutes: event.target.value })}
                                        />,
                                        'Minutes billed when a family cancels too late.'
                                    )}
                                </div>
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Basis</span>
                                        <h3>Individual or whole session</h3>
                                    </div>
                                </header>
                                <div className="sb-segmented sb-segmented-lg">
                                    <button
                                        className={settings.billingBasis === 'individual' ? 'is-active' : ''}
                                        onClick={() => patch({ billingBasis: 'individual' })}
                                    >
                                        Per student attendance
                                    </button>
                                    <button
                                        className={settings.billingBasis === 'session' ? 'is-active' : ''}
                                        onClick={() => patch({ billingBasis: 'session' })}
                                    >
                                        Whole session
                                    </button>
                                </div>
                                <p className="sb-card-note">
                                    Per student bills only the time each student was present. Whole session bills every enrolled
                                    student for the full reserved time.
                                </p>
                                <div className="sb-toggle-stack">
                                    <Toggle
                                        label="Do not bill paused time"
                                        hint="Time spent in a paused live lesson is excluded from every charge."
                                        checked={settings.excludePauseTime !== false}
                                        onChange={(value) => patch({ excludePauseTime: value })}
                                    />
                                    <Toggle
                                        label="Allow prepaid packages"
                                        hint="Families can buy minutes in advance and draw them down at the package rate."
                                        checked={settings.packagesEnabled !== false}
                                        onChange={(value) => patch({ packagesEnabled: value })}
                                    />
                                </div>
                            </section>
                        </div>
                    )}

                    {section === 'packages' && (
                        <div className="sb-settings-stack">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Prepaid</span>
                                        <h3>Lesson packages</h3>
                                    </div>
                                    <button className="btn-secondary btn-sm" onClick={() => setPackageEditor({
                                        id: '',
                                        name: '',
                                        description: '',
                                        minutes: 600,
                                        price: 0,
                                        expiryDays: 90,
                                        eligibleClasses: [],
                                        carryOver: false,
                                        refundable: false,
                                        active: true
                                    })}>
                                        <Icon name="plus" size={14} /> New package
                                    </button>
                                </header>
                                <p className="sb-card-note">
                                    A package rate is the package price divided by its included minutes. Covered minutes are
                                    used before the normal class or student rate.
                                </p>
                                {!packages ? <Skeleton rows={4} /> : packages.packages.length === 0 ? (
                                    <EmptyState icon="check" title="No packages yet" body="Create a bundle like 10 hours for 400 to sell prepaid lesson time." />
                                ) : (
                                    <div className="sb-package-grid">
                                        {packages.packages.map((pkg) => (
                                            <article key={pkg.id} className={`sb-package-card ${pkg.active ? '' : 'is-archived'}`}>
                                                <header>
                                                    <div>
                                                        <strong>{pkg.name}</strong>
                                                        <small>{pkg.description || 'Prepaid lesson minutes'}</small>
                                                    </div>
                                                    <Badge tone={pkg.active ? 'good' : 'neutral'}>{pkg.active ? 'Active' : 'Archived'}</Badge>
                                                </header>
                                                <div className="sb-package-metrics">
                                                    <div><span>Price</span><strong>{money(pkg.price, currency)}</strong></div>
                                                    <div><span>Minutes</span><strong>{pkg.minutes}</strong></div>
                                                    <div><span>Effective rate</span><strong>{money(pkg.effectiveHourlyRate, currency)}/hr</strong></div>
                                                    <div><span>Sold</span><strong>{pkg.sold}</strong></div>
                                                </div>
                                                <footer>
                                                    <button className="btn-secondary btn-sm" onClick={() => setPackageEditor({
                                                        id: pkg.id,
                                                        name: pkg.name,
                                                        description: pkg.description,
                                                        minutes: pkg.minutes,
                                                        price: pkg.price,
                                                        expiryDays: pkg.expiryDays,
                                                        eligibleClasses: pkg.eligibleClasses,
                                                        carryOver: pkg.carryOver,
                                                        refundable: pkg.refundable,
                                                        active: pkg.active
                                                    })}>
                                                        Edit
                                                    </button>
                                                    {pkg.active && (
                                                        <button className="btn-secondary btn-sm" onClick={() => archivePackage(pkg)}>Archive</button>
                                                    )}
                                                </footer>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Sold</span>
                                        <h3>Package purchases</h3>
                                    </div>
                                </header>
                                <PackagePurchases refreshKey={refreshKey} currency={currency} />
                            </section>
                        </div>
                    )}

                    {section === 'payments' && (
                        <div className="sb-settings-stack">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Money in</span>
                                        <h3>Accepted payment methods</h3>
                                    </div>
                                </header>
                                <div className="sb-method-choices">
                                    {PAYMENT_METHODS.map((method) => {
                                        const enabled = settings.enabledPaymentMethods.includes(method.value);
                                        return (
                                            <button
                                                key={method.value}
                                                className={`sb-method-choice ${enabled ? 'is-on' : ''}`}
                                                onClick={() => toggleMethod(method.value)}
                                                aria-pressed={enabled}
                                            >
                                                <span className="sb-method-check"><Icon name="check" size={14} /></span>
                                                {method.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="sb-card-note">
                                    Turn off methods the school does not accept. Existing payments keep their original method.
                                </p>
                            </section>
                        </div>
                    )}

                    {section === 'messages' && (
                        <div className="sb-settings-stack">
                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Family email</span>
                                        <h3>Statements and receipts</h3>
                                    </div>
                                </header>
                                <div className="sb-form-grid">
                                    {field('Default language',
                                        <select
                                            value={settings.statement.defaultLanguage}
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                statement: { ...prev.statement, defaultLanguage: event.target.value }
                                            }))}
                                        >
                                            {LANGUAGES.map((language) => (
                                                <option key={language.value} value={language.value}>{language.label}</option>
                                            ))}
                                        </select>
                                    )}
                                    {field('Email subject',
                                        <input
                                            value={settings.statement.emailSubject}
                                            maxLength={160}
                                            placeholder="Leave blank for the default subject"
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                statement: { ...prev.statement, emailSubject: event.target.value }
                                            }))}
                                        />,
                                        'Use {student} where the student name should appear.'
                                    )}
                                    {field('Payment instructions',
                                        <textarea
                                            rows={4}
                                            maxLength={800}
                                            value={settings.statement.paymentInstructions}
                                            placeholder="Bank name, IBAN, or how a family should pay."
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                statement: { ...prev.statement, paymentInstructions: event.target.value }
                                            }))}
                                        />,
                                        'Printed on statements, receipts and reminders.'
                                    )}
                                </div>
                                <div className="sb-toggle-stack">
                                    <Toggle
                                        label="Include the school contact"
                                        hint="Shows the school phone and email in family emails."
                                        checked={settings.statement.includeContact !== false}
                                        onChange={(value) => patch((prev) => ({
                                            ...prev,
                                            statement: { ...prev.statement, includeContact: value }
                                        }))}
                                    />
                                    <Toggle
                                        label="Copy the office on failed deliveries"
                                        hint="The school admin email receives a notice when a statement cannot be delivered."
                                        checked={settings.statement.ccAdminOnFailure !== false}
                                        onChange={(value) => patch((prev) => ({
                                            ...prev,
                                            statement: { ...prev.statement, ccAdminOnFailure: value }
                                        }))}
                                    />
                                </div>
                            </section>

                            <section className="sb-card">
                                <header className="sb-card-head">
                                    <div>
                                        <span className="sb-eyebrow">Reminders</span>
                                        <h3>When to nudge a family</h3>
                                    </div>
                                </header>
                                <div className="sb-toggle-stack">
                                    <Toggle
                                        label="Reminder rules"
                                        hint="When off, the reminder list still shows who is eligible but no bulk reminder is suggested."
                                        checked={settings.reminder.enabled === true}
                                        onChange={(value) => patch((prev) => ({
                                            ...prev,
                                            reminder: { ...prev.reminder, enabled: value }
                                        }))}
                                    />
                                </div>
                                <div className="sb-form-grid">
                                    {field('Remind after (days)',
                                        <input
                                            type="number" min="1" max="120"
                                            value={settings.reminder.afterDays}
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                reminder: { ...prev.reminder, afterDays: event.target.value }
                                            }))}
                                        />,
                                        'Days since the last payment before a family is eligible.'
                                    )}
                                    {field('Quiet period (days)',
                                        <input
                                            type="number" min="1" max="120"
                                            value={settings.reminder.quietDays}
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                reminder: { ...prev.reminder, quietDays: event.target.value }
                                            }))}
                                        />,
                                        'Never remind the same family twice inside this window.'
                                    )}
                                    {field('Minimum balance',
                                        <input
                                            type="number" min="0" step="0.5"
                                            value={settings.reminder.minimumBalance}
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                reminder: { ...prev.reminder, minimumBalance: event.target.value }
                                            }))}
                                        />,
                                        'Small balances below this amount are left alone.'
                                    )}
                                    {field('Low-credit warning (minutes)',
                                        <input
                                            type="number" min="0" max="6000"
                                            value={settings.reminder.lowCreditMinutes}
                                            onChange={(event) => patch((prev) => ({
                                                ...prev,
                                                reminder: { ...prev.reminder, lowCreditMinutes: event.target.value }
                                            }))}
                                        />,
                                        'Flag a family when their prepaid minutes fall below this.'
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {section === 'audit' && (
                        <section className="sb-card">
                            <header className="sb-card-head">
                                <div>
                                    <span className="sb-eyebrow">Controls</span>
                                    <h3>Audit trail</h3>
                                    <p className="sb-card-sub">Every money and settings change for {niceDate(range.from)} — {niceDate(range.to)}.</p>
                                </div>
                                <button className="btn-secondary btn-sm" onClick={loadAudit} disabled={auditLoading}>
                                    {auditLoading ? <Spinner /> : <Icon name="refresh" size={14} />} Refresh
                                </button>
                            </header>
                            {auditLoading && !audit ? <Skeleton rows={7} /> : !audit || audit.entries.length === 0 ? (
                                <EmptyState icon="check" title="Nothing recorded" body="Settings changes, refunds, and voids appear here as they happen." />
                            ) : (
                                <ol className="sb-audit">
                                    {audit.entries.map((entry) => (
                                        <li key={entry.id}>
                                            <span className={`sb-audit-dot ${entry.action.includes('void') ? 'is-danger' : entry.action.includes('refund') ? 'is-warning' : ''}`} />
                                            <div className="sb-audit-main">
                                                <div>
                                                    <strong>{entry.summary || actionLabel(entry.action)}</strong>
                                                    <Badge tone={entry.action.includes('void') ? 'danger' : 'neutral'}>{actionLabel(entry.action)}</Badge>
                                                </div>
                                                <small>{entry.actorName} · {relativeTime(entry.createdAt)} · {niceDate(entry.createdAt, true)}</small>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    )}
                </div>
            </div>

            <Modal
                open={Boolean(rateEditor)}
                title={rateEditor?.kind === 'class' ? 'Class rate' : 'Student rate'}
                eyebrow="Rate override"
                onClose={() => setRateEditor(null)}
                footer={(
                    <>
                        <button className="btn-secondary" onClick={() => setRateEditor(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveRate}>Apply rate</button>
                    </>
                )}
            >
                {rateEditor && (
                    <div className="sb-form-stack">
                        {rateEditor.kind === 'class' ? field('Class',
                            <select
                                value={rateEditor.row.classId}
                                onChange={(event) => setRateEditor((prev) => ({
                                    ...prev,
                                    row: { ...prev.row, classId: event.target.value }
                                }))}
                            >
                                <option value="">Choose a class</option>
                                {classOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                            </select>
                        ) : field('Student',
                            <select
                                value={rateEditor.row.studentId}
                                onChange={(event) => setRateEditor((prev) => ({
                                    ...prev,
                                    row: { ...prev.row, studentId: event.target.value }
                                }))}
                            >
                                <option value="">Choose a student</option>
                                {studentOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                            </select>
                        )}
                        <div className="sb-form-grid">
                            {field('Hourly rate',
                                <input
                                    type="number" min="0" step="0.5"
                                    value={rateEditor.row.hourlyRate}
                                    onChange={(event) => setRateEditor((prev) => ({
                                        ...prev,
                                        row: { ...prev.row, hourlyRate: event.target.value }
                                    }))}
                                />,
                                money(rateEditor.row.hourlyRate, currency)
                            )}
                            {field('Reason',
                                <input
                                    value={rateEditor.row.reason}
                                    maxLength={200}
                                    placeholder="Sibling discount, scholarship…"
                                    onChange={(event) => setRateEditor((prev) => ({
                                        ...prev,
                                        row: { ...prev.row, reason: event.target.value }
                                    }))}
                                />
                            )}
                        </div>
                        <div className="sb-form-grid">
                            {field('Effective from',
                                <input
                                    type="date"
                                    value={rateEditor.row.effectiveFrom}
                                    onChange={(event) => setRateEditor((prev) => ({
                                        ...prev,
                                        row: { ...prev.row, effectiveFrom: event.target.value }
                                    }))}
                                />
                            )}
                            {field('Effective to',
                                <input
                                    type="date"
                                    value={rateEditor.row.effectiveTo}
                                    onChange={(event) => setRateEditor((prev) => ({
                                        ...prev,
                                        row: { ...prev.row, effectiveTo: event.target.value }
                                    }))}
                                />
                            )}
                        </div>
                        <p className="sb-card-note">
                            Leave both dates blank for a rate that starts now and never ends. Overlapping windows for the
                            same class or student are rejected.
                        </p>
                    </div>
                )}
            </Modal>

            <Modal
                open={Boolean(packageEditor)}
                title={packageEditor?.id ? 'Edit package' : 'New package'}
                eyebrow="Prepaid lesson package"
                onClose={() => setPackageEditor(null)}
                footer={(
                    <>
                        <button className="btn-secondary" onClick={() => setPackageEditor(null)}>Cancel</button>
                        <button className="btn-primary" onClick={savePackage}>Save package</button>
                    </>
                )}
            >
                {packageEditor && (
                    <div className="sb-form-stack">
                        <div className="sb-form-grid">
                            {field('Package name',
                                <input
                                    value={packageEditor.name}
                                    maxLength={120}
                                    onChange={(event) => setPackageEditor((prev) => ({ ...prev, name: event.target.value }))}
                                />
                            )}
                            {field('Expires after (days)',
                                <input
                                    type="number" min="0" max="3650"
                                    value={packageEditor.expiryDays}
                                    onChange={(event) => setPackageEditor((prev) => ({ ...prev, expiryDays: event.target.value }))}
                                />,
                                '0 means the minutes never expire.'
                            )}
                        </div>
                        <div className="sb-form-grid">
                            {field('Included minutes',
                                <input
                                    type="number" min="1"
                                    value={packageEditor.minutes}
                                    onChange={(event) => setPackageEditor((prev) => ({ ...prev, minutes: event.target.value }))}
                                />
                            )}
                            {field('Price',
                                <input
                                    type="number" min="0" step="0.01"
                                    value={packageEditor.price}
                                    onChange={(event) => setPackageEditor((prev) => ({ ...prev, price: event.target.value }))}
                                />,
                                Number(packageEditor.minutes) > 0
                                    ? `${money((Number(packageEditor.price) || 0) / (Number(packageEditor.minutes) / 60), currency)}/hr effective`
                                    : ''
                            )}
                        </div>
                        {field('Description',
                            <input
                                value={packageEditor.description}
                                maxLength={500}
                                placeholder="Shown to staff and on the family statement"
                                onChange={(event) => setPackageEditor((prev) => ({ ...prev, description: event.target.value }))}
                            />
                        )}
                        {field('Applies to classes',
                            <div className="sb-checkbox-grid">
                                {classOptions.map((option) => {
                                    const checked = packageEditor.eligibleClasses.includes(option.id);
                                    return (
                                        <label key={option.id} className="sb-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setPackageEditor((prev) => ({
                                                    ...prev,
                                                    eligibleClasses: checked
                                                        ? prev.eligibleClasses.filter((id) => id !== option.id)
                                                        : [...prev.eligibleClasses, option.id]
                                                }))}
                                            />
                                            <span>{option.name}</span>
                                        </label>
                                    );
                                })}
                            </div>,
                            'Leave every class unchecked to allow the package on any class.'
                        )}
                        <div className="sb-toggle-stack">
                            <Toggle
                                label="Carry over unused minutes"
                                checked={packageEditor.carryOver === true}
                                onChange={(value) => setPackageEditor((prev) => ({ ...prev, carryOver: value }))}
                            />
                            <Toggle
                                label="Refundable"
                                checked={packageEditor.refundable === true}
                                onChange={(value) => setPackageEditor((prev) => ({ ...prev, refundable: value }))}
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

const PackagePurchases = ({ refreshKey, currency }) => {
    const [purchases, setPurchases] = useState(null);

    useEffect(() => {
        let active = true;
        api.get('/finance/billing/packages/purchases')
            .then((response) => {
                if (active) setPurchases(response.data?.data?.purchases || []);
            })
            .catch(() => {
                if (active) setPurchases([]);
            });
        return () => { active = false; };
    }, [refreshKey]);

    if (!purchases) return <Skeleton rows={4} />;
    if (!purchases.length) {
        return <EmptyState icon="check" title="No packages sold" body="Purchases appear here with the minutes left and the effective rate." />;
    }
    return (
        <div className="sb-table-wrap">
            <table className="sb-table">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Package</th>
                        <th className="num">Minutes left</th>
                        <th className="num">Value</th>
                        <th>Purchased</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {purchases.map((purchase) => (
                        <tr key={purchase.id}>
                            <td><strong>{purchase.studentName}</strong></td>
                            <td>{purchase.name}</td>
                            <td className="num">{Math.floor(purchase.minutesRemaining)} / {purchase.minutesIncluded}</td>
                            <td className="num">{money(purchase.price, currency)}</td>
                            <td>{niceDate(purchase.purchasedAt)}</td>
                            <td>
                                <Badge tone={purchase.status === 'active' ? 'good' : purchase.status === 'cancelled' ? 'danger' : 'neutral'}>
                                    {purchase.status}
                                </Badge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SettingsTab;
