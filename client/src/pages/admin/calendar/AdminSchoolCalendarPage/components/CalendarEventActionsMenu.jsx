import { Menu, MenuItem } from '@mui/material';
import { HiOutlinePencil, HiOutlineXCircle } from 'react-icons/hi';

const CalendarEventActionsMenu = ({
    anchorEl,
    onClose,
    onEdit,
    onCancel
}) => {
    return (
        <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={onClose}
        >
            <MenuItem onClick={onEdit}>
                <HiOutlinePencil size={15} style={{ marginRight: 8 }} />
                Edit
            </MenuItem>
            <MenuItem onClick={onCancel}>
                <HiOutlineXCircle size={15} style={{ marginRight: 8 }} />
                Cancel Event
            </MenuItem>
        </Menu>
    );
};

export default CalendarEventActionsMenu;
