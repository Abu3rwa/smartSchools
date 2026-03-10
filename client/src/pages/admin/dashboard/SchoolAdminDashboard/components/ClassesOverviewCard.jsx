import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight } from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX } from '../constants.js';

/**
 * Classes overview list. Uses existing CSS: admin-classes-list, admin-class-item, etc.
 */
export default function ClassesOverviewCard({ classes }) {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';
    const list = Array.isArray(classes) ? classes.slice(0, 4) : [];

    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    {t('adminDashboard:classesOverview.title')}
                </Typography>
                <Link to="/portal/classes" className="btn-link">
                    {t('adminDashboard:common.viewAll')} <HiOutlineArrowRight size={16} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
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
                            {t('adminDashboard:classesOverview.studentCount', { count: cls.studentCount || 0 })}
                        </span>
                    </Link>
                ))}
                {list.length === 0 && (
                    <p className="admin-empty-text">{t('adminDashboard:classesOverview.empty')}</p>
                )}
            </div>
        </Box>
    );
}
