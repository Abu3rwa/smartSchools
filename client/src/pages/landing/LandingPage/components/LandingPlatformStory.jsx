import { useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';

const WORKFLOW_IDS = ['gradebook', 'attendance', 'assignments'];

/**
 * The three classroom workflows. Desktop uses controlled tabs, smaller screens
 * use one accordion group; both share a single active selection so only the
 * visible tree is mounted and the ids stay unique.
 */
export default function LandingPlatformStory({ copy }) {
    const isDesktop = useMediaQuery('(min-width:960px)');
    const [activeWorkflowId, setActiveWorkflowId] = useState('gradebook');
    const desktopValue = activeWorkflowId || 'gradebook';

    const renderPanel = (workflowId) => {
        const workflow = copy.workflows?.[workflowId] || {};
        const steps = [workflow.step1, workflow.step2, workflow.step3];

        return (
            <Box
                id={`workflow-panel-${workflowId}`}
                role="tabpanel"
                aria-labelledby={`workflow-tab-${workflowId}`}
                tabIndex={0}
                sx={{ pt: { xs: 2, md: 3 }, outline: 'none' }}
            >
                <Typography
                    variant="h3"
                    sx={{
                        fontWeight: 700,
                        fontSize: { xs: '1.25rem', md: '1.5rem' },
                        mb: 1.5,
                    }}
                >
                    {workflow.title}
                </Typography>

                <Typography sx={{ fontSize: { xs: 16, md: 17 }, lineHeight: 1.65, color: 'text.secondary', mb: 2.5 }}>
                    {workflow.body}
                </Typography>

                <Box
                    component="ol"
                    sx={{
                        m: 0,
                        pl: 2.5,
                        display: 'grid',
                        gap: 1,
                        fontSize: { xs: 16, md: 17 },
                        lineHeight: 1.6,
                    }}
                >
                    {steps.map((step) => (
                        <Box component="li" key={step}>
                            {step}
                        </Box>
                    ))}
                </Box>

                {workflow.note ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
                        {workflow.note}
                    </Typography>
                ) : null}
            </Box>
        );
    };

    return (
        <Box component="section" id="product" className="landing-public-section">
            <Box className="landing-public-container">
                <Typography
                    component="h2"
                    id="product-heading"
                    tabIndex={-1}
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                        lineHeight: { xs: 1.3, lg: 1.2 },
                        mb: 1,
                        outline: 'none',
                    }}
                >
                    {copy.workflows?.title}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 2.5, md: 3 } }}>
                    {copy.workflows?.adminNote}
                </Typography>

                {isDesktop ? (
                    <Box>
                        <Tabs
                            value={desktopValue}
                            onChange={(_event, value) => setActiveWorkflowId(value)}
                            variant="fullWidth"
                            aria-label={copy.workflows?.tabsLabel}
                            sx={{
                                minHeight: 48,
                                '& .MuiTab-root': { minHeight: 48, fontWeight: 600, textTransform: 'none' },
                            }}
                        >
                            {WORKFLOW_IDS.map((workflowId) => (
                                <Tab
                                    key={workflowId}
                                    value={workflowId}
                                    id={`workflow-tab-${workflowId}`}
                                    aria-controls={`workflow-panel-${workflowId}`}
                                    label={copy.workflows?.[workflowId]?.title}
                                    sx={{
                                        borderBottom: 2,
                                        borderColor: 'divider',
                                        '&.Mui-selected': {
                                            borderColor: 'primary.main',
                                            fontWeight: 700,
                                        },
                                    }}
                                />
                            ))}
                        </Tabs>

                        {renderPanel(desktopValue)}
                    </Box>
                ) : (
                    <Box>
                        {WORKFLOW_IDS.map((workflowId) => {
                            const isOpen = activeWorkflowId === workflowId;
                            return (
                                <Accordion
                                    key={workflowId}
                                    expanded={isOpen}
                                    onChange={() => setActiveWorkflowId(isOpen ? null : workflowId)}
                                    disableGutters
                                    elevation={0}
                                    sx={{ borderBottom: 1, borderColor: 'divider', '&::before': { display: 'none' } }}
                                >
                                    <AccordionSummary
                                        id={`workflow-tab-${workflowId}`}
                                        aria-controls={`workflow-panel-${workflowId}`}
                                        sx={{ minHeight: 56, px: 0 }}
                                    >
                                        <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>
                                            {copy.workflows?.[workflowId]?.title}
                                        </Typography>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ px: 0, pb: 2 }}>{renderPanel(workflowId)}</AccordionDetails>
                                </Accordion>
                            );
                        })}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
