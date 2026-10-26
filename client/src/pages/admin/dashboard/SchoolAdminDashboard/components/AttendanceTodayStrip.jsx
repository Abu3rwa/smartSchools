import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { formatCount, formatPercent } from '../utils/schoolAdminDashboardPresentation.js';

const SEGMENT_LABEL_KEYS = {
    present: 'today.present',
    late: 'today.late',
    absent: 'today.absent',
};

/**
 * Today's attendance in one line: a proportional bar, the per-status counts and
 * how many classes still have no record.
 */
export default function AttendanceTodayStrip({ attendance, segments, locale }) {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';

    if (!attendance) return null;

    const hasRecords = attendance.totalStudents > 0;

    return (
        <section className="admin-panel admin-today">
            <div className="admin-panel-head">
                <h2 className="admin-panel-title">{t('adminDashboard:today.title')}</h2>
                <Link to="/portal/attendance/admin" className="admin-text-link">
                    {t('adminDashboard:today.openAttendance')}
                    <HiOutlineArrowRight size={15} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                </Link>
            </div>

            <div
                className={`admin-attendance-bar${hasRecords ? '' : ' is-empty'}`}
                role="img"
                aria-label={
                    hasRecords
                        ? t('adminDashboard:metrics.presentOf', {
                            presentCount: formatCount(attendance.present, locale),
                            totalCount: formatCount(attendance.totalStudents, locale),
                        })
                        : t('adminDashboard:metrics.noAttendance')
                }
            >
                {segments.map((segment) => (
                    <span
                        key={segment.key}
                        className={`admin-attendance-segment is-${segment.key}`}
                        style={{ width: `${segment.percent}%` }}
                    />
                ))}
            </div>

            <div className="admin-today-footer">
                <div className="admin-today-counts">
                    {hasRecords ? (
                        ['present', 'late', 'absent'].map((key) => (
                            <span className="admin-today-count" key={key}>
                                <i className={`admin-dot is-${key}`} aria-hidden="true" />
                                <strong>{formatCount(attendance[key], locale)}</strong>
                                {t(`adminDashboard:${SEGMENT_LABEL_KEYS[key]}`)}
                            </span>
                        ))
                    ) : (
                        <span className="admin-today-count is-empty">
                            {t('adminDashboard:today.noRecords')}
                        </span>
                    )}
                </div>

                <div className="admin-today-coverage">
                    <span>
                        {t('adminDashboard:today.recordedClasses', {
                            recordedCount: formatCount(attendance.classesRecorded, locale),
                            totalClasses: formatCount(attendance.classesRecorded + attendance.classesWithoutRecords, locale),
                        })}
                    </span>
                    {attendance.classesWithoutRecords > 0 && (
                        <span className="admin-today-missing">
                            {t('adminDashboard:today.missingClasses', {
                                missingCount: formatCount(attendance.classesWithoutRecords, locale),
                            })}
                        </span>
                    )}
                    {hasRecords && attendance.rate !== null && (
                        <span className="admin-today-rate">{formatPercent(attendance.rate)}</span>
                    )}
                </div>
            </div>
        </section>
    );
}
