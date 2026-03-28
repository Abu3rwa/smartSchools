import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { HiOutlineSwitchHorizontal, HiCheck } from 'react-icons/hi';
import {
    selectUser,
    selectUserRoles,
    selectHasMultipleRoles,
    selectRoleSwitching,
    switchRole,
} from '../../../store/slices/authSlice';

const RoleSwitcher = ({ isRtl }) => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['layout.header', 'schoolSettings']);
    const user = useSelector(selectUser);
    const roles = useSelector(selectUserRoles);
    const hasMultipleRoles = useSelector(selectHasMultipleRoles);
    const isSwitching = useSelector(selectRoleSwitching);
    const [anchorEl, setAnchorEl] = useState(null);

    if (!hasMultipleRoles) return null;

    const handleSwitch = (role) => {
        setAnchorEl(null);
        if (role !== user?.role) {
            dispatch(switchRole(role));
        }
    };

    const getRoleLabel = (role) => {
        return t(`schoolSettings:roles.${role}`, { defaultValue: role });
    };

    return (
        <>
            <button
                className="header-btn role-switcher-btn"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                disabled={isSwitching}
                aria-label={t('layout.header:roleSwitcher.switchRole')}
                title={t('layout.header:roleSwitcher.switchRole')}
            >
                <HiOutlineSwitchHorizontal size={20} />
                <span className="role-switcher-label">{getRoleLabel(user?.role)}</span>
            </button>

            <Menu
                anchorEl={anchorEl}
                open={!!anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
                PaperProps={{ sx: { minWidth: 200, mt: 1.5 } }}
            >
                <MenuItem disabled sx={{ opacity: '0.7 !important', fontSize: '0.8rem', fontWeight: 600 }}>
                    {t('layout.header:roleSwitcher.title')}
                </MenuItem>
                <Divider />
                {roles.map((role) => (
                    <MenuItem
                        key={role}
                        onClick={() => handleSwitch(role)}
                        selected={role === user?.role}
                    >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                            {role === user?.role ? <HiCheck size={16} /> : null}
                        </ListItemIcon>
                        <ListItemText>{getRoleLabel(role)}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default RoleSwitcher;
