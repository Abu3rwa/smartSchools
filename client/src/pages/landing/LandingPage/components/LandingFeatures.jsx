import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { featureIconMap, featureMetaMap } from '../constants.js';
import { HiOutlineSparkles, HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Features grid from CMS content.
 * Uses .landing-card-grid (CSS Grid) for perfectly equal-width cards.
 */
export default function LandingFeatures({ content }) {
    return (
        <Box id="features" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
            <Container maxWidth="lg">
                <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1, letterSpacing: 2, fontWeight: 700 }}>
                    PLATFORM FEATURES
                </Typography>
                <Typography variant="h4" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
                    {content.features.title}
                </Typography>
                <Typography color="text.secondary" align="center" sx={{ maxWidth: 600, mx: 'auto', mb: 5, fontSize: '1.05rem', lineHeight: 1.7 }}>
                    {content.features.subtitle}
                </Typography>

                <div className="landing-card-grid">
                    {(content.features.items || []).map(({ iconKey, title, description }, index) => {
                        const Icon = featureIconMap[iconKey] || HiOutlineSparkles;
                        const featureMeta = featureMetaMap[iconKey] || { audience: 'For schools', highlight: `Feature ${index + 1}`, tint: 'rgba(13,148,136,0.2)' };
                        return (
                            <Paper
                                key={title || index}
                                className="landing-feature-card landing-lift-card"
                                variant="outlined"
                                sx={{
                                    p: 3,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%',
                                    '--feature-tint': featureMeta.tint,
                                }}
                            >
                                <Box className="landing-feature-card-accent" aria-hidden="true" />
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
                                    <Box className="landing-feature-card-icon" sx={{ width: 52, height: 52, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main', flexShrink: 0 }}>
                                        <Icon size={26} />
                                    </Box>
                                    <Chip size="small" label={featureMeta.audience} className="landing-feature-chip" sx={{ alignSelf: 'center' }} />
                                </Box>
                                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, flex: 1 }}>
                                    {description}
                                </Typography>
                                <Box className="landing-feature-card-footer" sx={{ mt: 2 }}>
                                    <Typography variant="caption" color="text.secondary">{featureMeta.highlight}</Typography>
                                    <HiOutlineArrowRight size={14} aria-hidden />
                                </Box>
                            </Paper>
                        );
                    })}
                </div>
            </Container>
        </Box>
    );
}
