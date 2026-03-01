import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';

/**
 * How it works section with numbered steps.
 */
export default function LandingHowItWorks({ content }) {
    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.howItWorks.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.howItWorks.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                    {content.howItWorks.subtitle}
                </Typography>
                <Grid container spacing={3} justifyContent="center">
                    {(content.howItWorks.steps || []).map(({ title, description }, index) => (
                        <Grid item xs={12} sm={6} md={4} key={title || index}>
                            <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, textAlign: 'center', height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
                                <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'var(--brand-gradient)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, mx: 'auto', mb: 2 }}>{index + 1}</Box>
                                <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                                <Typography variant="body2" color="text.secondary">{description}</Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        </Box>
    );
}

