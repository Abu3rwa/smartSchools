import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchStudent, selectCurrentStudent } from '../store/slices/studentSlice';
import { fetchStudentGradeReport, selectGradeReport, selectGradesLoading } from '../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { sendMonthlyReport, selectNotificationSending } from '../store/slices/notificationSlice';
import { HiOutlineArrowLeft, HiOutlineMail, HiOutlineDownload } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './GradeReportPage.css';

const GradeReportPage = () => {
    const { studentId } = useParams();
    const dispatch = useDispatch();
    const student = useSelector(selectCurrentStudent);
    const report = useSelector(selectGradeReport);
    const loading = useSelector(selectGradesLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const sending = useSelector(selectNotificationSending);

    useEffect(() => {
        dispatch(fetchStudent(studentId));
        dispatch(fetchStudentGradeReport({ studentId, academicYear }));
    }, [dispatch, studentId, academicYear]);

    const handleSendReport = async () => {
        const currentMonth = new Date().getMonth() + 1;
        const result = await dispatch(sendMonthlyReport({
            studentId,
            month: currentMonth,
            academicYear
        }));

        if (sendMonthlyReport.fulfilled.match(result)) {
            toast.success('Report sent to parent successfully!');
        } else {
            toast.error(result.payload || 'Failed to send report');
        }
    };

    const getGradeClass = (percentage) => {
        if (percentage >= 90) return 'grade-a-plus';
        if (percentage >= 80) return 'grade-a';
        if (percentage >= 70) return 'grade-b-plus';
        if (percentage >= 60) return 'grade-b';
        if (percentage >= 50) return 'grade-c-plus';
        if (percentage >= 40) return 'grade-c';
        return 'grade-f';
    };

    const getLetterGrade = (percentage) => {
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C+';
        if (percentage >= 40) return 'C';
        return 'F';
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="grade-report-page">
            <Link to={`/portal/students/${studentId}`} className="back-link">
                <HiOutlineArrowLeft />
                Back to Student
            </Link>

            {/* Header */}
            <div className="report-header">
                <div className="student-info">
                    <div className="avatar-lg">
                        {student?.firstName?.charAt(0)}{student?.lastName?.charAt(0)}
                    </div>
                    <div>
                        <h1>Grade Report</h1>
                        <p className="student-name">{student?.firstName} {student?.lastName}</p>
                        <p className="meta-info">
                            {student?.studentId} • {student?.currentClass?.name} • {academicYear}
                        </p>
                    </div>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={handleSendReport}
                        disabled={sending}
                    >
                        <HiOutlineMail />
                        {sending ? 'Sending...' : 'Send to Parent'}
                    </button>
                    <button className="btn btn-primary">
                        <HiOutlineDownload />
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Overall Average */}
            {report?.report && (
                <div className="overall-card card">
                    <div className="overall-content">
                        <div className="overall-grade">
                            <span className={`grade-value ${getGradeClass(parseFloat(report.report.overallAverage))}`}>
                                {report.report.overallAverage}%
                            </span>
                            <span className="grade-letter">
                                {getLetterGrade(parseFloat(report.report.overallAverage))}
                            </span>
                        </div>
                        <div className="overall-info">
                            <h3>Overall Average</h3>
                            <p className="text-muted">
                                Based on all subjects for {academicYear}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Subject Performance */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Subject Performance</h3>
                </div>
                <div className="subjects-grid">
                    {report?.report?.subjects?.map((subject, index) => (
                        <div key={index} className="subject-card">
                            <div className="subject-header">
                                <h4>{subject.subjectName}</h4>
                                <span className="subject-code">{subject.subjectCode}</span>
                            </div>
                            <div className="subject-grades">
                                <div className="grade-item">
                                    <span className="label">Overall</span>
                                    <span className={`value ${getGradeClass(parseFloat(subject.overallAverage))}`}>
                                        {subject.overallAverage || 0}%
                                    </span>
                                </div>
                                <div className="grade-item">
                                    <span className="label">Semester 1</span>
                                    <span className="value">{subject.semester1Average || 0}%</span>
                                </div>
                                <div className="grade-item">
                                    <span className="label">Semester 2</span>
                                    <span className="value">{subject.semester2Average || 0}%</span>
                                </div>
                            </div>
                            {/* Monthly breakdown */}
                            <div className="monthly-breakdown">
                                <h5>Monthly Averages</h5>
                                <div className="months-grid">
                                    {Object.entries(subject.monthlyAverages || {}).map(([month, data]) => (
                                        <div key={month} className="month-item">
                                            <span className="month-name">
                                                {new Date(2024, parseInt(month) - 1).toLocaleString('default', { month: 'short' })}
                                            </span>
                                            <span className={`month-value ${getGradeClass(parseFloat(data.average))}`}>
                                                {data.average}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {(!report?.report?.subjects || report.report.subjects.length === 0) && (
                    <div className="empty-state">
                        <p>No grades recorded for this student yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GradeReportPage;
