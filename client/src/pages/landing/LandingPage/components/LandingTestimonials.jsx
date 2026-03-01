import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';

/**
 * Testimonials section. Uses landing-lift-card.
 */
export default function LandingTestimonials({ content }) {
    return (
        <Box id="testimonials" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.testimonials.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.testimonials.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>{content.testimonials.subtitle}</Typography>
                <Grid container spacing={3} alignItems="stretch">
                    {(content.testimonials.items || []).map((t, index) => (
                        <Grid item xs={12} sm={6} md={4} key={`${t.initials || 't'}-${index}`}>
                            <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, height: '100%' }}>
                                <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>&ldquo;{t.quote}&rdquo;</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Typography variant="body2" fontWeight={600} color="primary.main">{t.initials}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography fontWeight={600}>{t.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">{t.role}</Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        </Box>
    );
}


