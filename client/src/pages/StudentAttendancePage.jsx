import { useEffect, useState } from 'react';
import api from '../config/api';
import { HiOutlineClipboardCheck } from 'react-icons/hi';
import './StudentAttendancePage.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
    { value: '', label: 'All months' },
    ...Array.from({ length: 12 }, (_, i) => ({
        value: String(i + 1),
        label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
    })),
];

const statusLabel = (status) => {
    const map = {
        present: 'Present',
        absent: 'Absent',
        tardy: 'Late',
        tardy_excused: 'Late (excused)',
        absent_excused: 'Absent (excused)',
    };
    return map[status] || status;
};

const StudentAttendancePage = () => {
    const [records, setRecords] = useState([]);
    const [summary, setSummary] = useState({ total: 0, present: 0, late: 0, absent: 0, percentage: 0 });
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState('');
    const [year, setYear] = useState(String(CURRENT_YEAR));

    const fetchAttendance = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        api.get(`/attendance/my-attendance?${params.toString()}`)
            .then((res) => {
                const data = res.data?.data || {};
                setRecords(data.records || []);
                setSummary(data.summary || { total: 0, present: 0, late: 0, absent: 0, percentage: 0 });
            })
            .catch(() => {
                setRecords([]);
                setSummary({ total: 0, present: 0, late: 0, absent: 0, percentage: 0 });
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchAttendance();
    }, [month, year]);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—';

    return (
        <div className="student-attendance-page">
            <header className="page-header">
                <h1><HiOutlineClipboardCheck className="header-icon" /> My Attendance</h1>
                <p className="page-subtitle">View your attendance records.</p>
            </header>

            <div className="filters-bar">
                <label className="filter-group">
                    <span className="filter-label">Month</span>
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="filter-select"
                    >
                        {MONTHS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </label>
                <label className="filter-group">
                    <span className="filter-label">Year</span>
                    <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="filter-select"
                    >
                        {YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </label>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading attendance...</p>
                </div>
            ) : (
                <>
                    <section className="summary-cards">
                        <div className="stat-card">
                            <span className="stat-value">{summary.total}</span>
                            <span className="stat-label">Total days</span>
                        </div>
                        <div className="stat-card present">
                            <span className="stat-value">{summary.present}</span>
                            <span className="stat-label">Present</span>
                        </div>
                        <div className="stat-card late">
                            <span className="stat-value">{summary.late}</span>
                            <span className="stat-label">Late</span>
                        </div>
                        <div className="stat-card absent">
                            <span className="stat-value">{summary.absent}</span>
                            <span className="stat-label">Absent</span>
                        </div>
                        <div className="stat-card percentage">
                            <span className="stat-value">{summary.percentage}%</span>
                            <span className="stat-label">Attendance rate</span>
                        </div>
                    </section>

                    <section className="records-section">
                        <h2 className="section-title">Records</h2>
                        {records.length === 0 ? (
                            <p className="empty-state">No attendance records found for the selected period.</p>
                        ) : (
                            <ul className="records-list">
                                {records.map((r, i) => (
                                    <li key={i} className={`record-item status-${r.status}`}>
                                        <span className="record-date">{formatDate(r.date)}</span>
                                        <span className="record-subject">{r.subject?.name || '—'}</span>
                                        <span className="record-period">{r.period?.name || '—'}</span>
                                        <span className="record-status">{statusLabel(r.status)}</span>
                                        {r.remarks && <span className="record-remarks">{r.remarks}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default StudentAttendancePage;
