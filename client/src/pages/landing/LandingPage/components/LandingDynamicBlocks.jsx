import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';

/**
 * Dynamic localized landing blocks with resilient fallback rendering.
 */
export default function LandingDynamicBlocks({
    blocks,
    loading,
    fallbackUsed,
    fallbackNotice,
    onAction,
}) {
    const announcement = blocks?.announcement;
    const promotions = Array.isArray(blocks?.promotions) ? blocks.promotions : [];
    const testimonials = Array.isArray(blocks?.testimonials) ? blocks.testimonials : [];

    if (!announcement && promotions.length === 0 && testimonials.length === 0) {
        return null;
    }

    return (
        <Box component="section" sx={{ py: { xs: 4, md: 5 } }} data-testid="landing-dynamic-blocks">
            <Container maxWidth="lg">
                {announcement ? (
                    <Paper variant="outlined" sx={{ p: 2, mb: 2.5, borderColor: 'primary.main', bgcolor: 'action.hover' }} data-testid="landing-dynamic-announcement">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                            {announcement.title}
                        </Typography>
                        <Typography color="text.secondary" sx={{ mb: announcement.ctaLabel ? 1.25 : 0 }}>
                            {announcement.message}
                        </Typography>
                        {announcement.ctaLabel ? (
                            <Button size="small" variant="text" onClick={() => onAction(announcement.ctaAction)}>
                                {announcement.ctaLabel}
                            </Button>
                        ) : null}
                    </Paper>
                ) : null}

                {(fallbackUsed || loading) && fallbackNotice ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }} data-testid="landing-dynamic-fallback-notice">
                        {fallbackNotice}
                    </Typography>
                ) : null}

                {promotions.length > 0 ? (
                    <Grid container spacing={2} sx={{ mb: testimonials.length > 0 ? 2 : 0 }}>
                        {promotions.map((promo) => (
                            <Grid item xs={12} md={6} key={promo.id || promo.title}>
                                <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                                    {promo.badge ? <Chip size="small" label={promo.badge} sx={{ mb: 1 }} /> : null}
                                    <Typography variant="h6" sx={{ mb: 0.5 }}>
                                        {promo.title}
                                    </Typography>
                                    <Typography color="text.secondary" sx={{ mb: promo.ctaLabel ? 1.25 : 0 }}>
                                        {promo.description}
                                    </Typography>
                                    {promo.ctaLabel ? (
                                        <Button size="small" variant="outlined" onClick={() => onAction(promo.ctaAction)}>
                                            {promo.ctaLabel}
                                        </Button>
                                    ) : null}
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                ) : null}

                {testimonials.length > 0 ? (
                    <Grid container spacing={2}>
                        {testimonials.map((item) => (
                            <Grid item xs={12} md={6} key={item.id || item.quote}>
                                <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                                    <Typography color="text.secondary" sx={{ mb: 1.25, fontStyle: 'italic' }}>
                                        &ldquo;{item.quote}&rdquo;
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {item.name}
                                    </Typography>
                                    {item.role ? (
                                        <Typography variant="caption" color="text.secondary">
                                            {item.role}
                                        </Typography>
                                    ) : null}
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                ) : null}
            </Container>
        </Box>
    );
}
