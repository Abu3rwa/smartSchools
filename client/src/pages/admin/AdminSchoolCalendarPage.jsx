import { useEffect, useMemo, useState } from 'react';
import {
    HiOutlineCalendar,
    HiOutlineRefresh,
    HiOutlineExclamation,
    HiOutlineTrash
} from 'react-icons/hi';
import schoolCalendarService from '../../services/schoolCalendarService';
import './AdminSchoolCalendarPage.css';

const dayLabels = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
];

const toDateInput = (d) => {
    const date = new Date(d);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const AdminSchoolCalendarPage = () => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const [config, setConfig] = useState(null);
    const [exceptions, setExceptions] = useState([]);

    const [weekWorkingDays, setWeekWorkingDays] = useState([1, 2, 3, 4, 5]);

    const [newException, setNewException] = useState({
        date: toDateInput(new Date()),
        isWorkingDay: false,
        reason: ''
    });

    const monthRange = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }, []);

    const fetchCalendar = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await schoolCalendarService.getCalendar({
                startDate: monthRange.start.toISOString(),
                endDate: monthRange.end.toISOString()
            });

            const cfg = res?.data?.config || null;
            const ex = res?.data?.exceptions || [];

            setConfig(cfg);
            setExceptions(ex);
            setWeekWorkingDays(cfg?.weekWorkingDays?.length ? cfg.weekWorkingDays : [1, 2, 3, 4, 5]);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleDay = (value) => {
        setWeekWorkingDays(prev => {
            const next = prev.includes(value)
                ? prev.filter(d => d !== value)
                : [...prev, value];
            return next.sort((a, b) => a - b);
        });
    };

    const saveConfig = async () => {
        try {
            setSaving(true);
            setError(null);

            const res = await schoolCalendarService.upsertConfig({
                weekWorkingDays,
                isActive: true
            });

            setConfig(res?.data?.config || null);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const saveException = async () => {
        try {
            setSaving(true);
            setError(null);

            await schoolCalendarService.upsertException(newException.date, {
                isWorkingDay: !!newException.isWorkingDay,
                reason: newException.reason
            });

            setNewException({
                date: toDateInput(new Date()),
                isWorkingDay: false,
                reason: ''
            });

            await fetchCalendar();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const removeException = async (date) => {
        if (!window.confirm('Delete this exception?')) return;
        try {
            setSaving(true);
            setError(null);
            await schoolCalendarService.deleteException(toDateInput(date));
            await fetchCalendar();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-school-calendar-page">
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-school-calendar-page">
            <div className="page-header">
                <div className="header-content">
                    <h1>School Calendar</h1>
                    <p>Configure working days and manage holidays / special days</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchCalendar} disabled={saving}>
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="error-banner">
                    <HiOutlineExclamation size={20} />
                    <span>{error}</span>
                </div>
            )}

            <div className="calendar-grid">
                <div className="card">
                    <div className="card-title">
                        <HiOutlineCalendar size={20} />
                        Weekly Working Days
                    </div>

                    <div className="weekday-selector">
                        {dayLabels.map(d => (
                            <label key={d.value} className={`weekday-pill ${weekWorkingDays.includes(d.value) ? 'active' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={weekWorkingDays.includes(d.value)}
                                    onChange={() => toggleDay(d.value)}
                                />
                                <span>{d.label}</span>
                            </label>
                        ))}
                    </div>

                    <div className="card-actions">
                        <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Working Days'}
                        </button>
                    </div>

                    {config && (
                        <div className="muted">
                            Last updated: {new Date(config.updatedAt).toLocaleString()}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="card-title">Day Exceptions</div>

                    <div className="exception-form">
                        <div className="field">
                            <label>Date</label>
                            <input
                                type="date"
                                value={newException.date}
                                onChange={(e) => setNewException(prev => ({ ...prev, date: e.target.value }))}
                            />
                        </div>

                        <div className="field">
                            <label>Type</label>
                            <select
                                value={newException.isWorkingDay ? 'working' : 'holiday'}
                                onChange={(e) => setNewException(prev => ({ ...prev, isWorkingDay: e.target.value === 'working' }))}
                            >
                                <option value="holiday">Holiday / Closed</option>
                                <option value="working">Working Day Override</option>
                            </select>
                        </div>

                        <div className="field full">
                            <label>Reason</label>
                            <input
                                value={newException.reason}
                                onChange={(e) => setNewException(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="e.g., Public holiday"
                            />
                        </div>

                        <div className="field full">
                            <button className="btn btn-primary" onClick={saveException} disabled={saving || !newException.date}>
                                {saving ? 'Saving...' : 'Add / Update Exception'}
                            </button>
                        </div>
                    </div>

                    <div className="exceptions-table">
                        {exceptions.length === 0 ? (
                            <div className="empty-state">No exceptions for this month.</div>
                        ) : (
                            exceptions.map(ex => (
                                <div key={ex._id} className="exception-row">
                                    <div className="ex-date">{toDateInput(ex.date)}</div>
                                    <div className={`ex-type ${ex.isWorkingDay ? 'working' : 'holiday'}`}>
                                        {ex.isWorkingDay ? 'Working' : 'Holiday'}
                                    </div>
                                    <div className="ex-reason">{ex.reason || '-'}</div>
                                    <button
                                        className="icon-btn danger"
                                        onClick={() => removeException(ex.date)}
                                        disabled={saving}
                                        title="Delete"
                                    >
                                        <HiOutlineTrash size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSchoolCalendarPage;
