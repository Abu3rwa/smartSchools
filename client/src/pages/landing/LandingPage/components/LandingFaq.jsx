import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const FAQ_IDS = ['audience', 'signIn', 'tools', 'ai', 'demo', 'language'];

/**
 * The six questions a school asks before getting in touch. One answer is open
 * at a time and nothing here is fetched from the CMS.
 */
export default function LandingFaq({ copy }) {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <Box component="section" id="faq" className="landing-public-section">
            <Box className="landing-public-container">
                <Box sx={{ maxWidth: 840, mx: 'auto' }}>
                    <Typography
                        component="h2"
                        id="faq-heading"
                        tabIndex={-1}
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                            lineHeight: { xs: 1.3, lg: 1.2 },
                            mb: { xs: 2, md: 3 },
                            outline: 'none',
                        }}
                    >
                        {copy.faq?.title}
                    </Typography>

                    <Box sx={{ display: 'grid', gap: 1 }}>
                        {FAQ_IDS.map((faqId) => {
                            const entry = copy.faq?.[faqId] || {};
                            const isOpen = expandedId === faqId;
                            return (
                                <Accordion
                                    key={faqId}
                                    expanded={isOpen}
                                    onChange={() => setExpandedId(isOpen ? null : faqId)}
                                    disableGutters
                                    elevation={0}
                                    sx={{
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: '16px',
                                        '&::before': { display: 'none' },
                                        overflow: 'hidden',
                                    }}
                                >
                                    <AccordionSummary sx={{ minHeight: 56, px: 2 }}>
                                        <Typography sx={{ fontWeight: 600, fontSize: '1rem', pr: 1 }}>
                                            {entry.question}
                                        </Typography>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ px: 2, pb: 2.5 }}>
                                        <Typography sx={{ fontSize: 16, lineHeight: 1.7, color: 'text.secondary' }}>
                                            {entry.answer}
                                        </Typography>
                                    </AccordionDetails>
                                </Accordion>
                            );
                        })}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
