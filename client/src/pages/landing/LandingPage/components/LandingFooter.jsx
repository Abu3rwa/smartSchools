import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import { HiOutlineAcademicCap } from 'react-icons/hi';

/**
 * Footer with brand, product/company/legal links, and copyright.
 */
export default function LandingFooter({ content, copyrightText, handleAction }) {
    return (
        <Box component="footer" sx={{ py: 4, borderTop: 1, borderColor: 'divider' }}>
            <Container maxWidth="lg">
                <Grid container spacing={4} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <HiOutlineAcademicCap size={22} style={{ color: 'white' }} />
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, background: 'var(--brand-gradient)', backgroundClip: 'text', color: 'transparent' }}>{content.brand.name}</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">{content.brand.tagline}</Typography>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <Grid container spacing={4}>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.productTitle}</Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.productLinks || []).map((link, index) => (
                                        <Button key={`product-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                    ))}
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.companyTitle}</Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.companyLinks || []).map((link, index) => (
                                        <Button key={`company-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                    ))}
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.legalTitle}</Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {(content.footer.legalLinks || []).map((link, index) => (
                                        <Button key={`legal-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                    ))}
                                </Box>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
                <Typography variant="body2" color="text.secondary" sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                    {copyrightText}
                </Typography>
            </Container>
        </Box>
    );
}
