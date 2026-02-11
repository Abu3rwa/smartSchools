import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyAssignments, selectMyAssignments, selectPracticeLoading } from '../store/slices/practiceSlice';
import { selectUser } from '../store/slices/authSlice';
import api from '../config/api';
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineLightningBolt,
    HiOutlinePlay,
    HiOutlineClock,
} from 'react-icons/hi';
import './StudentDashboardPage.css';

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const StudentDashboardPage = () => {
    const dispatch = useDispatch();
    const assignments = useSelector(selectMyAssignments);
    const assignmentsLoading = useSelector(selectPracticeLoading);

    const [schedule, setSchedule] = useState([]);
    const [grades, setGrades] = useState([]);
    const [dataLoading, setDataLoading] = useState(true);

    useEffect(() => {
        dispatch(fetchMyAssignments());
    }, [dispatch]);

    useEffect(() => {
        let cancelled = false;
        setDataLoading(true);
        Promise.all([
            api.get('/timetable/my-schedule'),
            api.get('/grades/my-grades').catch(() => ({ data: { data: { grades: [] } } })),
        ])
            .then(([sRes, gRes]) => {
                if (cancelled) return;
                setSchedule(sRes.data?.data?.schedule || []);
                const gradeList = gRes.data?.data?.grades || [];
                setGrades(Array.isArray(gradeList) ? gradeList.slice(0, 5) : []);
            })
            .catch(() => { if (!cancelled) setGrades([]); })
            .finally(() => { if (!cancelled) setDataLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const loading = assignmentsLoading || dataLoading;
    const user = useSelector(selectUser);
    const firstName = user?.firstName ?? 'Student';

    const upcomingAssignments = assignments
        .filter((a) => a.dueDate && !a.mastery?.isMastered)
        .map((a) => ({ ...a, due: new Date(a.dueDate) }))
        .sort((a, b) => a.due - b.due)
        .slice(0, 5);

    return (
        <div className="student-dashboard">
            <header className="student-dashboard-header">
                <h1>{getGreeting()}, {firstName}!</h1>
                <p>Here’s your overview for today.</p>
            </header>

            {loading ? (
                <div className="student-dashboard-loading">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            ) : (
                <div className="student-dashboard-grid">
                    {/* Today's Schedule */}
                    <section className="student-card schedule-card">
                        <h2><HiOutlineCalendar className="card-icon" /> Today’s Schedule</h2>
                        {schedule.length === 0 ? (
                            <p className="empty-text">No classes scheduled for today.</p>
                        ) : (
                            <ul className="schedule-list">
                                {schedule.map((item, i) => (
                                    <li key={i} className="schedule-item">
                                        <span className="period-name">{item.period?.name || `Period ${i + 1}`}</span>
                                        <span className="subject-name">{item.subject?.name || '—'}</span>
                                        <span className="room-name">{item.room?.name || item.room || '—'}</span>
                                        <span className="teacher-name">
                                            {item.teacher?.firstName} {item.teacher?.lastName}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Recent Grades */}
                    <section className="student-card grades-card">
                        <h2><HiOutlineClipboardList className="card-icon" /> Recent Grades</h2>
                        <div className="card-action">
                            <Link to="/portal/my-grades" className="link-sm">View all</Link>
                        </div>
                        {grades.length === 0 ? (
                            <p className="empty-text">No grades yet.</p>
                        ) : (
                            <ul className="grades-list">
                                {grades.map((g) => (
                                    <li key={g._id} className="grades-item">
                                        <span className="grade-subject">{g.subject?.name}</span>
                                        <span className="grade-marks">{g.marks}/{g.maxMarks}</span>
                                        <span className="grade-date">
                                            {g.date ? new Date(g.date).toLocaleDateString() : '—'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Practice Progress */}
                    <section className="student-card practice-card">
                        <h2><HiOutlineLightningBolt className="card-icon" /> Practice Progress</h2>
                        <div className="card-action">
                            <Link to="/portal/practice" className="link-sm">Go to Practice</Link>
                        </div>
                        {assignments.length === 0 ? (
                            <p className="empty-text">No standards assigned yet.</p>
                        ) : (
                            <ul className="practice-list">
                                {assignments.slice(0, 5).map((a) => (
                                    <li key={a._id} className="practice-item">
                                        <span className="practice-code">{a.standard?.code}</span>
                                        <span className="practice-name">{a.standard?.name}</span>
                                        <div className="practice-progress-bar">
                                            <div
                                                className="practice-progress-fill"
                                                style={{ width: `${a.mastery?.percentage || 0}%` }}
                                            />
                                        </div>
                                        <span className="practice-pct">{a.mastery?.percentage ?? 0}%</span>
                                        {a.mastery?.isMastered ? (
                                            <span className="badge-mastered">Mastered</span>
                                        ) : (
                                            <Link
                                                to={`/portal/practice/${a._id}`}
                                                className="btn-sm btn-primary"
                                            >
                                                <HiOutlinePlay size={14} /> Practice
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Upcoming Due Dates */}
                    <section className="student-card due-card">
                        <h2><HiOutlineClock className="card-icon" /> Upcoming Due Dates</h2>
                        {upcomingAssignments.length === 0 ? (
                            <p className="empty-text">No upcoming due dates.</p>
                        ) : (
                            <ul className="due-list">
                                {upcomingAssignments.map((a) => (
                                    <li key={a._id} className="due-item">
                                        <span className="due-code">{a.standard?.code}</span>
                                        <span className="due-date">
                                            {a.due.toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <Link to={`/portal/practice/${a._id}`} className="link-sm">
                                            Practice
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default StudentDashboardPage;
