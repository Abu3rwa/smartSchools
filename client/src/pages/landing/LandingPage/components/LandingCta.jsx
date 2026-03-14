import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Final CTA section with gradient background and dual buttons.
 */
export default function LandingCta({ content, handleAction }) {
    return (
        <Box
            component="section"
            sx={{
                py: { xs: 8, md: 10 },
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--brand-gradient)',
                    opacity: 0.12,
                    zIndex: 0,
                },
            }}
        >
            {/* Decorative circles */}
            <Box
                sx={{
                    position: 'absolute',
                    top: -80,
                    right: -80,
                    width: 260,
                    height: 260,
                    borderRadius: '50%',
                    background: 'var(--brand-gradient)',
                    opacity: 0.06,
                    zIndex: 0,
                }}
                aria-hidden
            />
            <Box
                sx={{
                    position: 'absolute',
                    bottom: -60,
                    left: -60,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: 'var(--brand-gradient)',
                    opacity: 0.05,
                    zIndex: 0,
                }}
                aria-hidden
            />

            <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
                <Typography
                    variant="h3"
                    align="center"
                    sx={{ fontWeight: 800, mb: 2, fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' } }}
                >
                    {content.finalCta.title}
                </Typography>
                <Typography
                    color="text.secondary"
                    align="center"
                    sx={{ mb: 4, fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 480, mx: 'auto' }}
                >
                    {content.finalCta.subtitle}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        size="large"
                        endIcon={<HiOutlineArrowRight size={20} />}
                        onClick={() => handleAction(content.finalCta.button.action)}
                        sx={{ px: 4, py: 1.5, fontSize: '1rem', fontWeight: 700 }}
                    >
                        {content.finalCta.button.label}
                    </Button>
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={() => handleAction('login')}
                        sx={{ px: 4, py: 1.5, fontSize: '1rem', fontWeight: 600 }}
                    >
                        Request Demo
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
