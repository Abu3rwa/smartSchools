import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { trustIconMap } from '../constants.js';
import { HiOutlineCheckCircle } from 'react-icons/hi';

/**
 * Enhanced trust strip with icon + text items and stronger visual weight.
 */
export default function LandingTrustStrip({ trustItems }) {
    return (
        <Box
            sx={{
                py: 3.5,
                borderTop: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--brand-gradient)',
                    opacity: 0.04,
                    zIndex: 0,
                },
            }}
        >
            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: { xs: 3, sm: 5 },
                        color: 'text.secondary',
                    }}
                >
                    {trustItems.map((item) => {
                        const TrustIcon = trustIconMap[item.iconKey] || HiOutlineCheckCircle;
                        return (
                            <Box
                                key={`${item.iconKey}-${item.text}`}
                                component="span"
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 1,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 1.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: 'action.hover',
                                        color: 'primary.main',
                                    }}
                                >
                                    <TrustIcon size={17} aria-hidden />
                                </Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {item.text}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>
            </Container>
        </Box>
    );
}
