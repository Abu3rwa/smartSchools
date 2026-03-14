import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import { HiOutlineGlobeAlt } from 'react-icons/hi';

/**
 * Footer with brand logo (SVG), product/company/legal links, social, and copyright.
 */
export default function LandingFooter({ content, copyrightText, handleAction }) {
    return (
        <Box component="footer" sx={{ pt: 6, pb: 4, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
                <Grid container spacing={4} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                            <Box sx={{ width: 44, height: 44, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                                <img src="/logo.svg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </Box>
                            <Typography
                                variant="h6"
                                sx={{
                                    fontWeight: 800,
                                    background: 'var(--brand-gradient)',
                                    backgroundClip: 'text',
                                    color: 'transparent',
                                }}
                            >
                                {content.brand.name}
                            </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 280, lineHeight: 1.7 }}>
                            {content.brand.tagline}
                        </Typography>
                        {/* Social Links */}
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton size="small" aria-label="Website" sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                                <HiOutlineGlobeAlt size={18} />
                            </IconButton>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <Grid container spacing={4}>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem' }}>
                                    {content.footer.productTitle}
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.productLinks || []).map((link, index) => (
                                        <Button
                                            key={`product-link-${index}-${link.label}`}
                                            size="small"
                                            sx={{ justifyContent: 'flex-start', color: 'text.secondary', fontWeight: 500, '&:hover': { color: 'primary.main' } }}
                                            onClick={() => handleAction(link.action)}
                                        >
                                            {link.label}
                                        </Button>
                                    ))}
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem' }}>
                                    {content.footer.companyTitle}
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.companyLinks || []).map((link, index) => (
                                        <Button
                                            key={`company-link-${index}-${link.label}`}
                                            size="small"
                                            sx={{ justifyContent: 'flex-start', color: 'text.secondary', fontWeight: 500, '&:hover': { color: 'primary.main' } }}
                                            onClick={() => handleAction(link.action)}
                                        >
                                            {link.label}
                                        </Button>
                                    ))}
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.7rem' }}>
                                    {content.footer.legalTitle}
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.legalLinks || []).map((link, index) => (
                                        <Button
                                            key={`legal-link-${index}-${link.label}`}
                                            size="small"
                                            sx={{ justifyContent: 'flex-start', color: 'text.secondary', fontWeight: 500, '&:hover': { color: 'primary.main' } }}
                                            onClick={() => handleAction(link.action)}
                                        >
                                            {link.label}
                                        </Button>
                                    ))}
                                </Box>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
                <Box sx={{ pt: 3, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        {copyrightText}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        Crafted with care for schools worldwide.
                    </Typography>
                </Box>
            </Container>
        </Box>
    );
}
