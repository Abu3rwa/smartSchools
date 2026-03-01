import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import { featureIconMap, featureMetaMap } from '../constants.js';
import { HiOutlineSparkles, HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Features grid with icon cards. Uses landing-feature-card, landing-lift-card, landing-feature-chip.
 */
export default function LandingFeatures({ content }) {
    return (
        <Box id="features" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.features.overline}</Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.features.title}</Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                    {content.features.subtitle}
                </Typography>
                <Grid container spacing={3} alignItems="stretch">
                    {(content.features.items || []).map(({ iconKey, title, description }, index) => {
                        const Icon = featureIconMap[iconKey] || HiOutlineSparkles;
                        const featureMeta = featureMetaMap[iconKey] || { audience: 'For schools', highlight: `Feature ${index + 1}`, tint: 'rgba(90,174,238,0.2)' };
                        return (
                            <Grid item xs={12} sm={6} md={4} key={title}>
                                <Paper
                                    className="landing-feature-card landing-lift-card"
                                    variant="outlined"
                                    sx={{
                                        p: 3,
                                        height: '100%',
                                        minHeight: { xs: 260, sm: 290, md: 310 },
                                        display: 'flex',
                                        flexDirection: 'column',
                                        '--feature-tint': featureMeta.tint,
                                    }}
                                >
                                    <Box className="landing-feature-card-accent" aria-hidden="true" />
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
                                        <Box className="landing-feature-card-icon" sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                                            <Icon size={26} />
                                        </Box>
                                        <Chip size="small" label={featureMeta.audience} className="landing-feature-chip" sx={{ alignSelf: 'center' }} />
                                    </Box>
                                    <Typography variant="h6" sx={{ mb: 1.25 }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{description}</Typography>
                                    <Box className="landing-feature-card-footer" sx={{ mt: 'auto', pt: 2 }}>
                                        <Typography variant="caption" color="text.secondary">{featureMeta.highlight}</Typography>
                                        <HiOutlineArrowRight size={15} />
                                    </Box>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            </Container>
        </Box>
    );
}

