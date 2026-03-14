import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { HiStar } from 'react-icons/hi';

/**
 * Testimonials — uses .landing-card-grid for equal width cards.
 */
export default function LandingTestimonials({ content }) {
    return (
        <Box id="testimonials" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    {content.testimonials.overline}
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    {content.testimonials.title}
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 600, mx: 'auto', mb: 5, fontSize: '1.05rem' }}>
                    {content.testimonials.subtitle}
                </Typography>

                <div className="landing-card-grid">
                    {(content.testimonials.items || []).map((t, index) => (
                        <Paper
                            key={`${t.initials || 't'}-${index}`}
                            className="landing-lift-card"
                            variant="outlined"
                            sx={{
                                p: 3.5,
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            {/* Star rating */}
                            <Box sx={{ display: 'flex', gap: 0.25, mb: 2, color: '#fbbf24' }}>
                                {[...Array(5)].map((_, i) => (
                                    <HiStar key={i} size={16} />
                                ))}
                            </Box>
                            <Typography color="text.secondary" sx={{ mb: 3, fontStyle: 'italic', lineHeight: 1.7, flex: 1 }}>
                                &ldquo;{t.quote}&rdquo;
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                                <Box
                                    sx={{
                                        width: 42,
                                        height: 42,
                                        borderRadius: '50%',
                                        background: 'var(--brand-gradient)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }}>
                                        {t.initials}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography fontWeight={700} sx={{ fontSize: '0.95rem' }}>{t.name}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{t.role}</Typography>
                                </Box>
                            </Box>
                        </Paper>
                    ))}
                </div>
            </Container>
        </Box>
    );
}
