import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import { HiOutlineCheckCircle } from 'react-icons/hi';

/**
 * Pricing plans. Uses landing-lift-card.
 */
export default function LandingPricing({ content, handleAction }) {
    return (
        <Box id="pricing" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.pricing.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.pricing.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>{content.pricing.subtitle}</Typography>
                <Grid container spacing={3} justifyContent="center">
                    {(content.pricing.plans || []).map((plan) => (
                        <Grid item xs={12} sm={8} md={4} key={`${plan.name}-${plan.price}`}>
                            <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', borderColor: plan.featured ? 'primary.main' : undefined, boxShadow: plan.featured ? 4 : 0 }}>
                                {plan.featured && (
                                    <Typography variant="caption" sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', px: 1.5, py: 0.5, borderRadius: 10, bgcolor: 'primary.main', color: 'white', fontWeight: 600 }}>Most popular</Typography>
                                )}
                                <Typography variant="h6" sx={{ mb: 0.5 }}>{plan.name}</Typography>
                                <Typography variant="h5" sx={{ fontWeight: 700 }}>{plan.price}<Typography component="span" variant="body2" color="text.secondary">{plan.period}</Typography></Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{plan.description}</Typography>
                                <Box sx={{ flex: 1 }}>
                                    {(plan.features || []).map((f) => (
                                        <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, typography: 'body2', color: 'text.secondary', '& svg': { color: 'success.main' } }}>
                                            <HiOutlineCheckCircle size={16} style={{ flexShrink: 0 }} /> {f}
                                        </Box>
                                    ))}
                                </Box>
                                <Button variant={plan.featured ? 'contained' : 'outlined'} fullWidth sx={{ mt: 2 }} onClick={() => handleAction(plan.ctaAction)}>
                                    {plan.ctaLabel}
                                </Button>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        </Box>
    );
}

