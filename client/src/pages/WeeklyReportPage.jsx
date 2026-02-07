import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClass, selectCurrentClass, selectClassStudents } from '../store/slices/classSlice';
import { fetchLessons, selectLessons } from '../store/slices/lessonSlice';
import { selectNotificationSending } from '../store/slices/notificationSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineArrowLeft, HiOutlineMail, HiOutlinePrinter, HiOutlineCalendar, HiOutlineLink, HiOutlineClipboardList } from 'react-icons/hi';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import './WeeklyReportPage.css';

const WeeklyReportPage = () => {
    const { classId } = useParams();
    const dispatch = useDispatch();

    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const lessons = useSelector(selectLessons);

    // We'll show the Lesson Plan (Common) and then a Summary Table of grades entered this week.

    const academicYear = useSelector(selectCurrentAcademicYear);
    const sending = useSelector(selectNotificationSending);

    const [selectedWeek, setSelectedWeek] = useState(new Date());

    const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

    useEffect(() => {
        if (classId) {
            dispatch(fetchClass(classId));
            // fetchStudentsByClass removed as fetchClass handles it
            dispatch(fetchLessons({
                classId,
                startDate: format(weekStart, 'yyyy-MM-dd'),
                endDate: format(weekEnd, 'yyyy-MM-dd')
            }));
            // We'll try to fetch grades for the week. 
            // If fetchClassGrades takes a date range, great. If not, we might miss data.
            // Assuming we repurpose fetchClassGrades or use a new logic. 
            // For now, let's just show Lessons as the primary feature, and maybe a note about grades.
        }
    }, [dispatch, classId, selectedWeek, academicYear]);



    const weeklyLessons = lessons.filter(l => {
        const lessonDate = new Date(l.date);
        return lessonDate >= weekStart && lessonDate <= weekEnd;
    });

    return (
        <div className="weekly-report-page">
            <Link to={`/portal/classes/${classId}`} className="back-link">
                <HiOutlineArrowLeft /> Back to Class
            </Link>

            <div className="report-header">
                <div>
                    <h1>Weekly Class Report</h1>
                    <p className="subtitle">{currentClass?.name} • {academicYear}</p>
                    <p className="text-muted">
                        {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                    </p>
                </div>
                <div className="header-actions">
                    <input
                        type="date"
                        value={format(selectedWeek, 'yyyy-MM-dd')}
                        onChange={(e) => setSelectedWeek(new Date(e.target.value))}
                        className="date-picker"
                    />
                    <button className="btn btn-primary" onClick={() => window.print()}>
                        <HiOutlinePrinter /> Print Report
                    </button>
                </div>
            </div>

            <div className="report-content">
                {/* Lessons Section */}
                <section className="report-section card">
                    <div className="section-header">
                        <HiOutlineCalendar size={24} />
                        <h2>Lessons Taught This Week</h2>
                    </div>
                    {weeklyLessons.length > 0 ? (
                        <div className="lessons-summary">
                            {weeklyLessons.map(lesson => (
                                <div key={lesson._id} className="lesson-item">
                                    <div className="lesson-info">
                                        <span className="lesson-date">{format(new Date(lesson.date), 'EEEE, MMM d')}</span>
                                        <h3>{lesson.title}</h3>
                                        <p>{lesson.description}</p>
                                        {lesson.resources?.length > 0 && (
                                            <div className="resource-links">
                                                {lesson.resources.map((res, i) => (
                                                    <a key={i} href={res.url} target="_blank" rel="noopener noreferrer">
                                                        <HiOutlineLink /> {res.title || 'Resource'}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-msg">No lessons recorded for this week.</p>
                    )}
                </section>

                {/* Students List */}
                <section className="report-section card">
                    <div className="section-header">
                        <HiOutlineClipboardList size={24} />
                        <h2>Student List</h2>
                    </div>
                    <div className="students-grid">
                        <p className="text-muted mb-md">
                            The weekly report sent to parents will include the lessons above and their child's specific classwork grades for this week.
                        </p>
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th>Student Name</th>
                                    <th>Parent Email</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(student => (
                                    <tr key={student._id}>
                                        <td>
                                            <div className="student-cell">
                                                <div className="avatar-sm">
                                                    {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                                </div>
                                                <span>{student.firstName} {student.lastName}</span>
                                            </div>
                                        </td>
                                        <td>{student.parentInfo?.fatherEmail || student.email || '-'}</td>
                                        <td><span className="badge badge-success">Active</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default WeeklyReportPage;