import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
    HiOutlineCalendar,
    HiOutlineRefresh,
    HiOutlineExclamation,
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineClock,
    HiOutlineLocationMarker
} from 'react-icons/hi';
import { selectUser } from '../../store/slices/authSlice';
import timetableService from '../../services/timetableService';
import './TeacherTimetablePage.css';

const COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'red', 'yellow'];

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri default

const TeacherTimetablePage = () => {
    const user = useSelector(selectUser);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [periods, setPeriods] = useState([]);
    const [assignments, setAssignments] = useState([]);

    const fetchTimetable = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await timetableService.getMyTimetable();
            setPeriods(res?.data?.periods || []);
            setAssignments(res?.data?.assignments || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTimetable();
    }, []);

    // Build a color map per subject for visual distinction
    const subjectColorMap = useMemo(() => {
        const map = new Map();
        let colorIdx = 0;
        for (const assignment of assignments) {
            const subjectId = assignment.subject?._id || 'none';
            if (!map.has(subjectId)) {
                map.set(subjectId, COLORS[colorIdx % COLORS.length]);
                colorIdx++;
            }
        }
        return map;
    }, [assignments]);

    // Build lookup: { periodId -> { dayOfWeek -> assignment } }
    const timetableMap = useMemo(() => {
        const map = new Map();
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        for (const assignment of assignments) {
            const periodId = assignment.period?._id || assignment.period;
            if (!periodId) continue;

            // Check if assignment is currently active by date range
            const start = new Date(assignment.startDate);
            const end = new Date(assignment.endDate);
            if (todayDate < start || todayDate > end) continue;

            for (const day of (assignment.daysOfWeek || [])) {
                const key = `${periodId}_${day}`;
                map.set(key, assignment);
            }
        }
        return map;
    }, [assignments]);

    // Determine which days to show (union of all assignment days, or default working days)
    const daysToShow = useMemo(() => {
        const allDays = new Set();
        for (const assignment of assignments) {
            for (const d of (assignment.daysOfWeek || [])) {
                allDays.add(d);
            }
        }
        const days = allDays.size > 0 ? Array.from(allDays).sort((a, b) => a - b) : WORKING_DAYS;
        return days;
    }, [assignments]);

    // Current day and current period detection
    const today = new Date();
    const currentDayOfWeek = today.getDay();

    const currentPeriodId = useMemo(() => {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const period of periods) {
            const [sh, sm] = (period.startTime || '').split(':').map(Number);
            const [eh, em] = (period.endTime || '').split(':').map(Number);
            const periodStart = sh * 60 + sm;
            const periodEnd = eh * 60 + em;

            if (nowMinutes >= periodStart && nowMinutes < periodEnd) {
                return period._id;
            }
        }
        return null;
    }, [periods]);

    // Summary stats
    const totalLessonsPerWeek = useMemo(() => {
        let count = 0;
        for (const period of periods) {
            for (const day of daysToShow) {
                const key = `${period._id}_${day}`;
                if (timetableMap.has(key)) count++;
            }
        }
        return count;
    }, [periods, daysToShow, timetableMap]);

    const uniqueClasses = useMemo(() => {
        const ids = new Set();
        for (const a of assignments) {
            if (a.class?._id) ids.add(a.class._id);
        }
        return ids.size;
    }, [assignments]);

    const uniqueSubjects = useMemo(() => {
        const ids = new Set();
        for (const a of assignments) {
            if (a.subject?._id) ids.add(a.subject._id);
        }
        return ids.size;
    }, [assignments]);

    // Week dates for header
    const weekDates = useMemo(() => {
        const now = new Date();
        const dayOffset = now.getDay();
        const map = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - dayOffset + i);
            map[i] = d;
        }
        return map;
    }, []);

    if (loading) {
        return (
            <div className="teacher-timetable-page">
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-timetable-page">
            <div className="page-header">
                <div>
                    <h1>
                        <HiOutlineCalendar size={24} />
                        My Timetable
                    </h1>
                    <p>{user?.firstName} {user?.lastName} — Weekly Schedule</p>
                </div>
                <div className="header-actions">
                    {WORKING_DAYS.includes(currentDayOfWeek) && currentPeriodId && (
                        <span className="today-badge">
                            <HiOutlineClock size={14} />
                            {periods.find(p => p._id === currentPeriodId)?.name || 'In session'}
                        </span>
                    )}
                    <button className="btn btn-secondary" onClick={fetchTimetable}>
                        <HiOutlineRefresh size={18} />
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

            {/* Summary cards */}
            <div className="timetable-summary">
                <div className="summary-card">
                    <div className="summary-icon blue"><HiOutlineClock size={20} /></div>
                    <div>
                        <div className="summary-value">{totalLessonsPerWeek}</div>
                        <div className="summary-label">Lessons / week</div>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-icon green"><HiOutlineAcademicCap size={20} /></div>
                    <div>
                        <div className="summary-value">{uniqueClasses}</div>
                        <div className="summary-label">Classes</div>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-icon purple"><HiOutlineBookOpen size={20} /></div>
                    <div>
                        <div className="summary-value">{uniqueSubjects}</div>
                        <div className="summary-label">Subjects</div>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-icon orange"><HiOutlineCalendar size={20} /></div>
                    <div>
                        <div className="summary-value">{periods.length}</div>
                        <div className="summary-label">Periods / day</div>
                    </div>
                </div>
            </div>

            {periods.length === 0 || assignments.length === 0 ? (
                <div className="empty-timetable">
                    <div className="empty-icon">📅</div>
                    <p>No timetable assignments found.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Your school admin will assign your periods and classes.</p>
                </div>
            ) : (
                <div className="timetable-grid-wrapper">
                    <div
                        className="timetable-grid"
                        style={{ gridTemplateColumns: `120px repeat(${daysToShow.length}, minmax(100px, 1fr))` }}
                    >
                    {/* Corner cell */}
                    <div className="corner-cell">Period</div>

                    {/* Day headers */}
                    {daysToShow.map(day => {
                        const isToday = day === currentDayOfWeek;
                        const dateObj = weekDates[day];
                        return (
                            <div key={day} className={`day-header ${isToday ? 'is-today' : ''}`}>
                                <span className="day-name">{DAY_SHORT[day]}</span>
                                {dateObj && (
                                    <span className="day-date">
                                        {dateObj.getDate()}/{dateObj.getMonth() + 1}
                                    </span>
                                )}
                            </div>
                        );
                    })}

                    {/* Period rows */}
                    {periods.map(period => {
                        const isCurrent = period._id === currentPeriodId;
                        return (
                            <React.Fragment key={period._id}>
                                <div
                                    className={`period-label ${isCurrent ? 'is-current' : ''}`}
                                >
                                    <span className="period-name">{period.name}</span>
                                    <span className="period-time">{period.startTime} - {period.endTime}</span>
                                </div>
                                {daysToShow.map(day => {
                                    const key = `${period._id}_${day}`;
                                    const assignment = timetableMap.get(key);
                                    const isCellCurrent = isCurrent && day === currentDayOfWeek;

                                    if (!assignment) {
                                        return (
                                            <div
                                                key={key}
                                                className={`timetable-cell empty ${isCellCurrent ? 'is-current-period' : ''}`}
                                            />
                                        );
                                    }

                                    const subjectId = assignment.subject?._id || 'none';
                                    const color = subjectColorMap.get(subjectId) || 'blue';

                                    return (
                                        <div
                                            key={key}
                                            className={`timetable-cell ${isCellCurrent ? 'is-current-period' : ''}`}
                                        >
                                            <div className={`lesson-card color-${color}`}>
                                                <span className="lesson-subject">
                                                    {assignment.subject?.name || 'No subject'}
                                                </span>
                                                <span className="lesson-class">
                                                    {assignment.class?.name || 'No class'}
                                                </span>
                                                {assignment.room?.name && (
                                                    <span className="lesson-room">
                                                        <HiOutlineLocationMarker size={12} />
                                                        {assignment.room.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherTimetablePage;
