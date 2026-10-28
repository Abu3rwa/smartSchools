import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import toast from 'react-hot-toast';
import '../finance/Finance.css';
import './SessionBillingPage.css';
import { Icon, Spinner } from './sessionBilling/ui';
import OverviewTab from './sessionBilling/OverviewTab';
import StudentsTab from './sessionBilling/StudentsTab';
import LessonsTab from './sessionBilling/LessonsTab';
import PaymentsTab from './sessionBilling/PaymentsTab';
import ReportsTab from './sessionBilling/ReportsTab';
import SettingsTab from './sessionBilling/SettingsTab';
import BillingModals from './sessionBilling/BillingModals';

const TABS = [
    { key: 'overview', label: 'Overview', icon: 'overview' },
    { key: 'students', label: 'Student accounts', icon: 'students' },
    { key: 'lessons', label: 'Lessons & charges', icon: 'lessons' },
    { key: 'payments', label: 'Payments', icon: 'payments' },
    { key: 'reports', label: 'Reports & messages', icon: 'reports' },
    { key: 'settings', label: 'Settings', icon: 'settings' }
];

const PRESETS = [
    { key: 'this-month', label: 'This month' },
    { key: 'last-month', label: 'Last month' },
    { key: 'last-30', label: 'Last 30 days' },
    { key: 'this-year', label: 'This year' },
    { key: 'custom', label: 'Custom' }
];

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const rangeForPreset = (preset) => {
    const now = new Date();
    if (preset === 'last-month') {
        return {
            from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
            to: iso(new Date(now.getFullYear(), now.getMonth(), 0))
        };
    }
    if (preset === 'last-30') {
        return {
            from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
            to: iso(now)
        };
    }
    if (preset === 'this-year') {
        return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    }
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
};

const prettyDate = (value) => {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const SessionBillingPage = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState('overview');
    const [preset, setPreset] = useState('this-month');
    const [range, setRange] = useState(() => rangeForPreset('this-month'));
    const [filters, setFilters] = useState({ search: '', classId: '' });
    const [refreshKey, setRefreshKey] = useState(0);
    const [modal, setModal] = useState(null);
    const [openStudentId, setOpenStudentId] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [classes, setClasses] = useState([]);
    const [settingsSection, setSettingsSection] = useState('rates');

    const searchTimer = useRef(null);

    useEffect(() => {
        let active = true;
        api.get('/classes', { params: { limit: 'all' } })
            .then((response) => {
                if (active) setClasses(response.data?.data?.classes || response.data?.data || []);
            })
            .catch(() => {
                if (active) setClasses([]);
            });
        return () => { active = false; };
    }, []);

    useEffect(() => () => clearTimeout(searchTimer.current), []);

    const refresh = useCallback(() => {
        setRefreshing(true);
        setRefreshKey((key) => key + 1);
        setTimeout(() => setRefreshing(false), 650);
    }, []);

    const choosePreset = (key) => {
        setPreset(key);
        if (key !== 'custom') setRange(rangeForPreset(key));
    };

    const setRangeDate = (field, value) => {
        setPreset('custom');
        setRange((current) => ({ ...current, [field]: value }));
    };

    const onSearch = (value) => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setFilters((current) => ({ ...current, search: value.trim() }));
        }, 400);
    };

    const handleAction = useCallback((action) => {
        if (!action) return;
        if (action.studentId) {
            setOpenStudentId(String(action.studentId));
            setTab('students');
            return;
        }
        if (action.tab) setTab(action.tab === 'messages' ? 'reports' : action.tab);
        if (action.status || action.classId) {
            setFilters((current) => ({
                ...current,
                ...(action.status ? { status: action.status } : {}),
                ...(action.classId ? { classId: action.classId } : {})
            }));
        }
        if (action.section) setSettingsSection(action.section);
    }, []);

    const handleOpenStudent = useCallback((studentId) => {
        setOpenStudentId(String(studentId));
        setTab('students');
    }, []);

    const openModal = useCallback((next) => setModal(next), []);
    const closeModal = useCallback(() => setModal(null), []);

    const handleDone = useCallback((_result, printRequest) => {
        if (printRequest) {
            setModal(printRequest);
        } else {
            setModal(null);
            toast.success('Saved');
        }
        refresh();
    }, [refresh]);

    const openPayment = useCallback((studentId) => {
        setModal({ type: 'payment', ...(studentId ? { studentId: String(studentId) } : {}) });
    }, []);

    const openStatement = useCallback((student) => {
        if (!student?.studentId) return;
        setModal({ type: 'statement', studentId: student.studentId, name: student.name });
    }, []);

    const openReminder = useCallback((student) => {
        if (!student?.studentId) return;
        setModal({ type: 'reminder', studentId: student.studentId, name: student.name });
    }, []);

    const printStatement = useCallback((student) => {
        const studentId = typeof student === 'string' ? student : student?.studentId;
        if (!studentId) return;
        const name = typeof student === 'string' ? '' : student.name || '';
        setModal({
            type: 'print',
            kind: 'statement',
            studentId,
            language: 'en',
            title: name ? `Statement — ${name}` : 'Student statement'
        });
    }, []);

    const openReceipt = useCallback((payment) => {
        if (!payment?.id) return;
        setModal({ type: 'receipt', payment });
    }, []);

    const tabs = useMemo(() => TABS.map((entry) => (
        <button
            key={entry.key}
            className={`sb-tab-link ${tab === entry.key ? 'is-active' : ''}`}
            onClick={() => setTab(entry.key)}
            type="button"
        >
            <Icon name={entry.icon} size={16} />
            <span>{entry.label}</span>
        </button>
    )), [tab]);

    return (
        <div className="session-billing-page sb-workspace">
            <header className="sb-workspace-head">
                <div className="sb-workspace-title">
                    <span className="sb-eyebrow">Tutoring · Live lessons</span>
                    <h1>Session billing</h1>
                    <p>Charge lesson minutes, take payments, and keep every family statement straight.</p>
                </div>
                <div className="sb-workspace-actions">
                    <button className="btn-secondary btn-sm" onClick={refresh} disabled={refreshing}>
                        {refreshing ? <Spinner /> : <Icon name="refresh" size={14} />} Refresh
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => openModal({ type: 'log-time' })}>
                        <Icon name="lessons" size={14} /> Log time
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => openModal({ type: 'bulk-statements' })}>
                        <Icon name="mail" size={14} /> Email statements
                    </button>
                    <button className="btn-primary btn-sm" onClick={() => openPayment()}>
                        <Icon name="plus" size={14} /> Record payment
                    </button>
                </div>
            </header>

            <section className="sb-period-bar">
                <div className="sb-preset-row">
                    {PRESETS.map((entry) => (
                        <button
                            key={entry.key}
                            type="button"
                            className={`sb-preset ${preset === entry.key ? 'is-active' : ''}`}
                            onClick={() => choosePreset(entry.key)}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
                <div className="sb-period-inputs">
                    <label>
                        <span>From</span>
                        <input
                            type="date"
                            value={range.from}
                            max={range.to || undefined}
                            onChange={(event) => setRangeDate('from', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>To</span>
                        <input
                            type="date"
                            value={range.to}
                            min={range.from || undefined}
                            onChange={(event) => setRangeDate('to', event.target.value)}
                        />
                    </label>
                    <span className="sb-period-label">{prettyDate(range.from)} — {prettyDate(range.to)}</span>
                </div>
                <div className="sb-filter-row">
                    <div className="sb-search">
                        <Icon name="students" size={14} />
                        <input
                            type="search"
                            placeholder="Search a student"
                            onChange={(event) => onSearch(event.target.value)}
                        />
                    </div>
                    <select
                        value={filters.classId || ''}
                        onChange={(event) => setFilters((current) => ({ ...current, classId: event.target.value }))}
                    >
                        <option value="">All classes</option>
                        {classes.map((klass) => (
                            <option key={klass._id || klass.id} value={klass._id || klass.id}>{klass.name}</option>
                        ))}
                    </select>
                </div>
            </section>

            <nav className="sb-tab-nav" role="tablist">
                {tabs}
                <button
                    type="button"
                    className="sb-tab-link sb-tab-settings"
                    onClick={() => navigate('/portal/finance/session-billing/settings')}
                >
                    <Icon name="settings" size={15} />
                    <span>Full settings</span>
                </button>
            </nav>

            <main className="sb-workspace-body">
                {tab === 'overview' && (
                    <OverviewTab
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        onAction={handleAction}
                        onOpenStudent={handleOpenStudent}
                        onRecordPayment={openPayment}
                    />
                )}
                {tab === 'students' && (
                    <StudentsTab
                        key={`students-${filters.status || ''}-${filters.search}`}
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        onRecordPayment={openPayment}
                        onEmailStatement={openStatement}
                        onPrintStatement={printStatement}
                        onSellPackage={(studentId) => openModal({ type: 'sell-package', studentId })}
                        onOpenLessons={() => setTab('lessons')}
                        openStudentId={openStudentId}
                        onOpenStudent={handleOpenStudent}
                        onCloseStudent={() => setOpenStudentId('')}
                    />
                )}
                {tab === 'lessons' && (
                    <LessonsTab
                        key={`lessons-${filters.status || ''}-${filters.search}`}
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        onAction={handleAction}
                        onRecordPayment={openPayment}
                    />
                )}
                {tab === 'payments' && (
                    <PaymentsTab
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        onRecordPayment={openPayment}
                        onRefund={(preset) => openModal({ type: 'refund', ...(preset || {}) })}
                        onAdjustment={(preset) => openModal({ type: 'adjustment', ...(preset || {}) })}
                        onOpenReceipt={openReceipt}
                        onMutated={refresh}
                    />
                )}
                {tab === 'reports' && (
                    <ReportsTab
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        onPrintReport={(params) => setModal({
                            type: 'print',
                            kind: 'report',
                            params,
                            title: 'Printable report'
                        })}
                        onReminder={openReminder}
                        onBulkReminders={(candidates) => setModal({ type: 'bulk-reminders', candidates })}
                        onBulkStatements={() => setModal({ type: 'bulk-statements' })}
                        onOpenStudent={handleOpenStudent}
                    />
                )}
                {tab === 'settings' && (
                    <SettingsTab
                        key={`settings-${settingsSection}`}
                        range={range}
                        filters={filters}
                        refreshKey={refreshKey}
                        initialSection={settingsSection}
                        onMutated={refresh}
                    />
                )}
            </main>

            <BillingModals
                modal={modal}
                range={range}
                onClose={closeModal}
                onDone={handleDone}
            />
        </div>
    );
};

export default SessionBillingPage;
