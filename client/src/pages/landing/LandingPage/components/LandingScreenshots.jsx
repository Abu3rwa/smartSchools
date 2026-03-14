import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

/**
 * Product screenshots section showing a dashboard preview.
 */
export default function LandingScreenshots() {
    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 }, overflow: 'hidden' }}>
            <Container maxWidth="lg">
                <Typography
                    variant="overline"
                    color="primary"
                    sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}
                >
                    SEE IT IN ACTION
                </Typography>
                <Typography
                    variant="h4"
                    align="center"
                    sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.75rem', md: '2.25rem' } }}
                >
                    A Dashboard Designed for Schools
                </Typography>
                <Typography
                    color="text.secondary"
                    align="center"
                    sx={{ maxWidth: 600, mx: 'auto', mb: 6, fontSize: '1.05rem', lineHeight: 1.7 }}
                >
                    Track grades, monitor attendance, and manage your school — all from one clean, intuitive interface.
                </Typography>
                <Box
                    sx={{
                        position: 'relative',
                        maxWidth: 960,
                        mx: 'auto',
                        borderRadius: 3,
                        overflow: 'hidden',
                        border: 1,
                        borderColor: 'divider',
                        boxShadow: '0 25px 60px -12px rgba(0,0,0,0.4)',
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(180deg, transparent 70%, rgba(15,23,42,0.6) 100%)',
                            zIndex: 1,
                            pointerEvents: 'none',
                        },
                    }}
                >
                    <img
                        src="/dashboard-preview.png"
                        alt="GradeBook dashboard showing student grades, attendance analytics, and school management tools"
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                        }}
                        loading="lazy"
                    />
                </Box>
            </Container>
        </Box>
    );
}
