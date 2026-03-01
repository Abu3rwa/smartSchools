import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX } from '../constants.js';

/**
 * Classes overview list. Uses existing CSS: admin-classes-list, admin-class-item, etc.
 */
export default function ClassesOverviewCard({ classes }) {
    const list = Array.isArray(classes) ? classes.slice(0, 4) : [];

    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    Classes Overview
                </Typography>
                <Link to="/portal/classes" className="btn-link">
                    View All <HiOutlineArrowRight size={16} />
                </Link>
            </Box>
            <div className="admin-classes-list">
                {list.map((cls) => (
                    <Link
                        key={cls._id}
                        to={`/portal/classes/${cls._id}`}
                        className="admin-class-item"
                    >
                        <div className="admin-class-info">
                            <span className="admin-class-name">{cls.name}</span>
                            <span className="admin-class-year">{cls.academicYear}</span>
                        </div>
                        <span className="admin-class-count">
                            {cls.studentCount || 0} students
                        </span>
                    </Link>
                ))}
                {list.length === 0 && (
                    <p className="admin-empty-text">No classes found.</p>
                )}
            </div>
        </Box>
    );
}
