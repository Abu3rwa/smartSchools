import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi';

/**
 * Mobile navigation drawer. Uses same content as header nav.
 */
export default function LandingMobileDrawer({
    open,
    onClose,
    content,
    themeMode,
    toggleTheme,
    scrollTo,
    handleAction,
}) {
    return (
        <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 280, bgcolor: 'background.default' } }}>
            <Box sx={{ p: 3, pt: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">Theme</Typography>
                    <Button startIcon={themeMode === 'dark' ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />} onClick={() => { onClose(); toggleTheme(); }} sx={{ color: 'text.primary' }}>
                        {themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
                    </Button>
                </Box>
                {(content.navigation || []).map(({ label, id }) => (
                    <Button key={id} href={`#${id}`} fullWidth onClick={() => scrollTo(id)} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
                        {label}
                    </Button>
                ))}
                <Button fullWidth onClick={() => { onClose(); handleAction('login'); }} sx={{ color: 'text.secondary' }}>{content.header.loginLabel}</Button>
                <Button variant="contained" fullWidth onClick={() => { onClose(); handleAction('register'); }}>{content.header.startLabel}</Button>
            </Box>
        </Drawer>
    );
}
