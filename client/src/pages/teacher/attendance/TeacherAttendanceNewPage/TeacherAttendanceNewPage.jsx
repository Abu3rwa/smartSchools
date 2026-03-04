import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
    HiOutlineClipboardCheck,
    HiOutlineRefresh,
    HiOutlineExclamation,
    HiOutlineCheckCircle,
    HiOutlineUserGroup,
    HiOutlineClock,
    HiOutlineChevronLeft,
    HiOutlineChevronRight
} from 'react-icons/hi';
import { selectUser } from '../../../../store/slices/authSlice';
import attendanceService from '../../../../services/attendanceService';
import studentService from '../../../../services/studentService';
import './TeacherAttendanceNewPage.css';

const STATUS_OPTIONS = [
    { key: 'present', label: 'Present', short: 'P' },
    { key: 'absent', label: 'Absent', short: 'A' },
    { key: 'tardy', label: 'Tardy', short: 'T' },
    { key: 'tardy_excused', label: 'Tardy Excused', short: 'TE' },
    { key: 'absent_excused', label: 'Absent Excused', short: 'AE' }
];

const TeacherAttendanceNewPage = () => {
    const user = useSelector(selectUser);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [periodsData, setPeriodsData] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [students, setStudents] = useState([]);
    const [studentAttendance, setStudentAttendance] = useState({});
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());

    const selectedDateStr = selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const isSelectedDateToday = isSameDay(selectedDate, new Date());
    const canGoNextDay = isBeforeDay(selectedDate, new Date());

    const fetchPeriodsForDate = async (dateToLoad = selectedDate) => {
        try {
            setLoading(true);
            setError(null);
            const res = await attendanceService.getMyTodayPeriods({
                date: formatDayKey(dateToLoad)
            });
            setPeriodsData(res?.data?.periods || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setSelectedPeriod(null);
        setStudents([]);
        setStudentAttendance({});
        setSuccess(null);
        fetchPeriodsForDate(selectedDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    const handleSelectPeriod = async (periodItem) => {
        if (!periodItem.hasClass) return;

        setSelectedPeriod(periodItem);
        setSuccess(null);
        setError(null);

        const classId = periodItem.assignment?.class?._id;
        if (!classId) return;

        try {
            setLoadingStudents(true);
            const res = await studentService.getStudentsByClass(classId);
            const studentList = res?.data?.students || [];
            setStudents(studentList);

            // Load existing attendance if available
            if (periodItem.attendanceStatus) {
                // Use existing attendance data from the period item
                const attendanceData = periodItem.attendanceStatus;
                const existingAttendance = attendanceData.studentAttendance || [];

                // Build attendance map from existing data
                const attendanceMap = {};
                for (const record of existingAttendance) {
                    attendanceMap[record.student] = record.status;
                }

                // Initialize with existing data, default to 'present' for missing
                const initial = {};
                for (const student of studentList) {
                    initial[student._id] = attendanceMap[student._id] || 'present';
                }
                setStudentAttendance(initial);
            } else {
                // Initialize attendance: default all to 'present'
                const initial = {};
                for (const student of studentList) {
                    initial[student._id] = 'present';
                }
                setStudentAttendance(initial);
            }
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
            setStudents([]);
        } finally {
            setLoadingStudents(false);
        }
    };

    const setAllStatus = (status) => {
        const updated = {};
        for (const student of students) {
            updated[student._id] = status;
        }
        setStudentAttendance(updated);
    };

    const handleSubmit = async () => {
        if (!selectedPeriod?.assignment) return;
        if (selectedPeriod?.isReadOnlyForOriginalTeacher) return;

        const periodId = selectedPeriod.period._id;
        const classId = selectedPeriod.assignment.class._id;
        const subjectId = selectedPeriod.assignment.subject?._id;

        const payload = {
            periodId,
            classId,
            subjectId,
            attendanceDate: formatDayKey(selectedDate),
            studentAttendance: students.map(student => ({
                student: student._id,
                status: studentAttendance[student._id] || 'present'
            }))
        };

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);
            await attendanceService.takePeriodAttendance(payload);
            setSuccess('Attendance saved successfully!');
            await fetchPeriodsForDate(selectedDate);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const isReadOnlySelectedPeriod = Boolean(selectedPeriod?.isReadOnlyForOriginalTeacher);

    const handleChangeDay = (direction) => {
        setSelectedDate((prev) => {
            const next = new Date(prev);
            next.setDate(prev.getDate() + direction);
            if (isAfterDay(next, new Date())) {
                return prev;
            }
            return next;
        });
    };

    // Summary counts
    const summary = useMemo(() => {
        const counts = { present: 0, absent: 0, tardy: 0, tardy_excused: 0, absent_excused: 0 };
        for (const status of Object.values(studentAttendance)) {
            if (counts[status] !== undefined) counts[status]++;
        }
        return counts;
    }, [studentAttendance]);

    // Current period detection
    const currentPeriodId = useMemo(() => {
        if (!isSelectedDateToday) return null;
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        for (const item of periodsData) {
            const [sh, sm] = (item.period?.startTime || '').split(':').map(Number);
            const [eh, em] = (item.period?.endTime || '').split(':').map(Number);
            if (nowMinutes >= sh * 60 + sm && nowMinutes < eh * 60 + em) {
                return item.period?._id;
            }
        }
        return null;
    }, [isSelectedDateToday, periodsData]);

    if (loading) {
        return (
            <div className="teacher-attendance-page">
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="teacher-attendance-page">
            <div className="page-header">
                <div>
                    <h1>
                        <HiOutlineClipboardCheck size={24} />
                        Attendance
                    </h1>
                    <div className="today-date">{selectedDateStr}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => handleChangeDay(-1)}>
                        <HiOutlineChevronLeft size={18} />
                        Previous
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => handleChangeDay(1)}
                        disabled={!canGoNextDay}
                    >
                        Next
                        <HiOutlineChevronRight size={18} />
                    </button>
                    <button className="btn btn-secondary" onClick={() => fetchPeriodsForDate(selectedDate)}>
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

            {success && (
                <div className="success-banner">
                    <HiOutlineCheckCircle size={20} />
                    <span>{success}</span>
                </div>
            )}

            {periodsData.length === 0 ? (
                <div className="empty-attendance">
                    <p>No periods configured for this day.</p>
                    <p style={{ fontSize: '0.8rem' }}>Contact your school admin to set up the timetable.</p>
                </div>
            ) : (
                <>
                    {/* Period list */}
                    <div className="period-list">
                        {periodsData.map((item) => {
                            const period = item.period;
                            const isSelected = selectedPeriod?.period?._id === period._id;
                            const isCurrent = currentPeriodId === period._id;

                            return (
                                <div
                                    key={period._id}
                                    className={`period-row ${item.hasClass ? 'has-class' : 'no-class'} ${isSelected ? 'active' : ''}`}
                                    onClick={() => item.hasClass && handleSelectPeriod(item)}
                                >
                                    <div className="period-number">
                                        {period.order || '#'}
                                    </div>

                                    <div className="period-info">
                                        <div className="period-name">
                                            {period.name}
                                            {isCurrent && (
                                                <span style={{ marginLeft: 8, fontSize: '0.68rem', color: '#3b82f6', fontWeight: 500 }}>
                                                    (now)
                                                </span>
                                            )}
                                        </div>
                                        <div className="period-time">
                                            <HiOutlineClock size={13} style={{ verticalAlign: -2 }} /> {period.startTime} - {period.endTime}
                                        </div>
                                    </div>

                                    {item.hasClass ? (
                                        <div className="period-class-info">
                                            <span className="class-name">{item.assignment?.class?.name}</span>
                                            <span className="subject-name">{item.assignment?.subject?.name || ''}</span>
                                            {item.isSubstitute && (
                                                <span className="sub-badge">SUB</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="no-class-label">No class</span>
                                    )}

                                    <div className="period-status">
                                        {item.attendanceStatus ? (
                                            <div className="attendance-done-info">
                                                <span className="attendance-badge done">
                                                    <HiOutlineCheckCircle size={14} />
                                                    Done
                                                </span>
                                                {item.attendanceStatus.takenBy && (
                                                    <span className="taken-by-label">
                                                        by {item.attendanceStatus.takenBy}
                                                    </span>
                                                )}
                                            </div>
                                        ) : item.hasClass ? (
                                            <span className="attendance-badge pending">Pending</span>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Student attendance panel */}
                    {selectedPeriod && (
                        <div className="attendance-panel">
                            <div className="attendance-panel-header">
                                <div>
                                    <h2>
                                        <HiOutlineUserGroup size={20} />
                                        {selectedPeriod.assignment?.class?.name} — {selectedPeriod.period?.name}
                                        {selectedPeriod.isSubstitute && (
                                            <span className="sub-badge" style={{ marginLeft: 8, fontSize: '0.7rem' }}>Substituting</span>
                                        )}
                                    </h2>
                                    <div className="panel-subtitle">
                                        {selectedPeriod.assignment?.subject?.name || 'No subject'} · {students.length} students
                                    </div>
                                </div>
                                <div className="quick-actions">
                                    <button
                                        className="all-present"
                                        onClick={() => setAllStatus('present')}
                                        disabled={isReadOnlySelectedPeriod}
                                    >
                                        All Present
                                    </button>
                                    <button
                                        onClick={() => setAllStatus('absent')}
                                        disabled={isReadOnlySelectedPeriod}
                                    >
                                        All Absent
                                    </button>
                                </div>
                            </div>

                            {isReadOnlySelectedPeriod && (
                                <div className="error-banner" style={{ marginBottom: 10 }}>
                                    <HiOutlineExclamation size={20} />
                                    <span>
                                        Read-only: attendance was submitted by substitute teacher
                                        {selectedPeriod?.attendanceStatus?.takenBy
                                            ? ` (${selectedPeriod.attendanceStatus.takenBy})`
                                            : ''}.
                                    </span>
                                </div>
                            )}

                            {loadingStudents ? (
                                <div className="loading-overlay" style={{ minHeight: 120 }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : students.length === 0 ? (
                                <div className="empty-attendance" style={{ padding: '30px 20px' }}>
                                    <p>No students found in this class.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="student-list">
                                        {students.map((student, idx) => {
                                            const currentStatus = studentAttendance[student._id] || 'present';
                                            return (
                                                <div key={student._id} className="student-row">
                                                    <div className="student-index">{idx + 1}</div>
                                                    <div className="student-name">
                                                        {student.user?.firstName || student.firstName} {student.user?.lastName || student.lastName}
                                                    </div>
                                                    <div className="status-buttons">
                                                        {STATUS_OPTIONS.map(opt => (
                                                            <button
                                                                key={opt.key}
                                                                className={`status-btn ${currentStatus === opt.key ? `active-${opt.key}` : ''}`}
                                                                disabled={isReadOnlySelectedPeriod}
                                                                onClick={() => setStudentAttendance(prev => ({
                                                                    ...prev,
                                                                    [student._id]: opt.key
                                                                }))}
                                                                title={opt.label}
                                                            >
                                                                {opt.short}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="attendance-panel-footer">
                                        <div className="attendance-summary-inline">
                                            <div className="stat"><span className="dot present"></span> {summary.present} Present</div>
                                            <div className="stat"><span className="dot absent"></span> {summary.absent} Absent</div>
                                            <div className="stat"><span className="dot tardy"></span> {summary.tardy + summary.tardy_excused} Tardy</div>
                                            <div className="stat"><span className="dot excused"></span> {summary.absent_excused + summary.tardy_excused} Excused</div>
                                        </div>
                                        <button
                                            className="btn btn-success"
                                            onClick={handleSubmit}
                                            disabled={saving || students.length === 0 || isReadOnlySelectedPeriod}
                                        >
                                            {saving ? 'Saving...' : 'Save Attendance'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

function startOfDay(dateValue) {
    const date = new Date(dateValue);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isBeforeDay(dateA, dateB) {
    return startOfDay(dateA).getTime() < startOfDay(dateB).getTime();
}

function isAfterDay(dateA, dateB) {
    return startOfDay(dateA).getTime() > startOfDay(dateB).getTime();
}

function isSameDay(dateA, dateB) {
    return startOfDay(dateA).getTime() === startOfDay(dateB).getTime();
}

function formatDayKey(dateValue) {
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default TeacherAttendanceNewPage;
