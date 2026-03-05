import { Link } from 'react-router-dom';
import {
    HiOutlineChartBar,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocumentText
} from 'react-icons/hi';
import ImageUploader from '../../../../components/shared/ImageUploader';

const StudentOverviewHeader = ({
    student,
    isAdmin,
    sending,
    generatingAIReport,
    photoUploading,
    onSendDailyReport,
    onOpenAIReport,
    onUploadStudentPhoto,
    onRemoveStudentPhoto
}) => {
    if (!student) return null;

    return (
        <div className="student-header-card card">
            <div className="student-header">
                <div className="student-profile">
                    {isAdmin ? (
                        <div className="student-photo-uploader">
                            <ImageUploader
                                currentImageUrl={student.photoUrl || null}
                                onUpload={onUploadStudentPhoto}
                                onDelete={onRemoveStudentPhoto}
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

                    <div className="student-profile-content">
                        <h1>{student.firstName} {student.lastName}</h1>
                        <p className="student-id">{student.studentId || 'No student ID'}</p>
                        <p className="student-subline">
                            {student.currentClass?.name || 'Unassigned Class'} • {student.academicYear || 'No Academic Year'}
                        </p>
                        <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                            {student.status || 'unknown'}
                        </span>
                    </div>
                </div>

                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={onSendDailyReport}
                        disabled={sending}
                        title="Send only classwork grades for today"
                    >
                        <HiOutlineClipboardList />
                        {sending ? 'Sending...' : 'Send Daily Classwork'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={onOpenAIReport}
                        disabled={generatingAIReport}
                        title="Generate AI-powered progress report"
                    >
                        <HiOutlineDocumentText />
                        {generatingAIReport ? 'Generating...' : 'Generate AI Report'}
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
        </div>
    );
};

export default StudentOverviewHeader;
