import { HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AttendanceDetailsModal = ({ formatDateTime, onClose, selectedAttendance, show }) => {
    const { t } = useTranslation(['adminAttendance', 'common']);
    if (!show || !selectedAttendance) {
        return null;
    }

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h2>{t('adminAttendance:details.title')}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <HiOutlineX size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="attendance-details">
                        <h3>{selectedAttendance.schedule.title}</h3>
                        <div className="schedule-info">
                            <p>
                                <strong>{t('adminAttendance:details.teacher')}</strong>{' '}
                                {selectedAttendance.schedule.teacher
                                    ? `${selectedAttendance.schedule.teacher.firstName || ''} ${selectedAttendance.schedule.teacher.lastName || ''}`.trim()
                                    : t('adminAttendance:common.dash')}
                            </p>
                            <p>
                                <strong>{t('adminAttendance:details.class')}</strong> {selectedAttendance.schedule.class?.name ?? t('adminAttendance:common.dash')}
                            </p>
                            <p>
                                <strong>{t('adminAttendance:details.subject')}</strong> {selectedAttendance.schedule.subject?.name ?? t('adminAttendance:common.dash')}
                            </p>
                            <p>
                                <strong>{t('adminAttendance:details.room')}</strong> {selectedAttendance.schedule.room ?? t('adminAttendance:common.dash')}
                            </p>
                            <p>
                                <strong>{t('adminAttendance:details.time')}</strong>{' '}
                                {formatDateTime(selectedAttendance.schedule.startTime)} -{' '}
                                {formatDateTime(selectedAttendance.schedule.endTime)}
                            </p>
                        </div>

                        <div className="attendance-summary">
                            <h4>{t('adminAttendance:details.summaryTitle')}</h4>
                            <div className="summary-stats">
                                <div className="summary-item">
                                    <span className="label">{t('adminAttendance:details.totalStudents')}</span>
                                    <span className="value">{selectedAttendance.totalStudents}</span>
                                </div>
                                <div className="summary-item present">
                                    <span className="label">{t('adminAttendance:details.present')}</span>
                                    <span className="value">{selectedAttendance.present}</span>
                                </div>
                                <div className="summary-item absent">
                                    <span className="label">{t('adminAttendance:details.absent')}</span>
                                    <span className="value">{selectedAttendance.absent}</span>
                                </div>
                                <div className="summary-item late">
                                    <span className="label">{t('adminAttendance:details.late')}</span>
                                    <span className="value">{selectedAttendance.late}</span>
                                </div>
                                <div className="summary-item rate">
                                    <span className="label">{t('adminAttendance:details.attendanceRate')}</span>
                                    <span className="value">{selectedAttendance.attendanceRate}%</span>
                                </div>
                            </div>
                        </div>

                        {selectedAttendance.attendanceRecorded && selectedAttendance.recordedBy && (
                            <div className="recorded-details">
                                <h4>{t('adminAttendance:details.recordingDetails')}</h4>
                                <p>
                                    <strong>{t('adminAttendance:details.recordedBy')}</strong> {selectedAttendance.recordedBy.firstName}{' '}
                                    {selectedAttendance.recordedBy.lastName}
                                </p>
                                <p>
                                    <strong>{t('adminAttendance:details.recordedAt')}</strong>{' '}
                                    {formatDateTime(selectedAttendance.recordedAt)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        {t('common:actions.close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceDetailsModal;
