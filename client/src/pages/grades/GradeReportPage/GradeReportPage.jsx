import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectCurrentStudent } from '../../../store/slices/studentSlice';
import { selectGradeReport, selectGradesLoading } from '../../../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectNotificationSending } from '../../../store/slices/notificationSlice';
import { selectUser } from '../../../store/slices/authSlice';
import {
    getEmailLanguagePreference,
    saveEmailLanguagePreference
} from '../../../utils/emailLanguagePreference';
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
    const user = useSelector(selectUser);
    const [emailLanguage, setEmailLanguage] = useState(() => (
        getEmailLanguagePreference(user?._id || user?.id)
    ));
    const [rememberEmailLanguage, setRememberEmailLanguage] = useState(false);

    const { handleSendReport } = useGradeReportPageData({ studentId, academicYear });
    const handleSendReportWithLanguage = () => {
        if (rememberEmailLanguage) {
            saveEmailLanguagePreference(user?._id || user?.id, emailLanguage);
        }
        return handleSendReport(emailLanguage);
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
            <GradeReportHeader
                studentId={studentId}
                student={student}
                academicYear={academicYear}
                sending={sending}
                emailLanguage={emailLanguage}
                onEmailLanguageChange={setEmailLanguage}
                rememberEmailLanguage={rememberEmailLanguage}
                onRememberEmailLanguageChange={setRememberEmailLanguage}
                onSendReport={handleSendReportWithLanguage}
            />

            <OverallAverageCard report={report?.report} academicYear={academicYear} />

            <SubjectPerformanceGrid subjects={report?.report?.subjects || []} />
        </div>
    );
};

export default GradeReportPage;
