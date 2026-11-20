import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

/**
 * First fold of the public page: what the platform is, who it is for and the
 * two ways forward. The existing-user link stays a text link, never a third
 * filled button.
 */
export default function LandingHero({ copy, onNavigateSection, onSignIn }) {
    return (
        <Box
            component="section"
            id="home"
            className="landing-public-section"
            sx={{ pt: { xs: 'calc(64px + 28px)', md: 'calc(64px + 40px)', lg: 'calc(72px + 56px)' } }}
        >
            <Box className="landing-public-container">
                <Box sx={{ maxInlineSize: 780 }}>
                    <Typography
                        variant="overline"
                        color="primary"
                        sx={{ display: 'block', fontWeight: 700, letterSpacing: 2, mb: 1.5 }}
                    >
                        {copy.hero?.eyebrow}
                    </Typography>

                    <Typography
                        component="h1"
                        id="home-heading"
                        tabIndex={-1}
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: 34, md: 40, lg: 56 },
                            lineHeight: { xs: 1.18, md: 1.18, lg: 1.12 },
                            maxInlineSize: { xs: '20ch', md: '18ch', lg: '16ch' },
                            mb: 2.5,
                            '@media (max-width: 359px)': { fontSize: 32 },
                        }}
                    >
                        {copy.hero?.title}
                    </Typography>

                    <Typography
                        sx={{
                            fontSize: { xs: 16, lg: 17 },
                            lineHeight: 1.65,
                            color: 'text.secondary',
                            maxInlineSize: 540,
                            mb: 3,
                        }}
                    >
                        {copy.hero?.bodyCore}
                    </Typography>

                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        sx={{ mb: 2, alignItems: { sm: 'center' } }}
                    >
                        <Button
                            variant="contained"
                            onClick={() => onNavigateSection('demo')}
                            sx={{ minHeight: 48, fontWeight: 600, width: { xs: '100%', sm: 'auto' } }}
                        >
                            {copy.actions?.demo}
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() => onNavigateSection('product')}
                            sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}
                        >
                            {copy.actions?.explore}
                        </Button>
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {copy.hero?.existingUser}{' '}
                        <Link
                            component={RouterLink}
                            to="/login"
                            onClick={onSignIn}
                            underline="hover"
                            sx={{ fontWeight: 600 }}
                        >
                            {copy.actions?.signIn}
                        </Link>
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                        {copy.hero?.availability}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
