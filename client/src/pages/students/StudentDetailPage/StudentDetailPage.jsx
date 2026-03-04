import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchStudent,
    selectCurrentStudent,
    selectStudentsLoading,
    uploadStudentPhoto,
    removeStudentPhoto
} from '../../../store/slices/studentSlice';
import { sendDailyReport, selectNotificationSending } from '../../../store/slices/notificationSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import { HiOutlineArrowLeft, HiOutlineMail, HiOutlinePhone, HiOutlineChartBar, HiOutlineClipboardList, HiOutlineDocumentText, HiOutlineClock } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import AIReportModal from '../../../components/reports/AIReportModal';
import ImageUploader from '../../../components/shared/ImageUploader';
import './StudentDetailPage.css';

const StudentDetailPage = () => {
    const { id } = useParams();
    const dispatch = useDispatch();
    const student = useSelector(selectCurrentStudent);
    const loading = useSelector(selectStudentsLoading);
    const sending = useSelector(selectNotificationSending);
    const isAdmin = useSelector(selectIsAdmin);
    const [showAIReportModal, setShowAIReportModal] = useState(false);
    const [generatingAIReport, setGeneratingAIReport] = useState(false);
    const [photoUploading, setPhotoUploading] = useState(false);

    useEffect(() => {
        dispatch(fetchStudent(id));
    }, [dispatch, id]);

    const handleSendDailyReport = async () => {
        const result = await dispatch(sendDailyReport({
            studentId: id,
            date: format(new Date(), 'yyyy-MM-dd')
        }));

        if (sendDailyReport.fulfilled.match(result)) {
            toast.success('Daily classwork report sent!');
        } else {
            toast.error(result.payload || 'Failed to send daily report');
        }
    };

    const handleGenerateAndSendAIReport = async (payload, periodType) => {
        setGeneratingAIReport(true);
        try {
            // Step 1: Generate the AI report
            const endpoint = periodType === 'predefined' 
                ? '/reports/generate-predefined'
                : '/reports/generate-ai-range';
            
            const reportResponse = await api.post(endpoint, {
                studentId: id,
                ...payload
            });

            if (!reportResponse.data.success) {
                throw new Error(reportResponse.data.message || 'Failed to generate report');
            }

            const { report, period } = reportResponse.data.data;

            // Step 2: Send the report to parent
            const sendResponse = await api.post(`/notifications/send-ai-report/${id}`, {
                reportContent: report,
                period
            });

            if (sendResponse.data.success) {
                toast.success('AI report generated and sent to parent successfully!');
                setShowAIReportModal(false);
            } else {
                throw new Error(sendResponse.data.message || 'Failed to send report');
            }
        } catch (error) {
            console.error('Error in AI report generation/sending:', error);
            toast.error(error.response?.data?.message || error.message || 'Failed to generate/send AI report');
        } finally {
            setGeneratingAIReport(false);
        }
    };

    const handleUploadStudentPhoto = async (file) => {
        if (!file || !student?._id) return;
        setPhotoUploading(true);
        const result = await dispatch(uploadStudentPhoto({ id: student._id, file }));
        setPhotoUploading(false);

        if (uploadStudentPhoto.fulfilled.match(result)) {
            toast.success('Student photo updated');
        } else {
            toast.error(result.payload || 'Failed to update student photo');
        }
    };

    const handleRemoveStudentPhoto = async () => {
        if (!student?._id) return;
        setPhotoUploading(true);
        const result = await dispatch(removeStudentPhoto(student._id));
        setPhotoUploading(false);

        if (removeStudentPhoto.fulfilled.match(result)) {
            toast.success('Student photo removed');
        } else {
            toast.error(result.payload || 'Failed to remove student photo');
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
                <h2>Student not found</h2>
                <Link to="/portal/students" className="btn btn-secondary">Back to Students</Link>
            </div>
        );
    }

    return (
        <div className="student-detail-page-wrapper">
            <div className="student-detail-page">
                <Link to="/portal/students" className="back-link">
                    <HiOutlineArrowLeft />
                    Back to Students
                </Link>

                <div className="student-header">
                    <div className="student-profile">
                        {isAdmin ? (
                            <div className="student-photo-uploader">
                                <ImageUploader
                                    currentImageUrl={student.photoUrl || null}
                                    onUpload={handleUploadStudentPhoto}
                                    onDelete={handleRemoveStudentPhoto}
                                    isUploading={photoUploading}
                                    label="Student Photo"
                                    shape="circular"
                                />
                            </div>
                        ) : (
                            <div className={`avatar-lg ${student.photoUrl ? 'has-image' : ''}`}>
                                {student.photoUrl ? (
                                    <img
                                        src={student.photoUrl}
                                        alt={`${student.firstName} ${student.lastName}`}
                                    />
                                ) : (
                                    <>{student.firstName?.charAt(0)}{student.lastName?.charAt(0)}</>
                                )}
                            </div>
                        )}
                        <div>
                            <h1>{student.firstName} {student.lastName}</h1>
                            <p className="student-id">{student.studentId}</p>
                            <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                                {student.status}
                            </span>
                        </div>
                    </div>
                    <div className="header-actions">
                        <button 
                            className="btn btn-secondary" 
                            onClick={handleSendDailyReport}
                            disabled={sending}
                            title="Send only Classwork grades for today"
                        >
                            <HiOutlineClipboardList />
                            Send Daily Classwork
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowAIReportModal(true)}
                            disabled={generatingAIReport}
                            title="Generate AI-powered progress report"
                        >
                            <HiOutlineDocumentText />
                            {generatingAIReport ? 'Generating...' : ' Progress Report'}
                        </button>
                        <Link to={`/portal/grades/weekly/${student._id}`} className="btn btn-secondary">
                            <HiOutlineClock />
                            Weekly Full Report
                        </Link>
                        <Link to={`/portal/grades/report/${student._id}`} className="btn btn-primary">
                            <HiOutlineChartBar />
                            View Grade Report
                        </Link>
                        <Link to={`/portal/grades/student/${student._id}`} className="btn btn-secondary">
                            <HiOutlineClipboardList />
                            View Gradebook
                        </Link>
                    </div>
                </div>

                <div className="detail-grid">
                    {/* Personal Info */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Personal Information</h3>
                        </div>
                        <div className="info-list">
                            <div className="info-item">
                                <span className="info-label">Date of Birth</span>
                                <span className="info-value">
                                    {student.dateOfBirth ? format(new Date(student.dateOfBirth), 'MMMM d, yyyy') : 'N/A'}
                                </span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Age</span>
                                <span className="info-value">{student.age || 'N/A'} years</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Gender</span>
                                <span className="info-value text-capitalize">{student.gender}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Class</span>
                                <span className="info-value">{student.currentClass?.name || 'Unassigned'}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Academic Year</span>
                                <span className="info-value">{student.academicYear}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Enrollment Date</span>
                                <span className="info-value">
                                    {student.enrollmentDate ? format(new Date(student.enrollmentDate), 'MMMM d, yyyy') : 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Enrollment history */}
                    {student.classEnrollmentHistory?.length > 0 && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Enrollment History</h3>
                            </div>
                            <div className="enrollment-history-table-wrap">
                                <table className="enrollment-history-table">
                                    <thead>
                                        <tr>
                                            <th>Academic Year</th>
                                            <th>Class</th>
                                            <th>Left</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.classEnrollmentHistory.map((entry, idx) => (
                                            <tr key={idx}>
                                                <td>{entry.academicYear}</td>
                                                <td>{entry.class?.name ?? '—'}</td>
                                                <td>{entry.leftAt ? format(new Date(entry.leftAt), 'MMM d, yyyy') : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Parent Info */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Parent/Guardian Information</h3>
                        </div>
                        <div className="parent-cards">
                            {student.parentInfo?.fatherName && (
                                <div className="parent-card">
                                    <h4>Father</h4>
                                    <p className="parent-name">{student.parentInfo.fatherName}</p>
                                    {student.parentInfo.fatherPhone && (
                                        <div className="contact-item">
                                            <HiOutlinePhone />
                                            <span>{student.parentInfo.fatherPhone}</span>
                                        </div>
                                    )}
                                    {student.parentInfo.fatherEmail && (
                                        <div className="contact-item">
                                            <HiOutlineMail />
                                            <span>{student.parentInfo.fatherEmail}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {student.parentInfo?.motherName && (
                                <div className="parent-card">
                                    <h4>Mother</h4>
                                    <p className="parent-name">{student.parentInfo.motherName}</p>
                                    {student.parentInfo.motherPhone && (
                                        <div className="contact-item">
                                            <HiOutlinePhone />
                                            <span>{student.parentInfo.motherPhone}</span>
                                        </div>
                                    )}
                                    {student.parentInfo.motherEmail && (
                                        <div className="contact-item">
                                            <HiOutlineMail />
                                            <span>{student.parentInfo.motherEmail}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Address */}
                    {student.address && (
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">Address</h3>
                            </div>
                            <p className="address-text">
                                {student.address.street && `${student.address.street}, `}
                                {student.address.city && `${student.address.city}, `}
                                {student.address.state && `${student.address.state} `}
                                {student.address.zipCode && student.address.zipCode}
                                {student.address.country && `, ${student.address.country}`}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <AIReportModal
                isOpen={showAIReportModal}
                onClose={() => setShowAIReportModal(false)}
                onGenerate={handleGenerateAndSendAIReport}
                studentName={`${student.firstName} ${student.lastName}`}
            />
        </div>
    );
};

export default StudentDetailPage;
