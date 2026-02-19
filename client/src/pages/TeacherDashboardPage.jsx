import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Grid, Typography, useTheme, useMediaQuery } from '@mui/material';
import { selectUser } from '../store/slices/authSlice';
import { fetchMyClasses, selectMyClasses } from '../store/slices/teacherSlice';
import { fetchSubPendingCountThunk, selectPendingCount } from '../store/slices/substitutionsSlice';
import timetableService from '../services/timetableService';
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineClock,
    HiOutlineUsers,
    HiOutlineBell,
    HiOutlineArrowRight,
} from 'react-icons/hi';
import './TeacherDashboardPage.css';

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const formatTime = (val) => {
    if (val == null || val === '') return '—';
    const str = typeof val === 'string' ? val : String(val);
    if (str === 'Invalid Date' || str === 'undefined' || str === 'null') return '—';
    // Handle HH:MM strings from TimetablePeriod (e.g. "08:00", "14:30")
    const hhmm = str.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
        const h = Number(hhmm[1]);
        const m = Number(hhmm[2]);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    }
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return '—';
        const result = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return result.includes('Invalid') ? '—' : result;
    } catch {
        return '—';
    }
};

const SectionCard = ({ title, icon: Icon, action, children, className }) => (
    <div className={`teacher-card ${className || ''}`.trim()}>
        <div className="card-header">
            <h3 className="card-title">
                {Icon && <Icon className="card-icon" size={20} />}
                {title}
            </h3>
            {action}
        </div>
        {children}
    </div>
);

const SummaryStat = ({ icon: Icon, label, value }) => (
    <Box className="summary-stat">
        {Icon && <Icon className="summary-stat-icon" size={18} />}
        <div className="summary-stat-content">
            <span className="summary-stat-value">{value}</span>
            <span className="summary-stat-label">{label}</span>
        </div>
    </Box>
);

const TeacherDashboardPage = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const myClasses = useSelector(selectMyClasses);
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    const [timetable, setTimetable] = useState({ periods: [], assignments: [] });
    const [timetableLoading, setTimetableLoading] = useState(true);
    const [timetableError, setTimetableError] = useState(null);

    useEffect(() => {
        dispatch(fetchMyClasses());
    }, [dispatch]);

    useEffect(() => {
        dispatch(fetchSubPendingCountThunk());
    }, [dispatch]);

    const pendingCount = useSelector(selectPendingCount);

    useEffect(() => {
        let cancelled = false;
        setTimetableLoading(true);
        setTimetableError(null);
        timetableService
            .getMyTimetable()
            .then((res) => {
                if (cancelled) return;
                const body = res?.data || res;
                const payload = body?.data || body;
                setTimetable({
                    periods: payload.periods || [],
                    assignments: payload.assignments || [],
                });
            })
            .catch((err) => {
                if (!cancelled) setTimetableError(err?.message || 'Failed to load timetable');
            })
            .finally(() => {
                if (!cancelled) setTimetableLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const todaySchedule = useMemo(() => {
        const dayOfWeek = new Date().getDay();
        const assignments = (timetable.assignments || []).filter((a) => {
            const days = a.daysOfWeek;
            if (!days || !Array.isArray(days) || days.length === 0) return true;
            return days.includes(dayOfWeek);
        });
        // period is populated from TimetablePeriod — grab its HH:MM startTime/endTime
        // Also look up from the periods array as a fallback if period wasn't populated
        const periodsMap = new Map((timetable.periods || []).map((p) => [p._id, p]));
        const withOrder = assignments
            .map((a) => {
                const periodObj =
                    (a.period && typeof a.period === 'object' ? a.period : null) ||
                    periodsMap.get(a.period) ||
                    null;
                return {
                    ...a,
                    order: periodObj?.order ?? 0,
                    startTime: periodObj?.startTime ?? null,
                    endTime: periodObj?.endTime ?? null,
                    _periodObj: periodObj,
                };
            })
            .sort((a, b) => a.order - b.order);
        return withOrder;
    }, [timetable.assignments, timetable.periods]);

    const quickActions = [
        { label: 'Enter Grades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
        { label: 'Lesson Plans', path: '/portal/lessons', icon: HiOutlineDocumentText },
        { label: 'My Timetable', path: '/portal/my-timetable', icon: HiOutlineClock },
        { label: 'My Attendance', path: '/portal/my-attendance', icon: HiOutlineUsers },
        { label: 'Newsletters', path: '/portal/newsletters', icon: HiOutlineBell },
    ];

    const loading = timetableLoading;
    const firstName = user?.firstName ?? 'Teacher';
    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());
    const todayClassesCount = todaySchedule.length;
    const pendingSubsCount = pendingCount?.count ?? 0;

    return (
        <Box className="teacher-dashboard" sx={{ p: { xs: 2, sm: 3 } }}>
            <header className="teacher-dashboard-header">
                <Typography variant={isSm ? 'h5' : 'h4'} sx={{ fontWeight: 700, mb: 0.5 }}>
                    {getGreeting()}, {firstName}!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Your teaching day at a glance.
                </Typography>
            </header>

            <Grid container spacing={2} className="summary-row">
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineCalendar} label="Today" value={todayLabel} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClock} label="Classes today" value={todayClassesCount || '—'} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClipboardList} label="Pending sub requests" value={pendingSubsCount || '0'} />
                </Grid>
            </Grid>

            {loading ? (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 200,
                        gap: 2,
                    }}
                >
                    <div className="spinner" />
                    <Typography variant="body2" color="text.secondary">
                        Loading your dashboard...
                    </Typography>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {/* Today's Schedule */}
                    <Grid item xs={12} lg={6}>
                        <SectionCard
                            className="schedule-card"
                            title="Today's Schedule"
                            icon={HiOutlineCalendar}
                            action={
                                <Link to="/portal/my-timetable" className="btn btn-ghost btn-sm">
                                    Full timetable
                                </Link>
                            }
                        >
                            {timetableError ? (
                                <p className="empty-text">Could not load schedule.</p>
                            ) : todaySchedule.length === 0 ? (
                                <p className="empty-text">No classes scheduled for today.</p>
                            ) : (
                                <ul className="teacher-schedule-list">
                                    {todaySchedule.map((a, i) => (
                                        <li key={a._id || i} className="teacher-schedule-item">
                                            <span className="period-time">
                                                {formatTime(a.startTime)} – {formatTime(a.endTime)}
                                            </span>
                                            <span className="period-name">
                                                {a._periodObj?.name || a.period?.name || `Period ${i + 1}`}
                                            </span>
                                            <span className="subject-name">{a.subject?.name || '—'}</span>
                                            <span className="class-name">{a.class?.name || '—'}</span>
                                            <span className="room-name">{a.room?.name || a.room || '—'}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </SectionCard>
                    </Grid>

                    {/* Pending Sub Requests */}
                    <Grid item xs={12} lg={6}>
                        <SectionCard
                            className="sub-requests-card"
                            title="Sub Requests"
                            icon={HiOutlineClipboardList}
                            action={
                                <Link to="/portal/substitutions" className="btn btn-ghost btn-sm">
                                    View all
                                </Link>
                            }
                        >
                            {pendingCount.loading ? (
                                <p className="empty-text">Loading...</p>
                            ) : pendingSubsCount > 0 ? (
                                <Box sx={{ py: 1 }}>
                                    <Typography variant="body1" fontWeight={600} color="primary.main">
                                        {pendingSubsCount} pending request{pendingSubsCount !== 1 ? 's' : ''}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        Please confirm or decline.
                                    </Typography>
                                    <Link
                                        to="/portal/substitutions"
                                        className="btn btn-ghost btn-sm"
                                        style={{ marginTop: 8, display: 'inline-block' }}
                                    >
                                        View &amp; respond
                                    </Link>
                                </Box>
                            ) : (
                                <p className="empty-text">No pending sub requests.</p>
                            )}
                        </SectionCard>
                    </Grid>

                    {/* Quick Actions */}
                    <Grid item xs={12}>
                        <SectionCard className="quick-actions-card" title="Quick Actions">
                            <Grid container spacing={1.5}>
                                {quickActions.map((action, index) => (
                                    <Grid item xs={12} sm={6} md={4} key={index}>
                                        <Link to={action.path} className="quick-action">
                                            <action.icon size={24} />
                                            <span>{action.label}</span>
                                            <HiOutlineArrowRight className="action-arrow" size={18} />
                                        </Link>
                                    </Grid>
                                ))}
                            </Grid>
                        </SectionCard>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default TeacherDashboardPage;
