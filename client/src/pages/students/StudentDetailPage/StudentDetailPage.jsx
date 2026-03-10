import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    fetchStudent,
    selectCurrentStudent,
    selectStudentsLoading,
    uploadStudentPhoto,
    removeStudentPhoto
} from '../../../store/slices/studentSlice';
import { sendDailyReport, selectNotificationSending } from '../../../store/slices/notificationSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import AIReportModal from '../../../components/reports/AIReportModal';
import StudentOverviewHeader from './components/StudentOverviewHeader';
import StudentInformationGrid from './components/StudentInformationGrid';
import StudentInsightsSection from './components/StudentInsightsSection';
import useStudentAcademicInsights from './hooks/useStudentAcademicInsights';
import { buildRequestedLanguages, toLegacyLanguageValue } from '../../../constants/aiLanguages';
import './StudentDetailPage.css';

const StudentDetailPage = () => {
    const { t } = useTranslation(['students']);
    const { id } = useParams();
    const dispatch = useDispatch();
    const student = useSelector(selectCurrentStudent);
    const loading = useSelector(selectStudentsLoading);
    const sending = useSelector(selectNotificationSending);
    const isAdmin = useSelector(selectIsAdmin);
    const currentAcademicYear = useSelector(selectCurrentAcademicYear);
    const [showAIReportModal, setShowAIReportModal] = useState(false);
    const [generatingAIReport, setGeneratingAIReport] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);
    const [generatedReportContent, setGeneratedReportContent] = useState('');
    const [generatedReportPeriod, setGeneratedReportPeriod] = useState('');
    const [reportGeneratedAt, setReportGeneratedAt] = useState(null);
    const [aiPrimaryLanguage, setAiPrimaryLanguage] = useState('en');
    const [aiSecondaryLanguage, setAiSecondaryLanguage] = useState('');
    const [schoolYearFilter, setSchoolYearFilter] = useState('');
    const [semesterFilter, setSemesterFilter] = useState('');

    const {
        loading: insightsLoading,
        error: insightsError,
        overview,
        subjectPerformanceData,
        assignmentRows,
        grades: insightGrades,
        gradingScale,
        schoolYearStartMonth,
        availableAcademicYears
    } = useStudentAcademicInsights(student, {
        schoolYear: schoolYearFilter,
        semester: semesterFilter
    });

    useEffect(() => {
        dispatch(fetchStudent(id));
    }, [dispatch, id]);

    useEffect(() => {
        setGeneratedReportContent('');
        setGeneratedReportPeriod('');
        setReportGeneratedAt(null);
    }, [id]);

    useEffect(() => {
        const fallbackYear = student?.academicYear || currentAcademicYear || 'all';
        setSchoolYearFilter(fallbackYear);
        setSemesterFilter('');
    }, [id, student?.academicYear, currentAcademicYear]);

    const schoolYearOptions = useMemo(() => {
        const years = Array.from(new Set([
            ...(Array.isArray(availableAcademicYears) ? availableAcademicYears : []),
            student?.academicYear,
            currentAcademicYear
        ].filter(Boolean))).sort();
        return ['all', ...years];
    }, [availableAcademicYears, student?.academicYear, currentAcademicYear]);

    const handleSendDailyReport = async () => {
        const result = await dispatch(sendDailyReport({
            studentId: id,
            date: format(new Date(), 'yyyy-MM-dd')
        }));

        if (sendDailyReport.fulfilled.match(result)) {
            toast.success(t('detail.toast.dailyReportSent'));
        } else {
            toast.error(result.payload || t('detail.toast.dailyReportFailed'));
        }
    };

    const handleGenerateAIReport = async (payload, periodType) => {
        setGeneratingAIReport(true);
        try {
            const requestedLanguages = buildRequestedLanguages(aiPrimaryLanguage, aiSecondaryLanguage);
            const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
            const endpoint = periodType === 'predefined' 
                ? '/reports/generate-predefined'
                : '/reports/generate-ai-range';
            
            const reportResponse = await api.post(endpoint, {
                studentId: id,
                language: toLegacyLanguageValue(normalizedRequestedLanguages),
                requestedLanguages: normalizedRequestedLanguages,
                primaryLanguage: aiPrimaryLanguage,
                secondaryLanguage: aiSecondaryLanguage,
                ...payload
            });

            if (!reportResponse.data.success) {
                throw new Error(reportResponse.data.message || t('detail.toast.reportGenerateFailed'));
            }

            const { report, period } = reportResponse.data.data;
            setGeneratedReportContent(report);
            setGeneratedReportPeriod(period || t('detail.report.customPeriod'));
            setReportGeneratedAt(new Date().toISOString());
            toast.success(t('detail.toast.reportGenerated'));
        } catch (error) {
            console.error('Error in AI report generation:', error);
            toast.error(error.response?.data?.message || error.message || t('detail.toast.reportGenerateFailed'));
            throw error;
        } finally {
            setGeneratingAIReport(false);
        }
    };

    const handleSendAIReport = async (reportContent) => {
        try {
            const sendResponse = await api.post(`/notifications/send-ai-report/${id}`, {
                reportContent,
                period: generatedReportPeriod || t('detail.report.customPeriod')
            });

            if (!sendResponse.data.success) {
                throw new Error(sendResponse.data.message || t('detail.toast.reportSendFailed'));
            }

            toast.success(t('detail.toast.reportSent'));
            setShowAIReportModal(false);
            setGeneratedReportContent('');
            setGeneratedReportPeriod('');
            setReportGeneratedAt(null);
        } catch (error) {
            console.error('Error sending AI report:', error);
            toast.error(error.response?.data?.message || error.message || t('detail.toast.reportSendFailed'));
            throw error;
        }
    };

    const handleUploadStudentPhoto = async (file) => {
        if (!file || !student?._id) return;
        setPhotoUploading(true);
        const result = await dispatch(uploadStudentPhoto({ id: student._id, file }));
        setPhotoUploading(false);

        if (uploadStudentPhoto.fulfilled.match(result)) {
            toast.success(t('detail.toast.photoUpdated'));
        } else {
            toast.error(result.payload || t('detail.toast.photoUpdateFailed'));
        }
    };

    const handleRemoveStudentPhoto = async () => {
        if (!student?._id) return;
        setPhotoUploading(true);
        const result = await dispatch(removeStudentPhoto(student._id));
        setPhotoUploading(false);

        if (removeStudentPhoto.fulfilled.match(result)) {
            toast.success(t('detail.toast.photoRemoved'));
        } else {
            toast.error(result.payload || t('detail.toast.photoRemoveFailed'));
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!student) {
        return (
            <div className="not-found">
                <h2>{t('detail.errors.studentNotFound')}</h2>
                <Link to="/portal/students" className="btn btn-secondary">{t('detail.actions.backToStudents')}</Link>
            </div>
        );
    }

    return (
        <div className="student-detail-page-wrapper">
            <div className="student-detail-page">
                <Link to="/portal/students" className="student-back-link">
                    {t('detail.actions.backToStudents')}
                </Link>

                <StudentOverviewHeader
                    student={student}
                    isAdmin={isAdmin}
                    sending={sending}
                    generatingAIReport={generatingAIReport}
                    photoUploading={photoUploading}
                    onSendDailyReport={handleSendDailyReport}
                    onOpenAIReport={() => setShowAIReportModal(true)}
                    onUploadStudentPhoto={handleUploadStudentPhoto}
                    onRemoveStudentPhoto={handleRemoveStudentPhoto}
                />

                <StudentInsightsSection
                    loading={insightsLoading}
                    error={insightsError}
                    overview={overview}
                    subjectPerformanceData={subjectPerformanceData}
                    grades={insightGrades}
                    gradingScale={gradingScale}
                    academicYear={schoolYearFilter}
                    academicYearStartMonth={schoolYearStartMonth}
                    assignmentRows={assignmentRows}
                    schoolYearFilter={schoolYearFilter}
                    semesterFilter={semesterFilter}
                    schoolYearOptions={schoolYearOptions}
                    onSchoolYearChange={setSchoolYearFilter}
                    onSemesterChange={setSemesterFilter}
                />

                <StudentInformationGrid student={student} />
            </div>

            <AIReportModal
                isOpen={showAIReportModal}
                onClose={() => setShowAIReportModal(false)}
                onGenerate={handleGenerateAIReport}
                onSendReport={handleSendAIReport}
                studentName={`${student.firstName} ${student.lastName}`}
                reportContent={generatedReportContent}
                timestamp={reportGeneratedAt}
                primaryLanguage={aiPrimaryLanguage}
                secondaryLanguage={aiSecondaryLanguage}
                onPrimaryLanguageChange={setAiPrimaryLanguage}
                onSecondaryLanguageChange={setAiSecondaryLanguage}
            />
        </div>
    );
};

export default StudentDetailPage;
