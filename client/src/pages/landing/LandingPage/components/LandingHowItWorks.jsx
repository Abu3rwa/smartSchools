import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

/**
 * How it works — uses .landing-card-grid for equal width cards.
 */
export default function LandingHowItWorks({ content }) {
    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    {content.howItWorks.overline}
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    {content.howItWorks.title}
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 600, mx: 'auto', mb: 5, fontSize: '1.05rem', lineHeight: 1.7 }}>
                    {content.howItWorks.subtitle}
                </Typography>

                <div className="landing-card-grid">
                    {(content.howItWorks.steps || []).map(({ title, description }, index) => (
                        <Paper
                            key={title || index}
                            className="landing-lift-card"
                            variant="outlined"
                            sx={{
                                p: 3.5,
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            <Box
                                sx={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: '50%',
                                    background: 'var(--brand-gradient)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: '1.2rem',
                                    mx: 'auto',
                                    mb: 2,
                                    flexShrink: 0,
                                    boxShadow: '0 8px 24px rgba(13, 148, 136, 0.25)',
                                }}
                            >
                                {index + 1}
                            </Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, flex: 1 }}>
                                {description}
                            </Typography>
                        </Paper>
                    ))}
                </div>
            </Container>
        </Box>
    );
}
