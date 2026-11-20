import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { HiOutlineMoon, HiOutlineSun, HiOutlineX } from 'react-icons/hi';

/**
 * Controlled navigation drawer for viewports below the desktop navigation.
 * It hands the next action over to the page hook so the drawer can finish its
 * exit transition before a section is focused or the school finder opens.
 */
export default function LandingMobileDrawer({
    copy,
    direction,
    open,
    navItems,
    language,
    themeMode,
    onClose,
    onExited,
    onNavigateSection,
    onOpenFinder,
    onLanguageChange,
    onToggleTheme,
    onSignIn,
}) {
    const isDark = themeMode === 'dark';

    return (
        <Drawer
            anchor={direction === 'rtl' ? 'left' : 'right'}
            open={open}
            onClose={onClose}
            ModalProps={{ disableRestoreFocus: true }}
            SlideProps={{ onExited }}
            PaperProps={{
                className: 'landing-public-overlay',
                sx: {
                    width: { xs: 'min(360px, 100vw)' },
                    maxHeight: '100dvh',
                    overflowY: 'auto',
                },
            }}
        >
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', p: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {copy.header?.menu}
                    </Typography>
                    <IconButton onClick={onClose} aria-label={copy.header?.closeMenu} sx={{ width: 44, height: 44 }}>
                        <HiOutlineX size={22} />
                    </IconButton>
                </Stack>

                <Box component="nav" aria-label={copy.a11y?.mainNavigation}>
                    <Stack spacing={0.5}>
                        {navItems.map((item) => (
                            <Button
                                key={item.id}
                                onClick={() => onNavigateSection(item.id)}
                                sx={{ justifyContent: 'flex-start', minHeight: 48, fontWeight: 500 }}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </Stack>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Stack spacing={1}>
                    <Button variant="contained" onClick={() => onNavigateSection('demo')} sx={{ minHeight: 48, fontWeight: 600 }}>
                        {copy.actions?.demo}
                    </Button>
                    <Button variant="outlined" onClick={onOpenFinder} sx={{ minHeight: 48 }}>
                        {copy.actions?.findSchool}
                    </Button>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Stack spacing={1}>
                    <Box sx={{ display: 'inline-flex', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                        <Button
                            size="small"
                            variant={language === 'en' ? 'contained' : 'text'}
                            onClick={() => onLanguageChange('en')}
                            aria-pressed={language === 'en'}
                            sx={{ minWidth: 44, borderRadius: 0, px: 1 }}
                        >
                            {copy.header?.english}
                        </Button>
                        <Button
                            size="small"
                            variant={language === 'ar' ? 'contained' : 'text'}
                            onClick={() => onLanguageChange('ar')}
                            aria-pressed={language === 'ar'}
                            sx={{ minWidth: 44, borderRadius: 0, px: 1 }}
                        >
                            {copy.header?.arabic}
                        </Button>
                    </Box>

                    <Button
                        onClick={onToggleTheme}
                        startIcon={isDark ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />}
                        sx={{ alignSelf: 'flex-start', minHeight: 44 }}
                    >
                        {isDark ? copy.header?.switchLight : copy.header?.switchDark}
                    </Button>
                </Stack>

                <Box sx={{ flexGrow: 1 }} />

                <Divider sx={{ my: 2 }} />

                <Button
                    component={RouterLink}
                    to="/login"
                    onClick={onSignIn}
                    sx={{ justifyContent: 'flex-start', color: 'text.secondary', fontWeight: 600 }}
                >
                    {copy.actions?.signIn}
                </Button>
            </Box>
        </Drawer>
    );
}
