import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Final CTA section.
 */
export default function LandingCta({ content, handleAction }) {
    return (
        <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
            <Container maxWidth="sm">
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.finalCta.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>{content.finalCta.subtitle}</Typography>
                <Box sx={{ textAlign: 'center' }}>
                    <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={20} />} onClick={() => handleAction(content.finalCta.button.action)}>
                        {content.finalCta.button.label}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
}
