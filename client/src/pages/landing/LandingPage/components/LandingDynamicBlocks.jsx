import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { HiOutlineBell, HiOutlineArrowRight, HiStar } from 'react-icons/hi';

/**
 * Dynamic CMS blocks — announcement banner, promo cards, and inline testimonials.
 * Styled to match the landing page card system.
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
        <Box component="section" sx={{ py: { xs: 4, md: 6 } }} data-testid="landing-dynamic-blocks">
            <Container maxWidth="lg">

                {/* ── Announcement Banner ── */}
                {announcement ? (
                    <Paper
                        variant="outlined"
                        data-testid="landing-dynamic-announcement"
                        sx={{
                            p: 2.5,
                            mb: promotions.length > 0 || testimonials.length > 0 ? 3 : 0,
                            borderColor: 'primary.main',
                            borderRadius: 3,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            flexWrap: { xs: 'wrap', sm: 'nowrap' },
                            background: 'linear-gradient(135deg, rgba(var(--brand-rgb-start), 0.08) 0%, rgba(var(--brand-rgb-end), 0.06) 100%)',
                        }}
                    >
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 2,
                                background: 'var(--brand-gradient)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                flexShrink: 0,
                            }}
                        >
                            <HiOutlineBell size={20} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.25 }}>
                                {announcement.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                                {announcement.message}
                            </Typography>
                        </Box>
                        {announcement.ctaLabel ? (
                            <Button
                                size="small"
                                variant="outlined"
                                endIcon={<HiOutlineArrowRight size={14} />}
                                onClick={() => onAction(announcement.ctaAction)}
                                sx={{ flexShrink: 0, borderRadius: 2 }}
                            >
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

                {/* ── Promotions + Testimonials in a 2-col grid ── */}
                {(promotions.length > 0 || testimonials.length > 0) && (
                    <div className="landing-card-grid-2col">
                        {/* Promo cards */}
                        {promotions.map((promo) => (
                            <Paper
                                key={promo.id || promo.title}
                                className="landing-lift-card"
                                variant="outlined"
                                sx={{
                                    p: 3,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    '&:hover': { borderColor: 'primary.main' },
                                }}
                            >
                                {promo.badge ? (
                                    <Chip
                                        size="small"
                                        label={promo.badge}
                                        sx={{
                                            mb: 1.5,
                                            alignSelf: 'flex-start',
                                            fontWeight: 600,
                                            bgcolor: 'rgba(var(--brand-rgb-end), 0.12)',
                                            color: 'primary.main',
                                        }}
                                    />
                                ) : null}
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, lineHeight: 1.3 }}>
                                    {promo.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, flex: 1, mb: promo.ctaLabel ? 2 : 0 }}>
                                    {promo.description}
                                </Typography>
                                {promo.ctaLabel ? (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        endIcon={<HiOutlineArrowRight size={14} />}
                                        onClick={() => onAction(promo.ctaAction)}
                                        sx={{ alignSelf: 'flex-start', borderRadius: 2 }}
                                    >
                                        {promo.ctaLabel}
                                    </Button>
                                ) : null}
                            </Paper>
                        ))}

                        {/* Testimonial cards */}
                        {testimonials.map((item) => (
                            <Paper
                                key={item.id || item.quote}
                                className="landing-lift-card"
                                variant="outlined"
                                sx={{
                                    p: 3,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    '&:hover': { borderColor: 'primary.main' },
                                }}
                            >
                                {/* Stars */}
                                <Box sx={{ display: 'flex', gap: 0.25, mb: 1.5, color: '#fbbf24' }}>
                                    {[...Array(5)].map((_, i) => (
                                        <HiStar key={i} size={14} />
                                    ))}
                                </Box>
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', lineHeight: 1.7, flex: 1, mb: 2 }}>
                                    &ldquo;{item.quote}&rdquo;
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                                    <Box
                                        sx={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            background: 'var(--brand-gradient)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Typography variant="caption" fontWeight={700} sx={{ color: '#fff' }}>
                                            {(item.name || '').split(' ').map(w => w[0]).join('').slice(0, 2)}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="body2" fontWeight={700}>{item.name}</Typography>
                                        {item.role ? (
                                            <Typography variant="caption" color="text.secondary">{item.role}</Typography>
                                        ) : null}
                                    </Box>
                                </Box>
                            </Paper>
                        ))}
                    </div>
                )}
            </Container>
        </Box>
    );
}
