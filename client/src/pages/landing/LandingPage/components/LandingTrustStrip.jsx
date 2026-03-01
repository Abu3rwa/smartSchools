import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { trustIconMap } from '../constants.js';
import { HiOutlineCheckCircle } from 'react-icons/hi';

/**
 * Trust strip with icon + text items.
 */
export default function LandingTrustStrip({ trustItems }) {
    return (
        <Box sx={{ py: 2, borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Container maxWidth="lg">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 2, sm: 4 }, color: 'text.secondary', typography: 'body2', fontWeight: 500 }}>
                    {trustItems.map((item) => {
                        const TrustIcon = trustIconMap[item.iconKey] || HiOutlineCheckCircle;
                        return (
                            <Box key={`${item.iconKey}-${item.text}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                <TrustIcon size={18} aria-hidden />
                                {item.text}
                            </Box>
                        );
                    })}
                </Box>
            </Container>
        </Box>
    );
}
