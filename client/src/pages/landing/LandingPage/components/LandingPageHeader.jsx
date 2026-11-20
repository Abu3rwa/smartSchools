import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { HiOutlineMenu, HiOutlineMoon, HiOutlineSun } from 'react-icons/hi';

/**
 * Public landing header: brand, section navigation, sign in, language, theme
 * and the demo call to action. Section links are real anchors with a hash so
 * they keep working without JavaScript and can be opened in a new tab.
 */
export default function LandingPageHeader({
    copy,
    appName,
    navItems,
    language,
    themeMode,
    onOpenMenu,
    onLanguageChange,
    onToggleTheme,
    onNavigateSection,
    onRequestDemo,
    onSignIn,
}) {
    const handleSectionLink = (event, sectionId) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigateSection(sectionId);
    };

    const handleBrandClick = (event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigateSection('home');
    };

    const isDark = themeMode === 'dark';

    return (
        <AppBar
            position="fixed"
            elevation={0}
            sx={{
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'divider',
                backdropFilter: 'blur(16px)',
            }}
        >
            <Toolbar
                sx={{
                    minHeight: { xs: 64, lg: 72 },
                    justifyContent: 'space-between',
                    gap: 1,
                    width: 'min(calc(100% - 2 * var(--landing-gutter, 32px)), 1160px)',
                    marginInline: 'auto',
                    px: 0,
                }}
            >
                <Link
                    id="landing-brand-link"
                    component="a"
                    href="#home"
                    onClick={handleBrandClick}
                    underline="none"
                    aria-label={appName}
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        color: 'text.primary',
                        textDecoration: 'none',
                        maxInlineSize: { xs: 156, lg: 200 },
                        minWidth: 0,
                    }}
                >
                    <Box
                        component="img"
                        src="/logo.svg"
                        alt=""
                        sx={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
                    />
                    <Typography
                        component="span"
                        sx={{ fontWeight: 700, fontSize: { xs: '1rem', lg: '1.125rem' }, lineHeight: 1.2, minWidth: 0 }}
                    >
                        {appName}
                    </Typography>
                </Link>

                <Box
                    component="nav"
                    aria-label={copy.a11y?.mainNavigation}
                    sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5 }}
                >
                    {navItems.map((item) => (
                        <Link
                            key={item.id}
                            component="a"
                            href={`#${item.sectionId}`}
                            onClick={(event) => handleSectionLink(event, item.id)}
                            underline="none"
                            sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                            }}
                        >
                            {item.label}
                        </Link>
                    ))}
                </Box>

                <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                    <Button
                        component={RouterLink}
                        to="/login"
                        onClick={onSignIn}
                        sx={{ color: 'text.secondary', fontWeight: 600, display: { xs: 'none', lg: 'inline-flex' } }}
                    >
                        {copy.actions?.signIn}
                    </Button>

                    <Box
                        sx={{
                            display: { xs: 'none', lg: 'inline-flex' },
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            overflow: 'hidden',
                        }}
                    >
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

                    <IconButton
                        onClick={onToggleTheme}
                        aria-label={isDark ? copy.header?.switchLight : copy.header?.switchDark}
                        sx={{ display: { xs: 'none', lg: 'inline-flex' } }}
                    >
                        {isDark ? <HiOutlineSun size={22} /> : <HiOutlineMoon size={22} />}
                    </IconButton>

                    <Button
                        variant="contained"
                        onClick={onRequestDemo}
                        sx={{
                            display: { xs: 'none', lg: 'inline-flex' },
                            minHeight: 48,
                            fontWeight: 600,
                        }}
                    >
                        {copy.actions?.demo}
                    </Button>

                    <Button
                        component={RouterLink}
                        to="/login"
                        onClick={onSignIn}
                        sx={{
                            display: { xs: 'inline-flex', lg: 'none' },
                            color: 'text.secondary',
                            fontWeight: 600,
                            px: 1,
                            minWidth: 0,
                        }}
                    >
                        {copy.actions?.signIn}
                    </Button>

                    <IconButton
                        id="landing-menu-trigger"
                        onClick={onOpenMenu}
                        aria-label={copy.header?.openMenu}
                        sx={{ display: { xs: 'inline-flex', lg: 'none' }, width: 44, height: 44 }}
                    >
                        <HiOutlineMenu size={24} />
                    </IconButton>
                </Stack>
            </Toolbar>
        </AppBar>
    );
}
