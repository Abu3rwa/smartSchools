import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import {
    HiOutlineAcademicCap,
    HiOutlineClipboardList,
    HiOutlineUserGroup,
    HiOutlineChartBar,
    HiOutlineArrowRight,
} from 'react-icons/hi';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX, QUICK_ACTIONS } from '../constants.js';

const ACTION_ICONS = {
    'View Classes': HiOutlineAcademicCap,
    'View Attendance': HiOutlineClipboardList,
    'View Students': HiOutlineUserGroup,
    'View Analytics': HiOutlineChartBar,
};

/**
 * Quick actions grid. Uses existing CSS: admin-quick-actions-grid, admin-quick-action, action-arrow.
 */
export default function QuickActionsCard() {
    return (
        <Box sx={CARD_SX}>
            <Box sx={CARD_HEADER_SX}>
                <Typography component="h3" sx={CARD_TITLE_SX}>
                    Quick Actions
                </Typography>
            </Box>
            <div className="admin-quick-actions-grid">
                {QUICK_ACTIONS.map((action, index) => {
                    const Icon = ACTION_ICONS[action.label];
                    return (
                        <Link
                            to={action.path}
                            className="admin-quick-action"
                            key={index}
                        >
                            {Icon && <Icon size={22} />}
                            <span>{action.label}</span>
                            <HiOutlineArrowRight className="action-arrow" size={18} />
                        </Link>
                    );
                })}
            </div>
        </Box>
    );
}
