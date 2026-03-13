import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation(['students']);
    if (!student) return null;
    const weeklyReportClassId = student.currentClass?._id || student.currentClass || '';

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
                                label={t('detail.overview.studentPhoto')}
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
                        <p className="student-id">{student.studentId || t('detail.overview.noStudentId')}</p>
                        <p className="student-subline">
                            {student.currentClass?.name || t('detail.overview.unassignedClass')} • {student.academicYear || t('detail.overview.noAcademicYear')}
                        </p>
                        <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                            {student.status ? t(`status.${String(student.status).toLowerCase()}`, { defaultValue: student.status }) : t('detail.overview.statusUnknown')}
                        </span>
                    </div>
                </div>

                
            </div>
            <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={onSendDailyReport}
                        disabled={sending}
                        title={t('detail.overview.actions.sendDailyReportTitle')}
                    >
                        <HiOutlineClipboardList />
                        {sending ? t('detail.overview.actions.sending') : t('detail.overview.actions.sendDailyClasswork')}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={onOpenAIReport}
                        disabled={generatingAIReport}
                        title={t('detail.overview.actions.generateAiReportTitle')}
                    >
                        <HiOutlineDocumentText />
                        {generatingAIReport ? t('detail.overview.actions.generating') : t('detail.overview.actions.generateAiReport')}
                    </button>
                    {weeklyReportClassId ? (
                        <Link to={`/portal/grades/weekly/class/${weeklyReportClassId}`} className="btn btn-secondary">
                            <HiOutlineClock />
                            {t('detail.overview.actions.weeklyFullReport')}
                        </Link>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled
                            title={t('detail.overview.unassignedClass')}
                        >
                            <HiOutlineClock />
                            {t('detail.overview.actions.weeklyFullReport')}
                        </button>
                    )}
                    <Link to={`/portal/grades/report/${student._id}`} className="btn btn-primary">
                        <HiOutlineChartBar />
                        {t('detail.overview.actions.viewGradeReport')}
                    </Link>
                    <Link to={`/portal/grades/student/${student._id}`} className="btn btn-secondary">
                        <HiOutlineClipboardList />
                        {t('detail.overview.actions.viewGradebook')}
                    </Link>
                </div>
        </div>
    );
};

export default StudentOverviewHeader;
