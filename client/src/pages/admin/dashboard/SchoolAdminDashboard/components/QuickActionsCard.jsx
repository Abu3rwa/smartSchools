import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineClipboardList,
    HiOutlineUserGroup,
    HiOutlineChartBar,
    HiOutlineArrowRight,
} from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX, QUICK_ACTIONS } from '../constants.js';

const ACTION_ICONS = {
    viewClasses: HiOutlineAcademicCap,
    viewAttendance: HiOutlineClipboardList,
    viewStudents: HiOutlineUserGroup,
    viewAnalytics: HiOutlineChartBar,
};

/**
 * Quick actions grid. Uses existing CSS: admin-quick-actions-grid, admin-quick-action, action-arrow.
 */
export default function QuickActionsCard() {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';

    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    {t('adminDashboard:quickActions.title')}
                </Typography>
            </Box>
            <div className="admin-quick-actions-grid">
                {QUICK_ACTIONS.map((action, index) => {
                    const Icon = ACTION_ICONS[action.key];
                    return (
                        <Link
                            to={action.path}
                            className="admin-quick-action"
                            key={index}
                        >
                            {Icon && <Icon size={22} />}
                            <span>{t(`adminDashboard:quickActions.items.${action.key}`)}</span>
                            <HiOutlineArrowRight className="action-arrow" size={18} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                        </Link>
                    );
                })}
            </div>
        </Box>
    );
}
