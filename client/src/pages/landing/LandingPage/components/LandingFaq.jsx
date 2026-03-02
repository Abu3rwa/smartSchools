import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { HiOutlineChevronDown } from 'react-icons/hi';

/**
 * FAQ accordion section. Uses landing-lift-card.
 */
export default function LandingFaq({ content }) {
    return (
        <Box id="faq" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
            <Container maxWidth="md">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.faq.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 4 }}>{content.faq.title}</Typography>
                {(content.faq.items || []).map((item, i) => (
                    <Accordion className="landing-lift-card" key={`${item.question || 'faq'}-${i}`} sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:before': { display: 'none' }, mb: 1 }}>
                        <AccordionSummary expandIcon={<HiOutlineChevronDown size={20} />}>
                            <Typography fontWeight={500}>{item.question}</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography color="text.secondary">{item.answer}</Typography>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Container>
        </Box>
    );
}
