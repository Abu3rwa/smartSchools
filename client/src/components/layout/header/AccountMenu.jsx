import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Menu, MenuItem, ListItemIcon, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineCog,
    HiOutlineLogout,
    HiOutlineStar,
    HiOutlineSun,
    HiOutlineMoon,
    HiOutlineSwitchHorizontal,
    HiOutlineCreditCard,
    HiCheck,
} from 'react-icons/hi';
import {
    selectUser,
    selectUserRoles,
    selectHasMultipleRoles,
    selectRoleSwitching,
    switchRole,
    logout,
} from '../../../store/slices/authSlice';
import { selectTheme, setTheme, selectLanguage, setLanguage } from '../../../store/slices/uiSlice';
import { creditDisplay } from '../../../utils/aiCredit';

const AccountMenu = ({ anchorEl, open, onClose, isRtl, isDesktop, credit, onOpenShortcuts }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['layout.header', 'schoolSettings', 'aiCredit']);
    const user = useSelector(selectUser);
    const roles = useSelector(selectUserRoles);
    const hasMultipleRoles = useSelector(selectHasMultipleRoles);
    const isSwitching = useSelector(selectRoleSwitching);
    const theme = useSelector(selectTheme);
    const language = useSelector(selectLanguage);

    const roleLabel = (role) => t(`schoolSettings:roles.${role}`, { defaultValue: role });
    const itemSx = { whiteSpace: 'normal', fontSize: '0.875rem' };
    const checkIcon = (selected) => (
        <ListItemIcon sx={{ minWidth: 26 }}>
            {selected ? <HiCheck size={16} aria-hidden="true" /> : null}
        </ListItemIcon>
    );

    const handleSettings = () => {
        onClose();
        navigate('/portal/settings');
    };

    const handleSignOut = () => {
        onClose();
        dispatch(logout());
        navigate('/login');
    };

    const handleSwitchRole = async (role) => {
        if (role === user?.role || isSwitching) return;
        onClose();
        const result = await dispatch(switchRole(role));
        if (switchRole.rejected.match(result)) {
            toast.error(result.payload || t('layout.header:menu.switchRoleFailed'));
        }
    };

    const balance = credit.eligible ? creditDisplay(credit, t, i18n.language) : null;

    return (
        <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: isRtl ? 'left' : 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: isRtl ? 'left' : 'right' }}
            slotProps={{ paper: { sx: { minWidth: 248, maxWidth: 'calc(100vw - 16px)', mt: 1 } } }}
        >
            <div className="header-menu-identity">
                <span className="header-menu-name">{user?.firstName} {user?.lastName}</span>
                <span className="header-menu-role">{roleLabel(user?.role)}</span>
            </div>
            <Divider />

            {!isDesktop && (
                <MenuItem sx={itemSx} onClick={() => { onClose(); onOpenShortcuts(); }}>
                    <ListItemIcon sx={{ minWidth: 26 }}><HiOutlineStar size={17} aria-hidden="true" /></ListItemIcon>
                    {t('layout.header:menu.shortcuts')}
                </MenuItem>
            )}
            {!isDesktop && balance && (
                <MenuItem
                    sx={itemSx}
                    component="a"
                    href="/portal/ai-credit/me"
                    onClick={(event) => {
                        event.preventDefault();
                        onClose();
                        navigate('/portal/ai-credit/me');
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 26 }}><HiOutlineCreditCard size={17} aria-hidden="true" /></ListItemIcon>
                    <span className="header-menu-balance-label">{t('aiCredit:chip.label')}</span>
                    <span className={`header-menu-balance-value is-${balance.state}`}>{balance.value}</span>
                </MenuItem>
            )}
            <MenuItem sx={itemSx} onClick={handleSettings}>
                <ListItemIcon sx={{ minWidth: 26 }}><HiOutlineCog size={17} aria-hidden="true" /></ListItemIcon>
                {t('layout.header:menu.settings')}
            </MenuItem>
            <Divider />

            <div className="header-menu-section" id="header-menu-appearance">{t('layout.header:menu.appearance')}</div>
            <MenuItem sx={itemSx} selected={theme === 'light'} onClick={() => dispatch(setTheme('light'))}>
                {checkIcon(theme === 'light')}
                <HiOutlineSun size={16} aria-hidden="true" style={{ marginInlineEnd: 6 }} />
                {t('layout.header:menu.light')}
            </MenuItem>
            <MenuItem sx={itemSx} selected={theme === 'dark'} onClick={() => dispatch(setTheme('dark'))}>
                {checkIcon(theme === 'dark')}
                <HiOutlineMoon size={16} aria-hidden="true" style={{ marginInlineEnd: 6 }} />
                {t('layout.header:menu.dark')}
            </MenuItem>

            <div className="header-menu-section">{t('layout.header:menu.language')}</div>
            <MenuItem sx={itemSx} selected={language === 'en'} onClick={() => dispatch(setLanguage('en'))}>
                {checkIcon(language === 'en')}
                English
            </MenuItem>
            <MenuItem sx={itemSx} selected={language === 'ar'} onClick={() => dispatch(setLanguage('ar'))}>
                {checkIcon(language === 'ar')}
                العربية
            </MenuItem>

            {hasMultipleRoles && [
                <Divider key="role-divider" />,
                <div key="role-section" className="header-menu-section">{t('layout.header:menu.switchRole')}</div>,
                isSwitching && (
                    <MenuItem key="role-switching" sx={itemSx} disabled>
                        <ListItemIcon sx={{ minWidth: 26 }}>
                            <HiOutlineSwitchHorizontal size={16} aria-hidden="true" />
                        </ListItemIcon>
                        {t('layout.header:menu.switchingRole')}
                    </MenuItem>
                ),
                ...roles.map((role) => (
                    <MenuItem
                        key={role}
                        sx={itemSx}
                        selected={role === user?.role}
                        disabled={isSwitching}
                        onClick={() => handleSwitchRole(role)}
                    >
                        {checkIcon(role === user?.role)}
                        {roleLabel(role)}
                    </MenuItem>
                )),
            ]}

            <Divider />
            <MenuItem sx={{ ...itemSx, color: 'error.main' }} onClick={handleSignOut}>
                <ListItemIcon sx={{ minWidth: 26, color: 'inherit' }}>
                    <HiOutlineLogout size={17} aria-hidden="true" />
                </ListItemIcon>
                {t('layout.header:menu.logout')}
            </MenuItem>
        </Menu>
    );
};

export default AccountMenu;