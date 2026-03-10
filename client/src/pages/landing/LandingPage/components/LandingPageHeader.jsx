import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { HiOutlineAcademicCap, HiOutlineSun, HiOutlineMoon, HiOutlineMenu } from 'react-icons/hi';

/**
 * Fixed app bar with logo, nav links, theme toggle, and mobile menu button.
 */
export default function LandingPageHeader({
    content,
    themeMode,
    toggleTheme,
    language,
    onLanguageChange,
    uiText,
    scrollTo,
    handleAction,
    onOpenMobileMenu,
}) {
    const navContent = (
        <>
            {(content.navigation || []).map(({ label, id }) => (
                <Button key={id} href={`#${id}`} onClick={() => scrollTo(id)} sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {label}
                </Button>
            ))}
            <Button onClick={() => handleAction('login')} sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {content.header.loginLabel}
            </Button>
            <Button variant="contained" onClick={() => handleAction('register')} sx={{ fontWeight: 600 }}>
                {content.header.startLabel}
            </Button>
        </>
    );

    return (
        <AppBar position="fixed" elevation={0} sx={{ bgcolor: 'background.default', backdropFilter: 'blur(16px)', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ justifyContent: 'space-between', maxWidth: 1280, mx: 'auto', width: '100%', px: { xs: 1.5, sm: 2 } }}>
                <Button onClick={() => window.scrollTo(0, 0)} sx={{ color: 'inherit', textTransform: 'none' }} startIcon={
                    <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <HiOutlineAcademicCap size={24} />
                    </Box>
                }>
                    <Typography variant="h6" sx={{ fontWeight: 700, background: 'var(--brand-gradient)', backgroundClip: 'text', color: 'transparent' }}>
                        {content.brand.name}
                    </Typography>
                </Button>
                <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1 }}>
                    {navContent}
                    <Box sx={{ display: 'inline-flex', border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                        <Button
                            size="small"
                            variant={language === 'en' ? 'contained' : 'text'}
                            onClick={() => onLanguageChange('en')}
                            aria-pressed={language === 'en'}
                            sx={{ minWidth: 44, borderRadius: 0 }}
                        >
                            {uiText.languageEnglish || 'EN'}
                        </Button>
                        <Button
                            size="small"
                            variant={language === 'ar' ? 'contained' : 'text'}
                            onClick={() => onLanguageChange('ar')}
                            aria-pressed={language === 'ar'}
                            sx={{ minWidth: 44, borderRadius: 0 }}
                        >
                            {uiText.languageArabic || 'AR'}
                        </Button>
                    </Box>
                    <IconButton onClick={toggleTheme} color="inherit" aria-label={themeMode === 'dark' ? (uiText.switchToLightMode || 'Switch to light mode') : (uiText.switchToDarkMode || 'Switch to dark mode')} sx={{ ml: 0.5 }}>
                        {themeMode === 'dark' ? <HiOutlineSun size={22} /> : <HiOutlineMoon size={22} />}
                    </IconButton>
                </Box>
                <Box sx={{ display: { lg: 'none' }, alignItems: 'center', gap: 0.5 }}>
                    <Button onClick={() => handleAction('login')} sx={{ color: 'text.secondary', fontWeight: 600, px: 1, minWidth: 'auto' }}>
                        {content.header.loginLabel}
                    </Button>
                    <IconButton onClick={toggleTheme} color="inherit" aria-label={themeMode === 'dark' ? (uiText.switchToLightMode || 'Switch to light mode') : (uiText.switchToDarkMode || 'Switch to dark mode')}>
                        {themeMode === 'dark' ? <HiOutlineSun size={22} /> : <HiOutlineMoon size={22} />}
                    </IconButton>
                    <IconButton sx={{ color: 'inherit' }} onClick={onOpenMobileMenu} aria-label={uiText.openNavigationMenu || 'Open navigation menu'}>
                        <HiOutlineMenu size={24} />
                    </IconButton>
                </Box>
            </Toolbar>
        </AppBar>
    );
}
