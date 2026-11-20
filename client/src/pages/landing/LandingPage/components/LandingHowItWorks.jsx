import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const SETUP_STEPS = [
    { marker: '01', titleKey: 'account', bodyKey: 'body' },
    { marker: '02', titleKey: 'access', bodyKey: 'body' },
    { marker: '03', titleKey: 'daily', bodyKey: 'body' },
];

/**
 * How a school goes from registration to everyday use. The markers are step
 * numbers, not metrics.
 */
export default function LandingHowItWorks({ copy, onRegister }) {
    return (
        <Box component="section" id="school-setup" className="landing-public-section">
            <Box className="landing-public-container">
                <Typography
                    component="h2"
                    id="school-setup-heading"
                    tabIndex={-1}
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: 28, sm: 30, md: 32, lg: 36 },
                        lineHeight: { xs: 1.3, lg: 1.2 },
                        mb: { xs: 2, md: 2.5 },
                        outline: 'none',
                    }}
                >
                    {copy.setup?.title}
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                        gap: { xs: 2, md: 3 },
                    }}
                >
                    {SETUP_STEPS.map((step) => (
                        <Box
                            key={step.marker}
                            sx={{
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: { xs: '16px', md: '18px' },
                                bgcolor: 'background.paper',
                                p: { xs: 2, md: 3 },
                                minWidth: 0,
                            }}
                        >
                            <Typography
                                aria-hidden="true"
                                sx={{
                                    fontWeight: 800,
                                    fontSize: '0.875rem',
                                    letterSpacing: 1.5,
                                    color: 'primary.main',
                                    mb: 1,
                                }}
                            >
                                {step.marker}
                            </Typography>
                            <Typography variant="h3" sx={{ fontWeight: 700, fontSize: '1.0625rem', mb: 1 }}>
                                {copy.setup?.[step.titleKey]?.title}
                            </Typography>
                            <Typography sx={{ fontSize: 16, lineHeight: 1.65, color: 'text.secondary' }}>
                                {copy.setup?.[step.titleKey]?.body}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                <Box
                    sx={{
                        mt: { xs: 2.5, md: 3 },
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: { xs: '16px', md: '18px' },
                        p: { xs: 2, md: 3 },
                        bgcolor: 'background.paper',
                    }}
                >
                    <Typography sx={{ fontWeight: 700, mb: 1.5 }}>{copy.setup?.registerLead}</Typography>
                    <Button variant="contained" onClick={onRegister} sx={{ minHeight: 48, fontWeight: 600 }}>
                        {copy.actions?.register}
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                        {copy.setup?.accountNote}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
