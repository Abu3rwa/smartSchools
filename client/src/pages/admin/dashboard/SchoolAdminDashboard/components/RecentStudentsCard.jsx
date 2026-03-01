import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX } from '../constants.js';

/**
 * Recent students list. Uses existing CSS: admin-students-list, admin-student-item, admin-student-avatar, etc.
 */
export default function RecentStudentsCard({ students }) {
    const list = Array.isArray(students) ? students.slice(0, 5) : [];

    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    Recent Students
                </Typography>
                <Link to="/portal/students" className="btn-link">
                    View All <HiOutlineArrowRight size={16} />
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
                            {student.currentClass?.name || 'Unassigned'}
                        </span>
                    </Link>
                ))}
                {list.length === 0 && (
                    <p className="admin-empty-text">No students found.</p>
                )}
            </div>
        </Box>
    );
}
