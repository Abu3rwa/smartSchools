import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX } from '../constants.js';

/**
 * Recent students list. Uses existing CSS: admin-students-list, admin-student-item, admin-student-avatar, etc.
 */
export default function RecentStudentsCard({ students }) {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';
    const list = Array.isArray(students) ? students.slice(0, 5) : [];

    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    {t('adminDashboard:recentStudents.title')}
                </Typography>
                <Link to="/portal/students" className="btn-link">
                    {t('adminDashboard:common.viewAll')} <HiOutlineArrowRight size={16} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                </Link>
            </Box>
            <div className="admin-students-list">
                {list.map((student) => (
                    <Link
                        key={student._id}
                        to={`/portal/students/${student._id}`}
                        className="admin-student-item"
                    >
                        <div className="admin-student-avatar">
                            {student.firstName?.charAt(0)}
                            {student.lastName?.charAt(0)}
                        </div>
                        <div className="admin-student-info">
                            <span className="admin-student-name">
                                {student.firstName} {student.lastName}
                            </span>
                            <span className="admin-student-id">{student.studentId}</span>
                        </div>
                        <span className="admin-student-class">
                            {student.currentClass?.name || t('adminDashboard:common.unassigned')}
                        </span>
                    </Link>
                ))}
                {list.length === 0 && (
                    <p className="admin-empty-text">{t('adminDashboard:recentStudents.empty')}</p>
                )}
            </div>
        </Box>
    );
}
