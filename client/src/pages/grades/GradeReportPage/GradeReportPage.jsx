import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentStudent } from '../../../store/slices/studentSlice';
import { selectGradeReport, selectGradesLoading } from '../../../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectNotificationSending } from '../../../store/slices/notificationSlice';
import GradeReportHeader from './components/GradeReportHeader';
import OverallAverageCard from './components/OverallAverageCard';
import SubjectPerformanceGrid from './components/SubjectPerformanceGrid';
import useGradeReportPageData from './hooks/useGradeReportPageData';
import './GradeReportPage.css';

const GradeReportPage = () => {
    const { studentId } = useParams();
    const student = useSelector(selectCurrentStudent);
    const report = useSelector(selectGradeReport);
    const loading = useSelector(selectGradesLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const sending = useSelector(selectNotificationSending);

    const { handleSendReport } = useGradeReportPageData({ studentId, academicYear });

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="grade-report-page">
            <GradeReportHeader
                studentId={studentId}
                student={student}
                academicYear={academicYear}
                sending={sending}
                onSendReport={handleSendReport}
            />

            <OverallAverageCard report={report?.report} academicYear={academicYear} />

            <SubjectPerformanceGrid subjects={report?.report?.subjects || []} />
        </div>
    );
};

export default GradeReportPage;
