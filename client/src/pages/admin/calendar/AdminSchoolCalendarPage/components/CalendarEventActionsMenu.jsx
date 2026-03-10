import { Menu, MenuItem } from '@mui/material';
import { HiOutlinePencil, HiOutlineXCircle } from 'react-icons/hi';

const CalendarEventActionsMenu = ({
    anchorEl,
    onClose,
    onEdit,
    onCancel,
    t
}) => {
    return (
        <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={onClose}
        >
            <MenuItem onClick={onEdit}>
                <HiOutlinePencil size={15} style={{ marginRight: 8 }} />
                {t('calendar:actions.edit')}
            </MenuItem>
            <MenuItem onClick={onCancel}>
                <HiOutlineXCircle size={15} style={{ marginRight: 8 }} />
                {t('calendar:actions.cancelEvent')}
            </MenuItem>
        </Menu>
    );
};

export default CalendarEventActionsMenu;
