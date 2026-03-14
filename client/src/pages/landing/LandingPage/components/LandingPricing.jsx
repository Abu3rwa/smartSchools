import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import { HiOutlineCheckCircle } from 'react-icons/hi';

/**
 * Pricing plans — uses .landing-card-grid for equal width cards.
 */
export default function LandingPricing({ content, handleAction }) {
    return (
        <Box id="pricing" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    {content.pricing.overline}
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    {content.pricing.title}
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 600, mx: 'auto', mb: 5, fontSize: '1.05rem', lineHeight: 1.7 }}>
                    {content.pricing.subtitle}
                </Typography>

                <div className="landing-card-grid">
                    {(content.pricing.plans || []).map((plan) => (
                        <Paper
                            key={`${plan.name}-${plan.price}`}
                            className="landing-lift-card"
                            variant="outlined"
                            sx={{
                                p: 3.5,
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                position: 'relative',
                                borderColor: plan.featured ? 'primary.main' : undefined,
                                boxShadow: plan.featured ? 4 : 0,
                            }}
                        >
                            {plan.featured && (
                                <Typography
                                    variant="caption"
                                    sx={{
                                        position: 'absolute',
                                        top: -12,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        px: 2,
                                        py: 0.5,
                                        borderRadius: 10,
                                        bgcolor: 'primary.main',
                                        color: 'primary.contrastText',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {content.pricing.popularLabel || 'Most popular'}
                                </Typography>
                            )}
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>{plan.name}</Typography>
                            <Typography sx={{ fontWeight: 800, fontSize: '2rem', lineHeight: 1.2, mb: 0.5 }}>
                                {plan.price}
                                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                                    {plan.period}
                                </Typography>
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.7 }}>{plan.description}</Typography>
                            <Box sx={{ flex: 1 }}>
                                {(plan.features || []).map((f) => (
                                    <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, typography: 'body2', color: 'text.secondary', '& svg': { color: 'success.main', flexShrink: 0 } }}>
                                        <HiOutlineCheckCircle size={16} /> {f}
                                    </Box>
                                ))}
                            </Box>
                            <Button
                                variant={plan.featured ? 'contained' : 'outlined'}
                                fullWidth
                                sx={{ mt: 2.5, py: 1.25, fontWeight: 700 }}
                                onClick={() => handleAction(plan.ctaAction)}
                            >
                                {plan.ctaLabel}
                            </Button>
                        </Paper>
                    ))}
                </div>
            </Container>
        </Box>
    );
}
