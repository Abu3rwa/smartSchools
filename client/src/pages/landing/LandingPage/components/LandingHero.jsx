import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import { HiOutlineSparkles, HiOutlineCheckCircle, HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Hero section with badge, title, CTAs, highlights, and preview card.
 */
export default function LandingHero({ content, contentError, heroBadge, handleAction }) {
    return (
        <Box component="section" sx={{ position: 'relative', zIndex: 1, pt: { xs: 12, md: 16 }, pb: { xs: 6, md: 10 }, px: 2 }}>
            <Container maxWidth="lg">
                {contentError ? (
                    <Paper variant="outlined" sx={{ mb: 3, p: 2, borderColor: 'warning.main', bgcolor: 'rgba(245,158,11,0.1)' }}>
                        <Typography variant="body2" color="warning.main">{contentError}</Typography>
                    </Paper>
                ) : null}
                <Grid container spacing={{ xs: 6, md: 4, lg: 6 }} alignItems="center">
                    <Grid item xs={12} md={6} sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        <Paper variant="outlined" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, mb: 3, borderRadius: 10, borderColor: 'primary.main', bgcolor: 'rgba(90,174,238,0.1)' }}>
                            <HiOutlineSparkles size={16} />
                            <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'primary.main' }}>
                                {heroBadge}
                            </Typography>
                        </Paper>
                        <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 2, lineHeight: 1.15, fontSize: { xs: '2rem', sm: '2.5rem', md: '2.5rem', lg: '3rem' } }}>
                            {content.hero.title}
                        </Typography>
                        <Typography color="text.secondary" sx={{ fontSize: '1.125rem', mb: 4, maxWidth: 520, mx: { xs: 'auto', md: 0 } }}>
                            {content.hero.subtitle}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                            <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={18} />} onClick={() => handleAction(content.hero.primaryCta.action)}>
                                {content.hero.primaryCta.label}
                            </Button>
                            <Button variant="outlined" size="large" onClick={() => handleAction(content.hero.secondaryCta.action)}>{content.hero.secondaryCta.label}</Button>
                        </Box>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 1, animation: 'fadeIn 1s ease-out', '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
                        >
                            {content.hero.scrollHint}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, color: 'text.secondary', typography: 'body2', justifyContent: { xs: 'center', md: 'flex-start' }, mt: 2 }}>
                            {(content.hero.highlights || []).map((t) => (
                                <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, '& svg': { color: 'success.main' } }}>
                                    <HiOutlineCheckCircle size={16} /> {t}
                                </Box>
                            ))}
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' } }}>
                        <div className="landing-float-element" style={{ width: '100%', maxWidth: 460 }}>
                            <Paper className="landing-elevated-card" sx={{ width: '100%', overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                                <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27c93f' }} />
                                </Box>
                                <Box sx={{ p: 2 }}>
                                    <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                        {(content.hero.preview.metrics || []).map(({ value, label }) => (
                                            <Grid item xs={4} key={label || value}>
                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.paper', borderColor: 'divider' }}>
                                                    <Typography variant="h6">{value}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <Grid container sx={{ typography: 'caption', borderBottom: 1, borderColor: 'divider' }}>
                                        {(content.hero.preview.tableHeaders || []).map((h) => (
                                            <Grid item xs={4} key={h} sx={{ py: 1, px: 1.5, color: 'text.secondary', fontWeight: 600 }}>{h}</Grid>
                                        ))}
                                        {(content.hero.preview.tableRows || []).map((row, i) =>
                                            row.map((cell, j) => (
                                                <Grid item xs={4} key={`${i}-${j}`} sx={{ py: 1, px: 1.5, color: j === 0 ? 'text.primary' : 'text.secondary' }}>{cell}</Grid>
                                            ))
                                        )}
                                    </Grid>
                                </Box>
                            </Paper>
                        </div>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}

