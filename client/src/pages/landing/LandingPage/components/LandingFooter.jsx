import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Public footer: a short description, the same section links as the header
 * and the copyright line. No legal sitemap and no unverified destinations.
 */
export default function LandingFooter({ copy, appName, year, navItems, onNavigateSection, onOpenFinder, onSignIn }) {
    const { t } = useTranslation(['landing.page']);

    const handleSectionLink = (event, sectionId) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigateSection(sectionId);
    };

    return (
        <Box
            component="footer"
            sx={{ borderTop: 1, borderColor: 'divider', py: { xs: 3, md: 4 }, mt: { xs: 2, md: 3 } }}
        >
            <Box className="landing-public-container">
                <Typography sx={{ color: 'text.secondary', mb: 2 }}>{copy.footer?.description}</Typography>

                <Box
                    component="nav"
                    aria-label={copy.a11y?.footerNavigation}
                    sx={{ mb: 2.5 }}
                >
                    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                        {navItems.map((item) => (
                            <Link
                                key={item.id}
                                component="a"
                                href={`#${item.sectionId}`}
                                onClick={(event) => handleSectionLink(event, item.id)}
                                underline="hover"
                                sx={{ color: 'text.secondary', fontSize: 16 }}
                            >
                                {item.label}
                            </Link>
                        ))}
                        <Link
                            component="a"
                            href="#book-demo"
                            onClick={(event) => handleSectionLink(event, 'demo')}
                            underline="hover"
                            sx={{ color: 'text.secondary', fontSize: 16 }}
                        >
                            {copy.actions?.demo}
                        </Link>
                        <Link
                            component="button"
                            type="button"
                            onClick={onOpenFinder}
                            underline="hover"
                            sx={{ color: 'text.secondary', fontSize: 16, background: 'none', border: 0, p: 0, cursor: 'pointer', font: 'inherit' }}
                        >
                            {copy.actions?.findSchool}
                        </Link>
                        <Link
                            component={RouterLink}
                            to="/login"
                            onClick={onSignIn}
                            underline="hover"
                            sx={{ color: 'text.secondary', fontSize: 16 }}
                        >
                            {copy.actions?.signIn}
                        </Link>
                    </Stack>
                </Box>

                <Typography variant="body2" color="text.secondary">
                    {t('publicPage.footer.copyright', { year, appName })}
                </Typography>
            </Box>
        </Box>
    );
}
