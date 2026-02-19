import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchools, selectSchools, selectSchoolLoading } from '../store/slices/schoolSlice';
import { selectIsAuthenticated } from '../store/slices/authSlice';
import {
    HiOutlineAcademicCap,
    HiOutlineSearch,
    HiOutlineUserGroup,
    HiOutlinePlus,
    HiOutlineCheckCircle,
    HiOutlineChartBar,
    HiOutlineShieldCheck,
    HiOutlineCloud,
    HiOutlineDeviceMobile,
    HiOutlineSparkles,
    HiOutlineArrowRight,
    HiOutlineChevronDown,
    HiOutlineMenu,
    HiOutlineX,
    HiOutlineClipboardCheck,
    HiOutlineOfficeBuilding,
    HiOutlineUserAdd,
} from 'react-icons/hi';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import { getLandingContent } from '../services/landingContentService';
import { landingPageDefaults, resolveLandingTemplate } from '../config/landingPageDefaults';
import './LandingPage.css';

const featureIconMap = {
    gradebook: HiOutlineClipboardCheck,
    attendance: HiOutlineUserGroup,
    substitute: HiOutlineUserAdd,
    analytics: HiOutlineChartBar,
    security: HiOutlineShieldCheck,
    mobile: HiOutlineDeviceMobile,
};

const trustIconMap = {
    shield: HiOutlineShieldCheck,
    cloud: HiOutlineCloud,
    schools: HiOutlineOfficeBuilding,
    uptime: HiOutlineCheckCircle,
};

const featureMetaMap = {
    gradebook: { audience: 'For teachers', highlight: 'Faster grading cycles', tint: 'rgba(32,59,180,0.22)' },
    attendance: { audience: 'For operations', highlight: 'Cleaner daily routines', tint: 'rgba(14,165,233,0.2)' },
    substitute: { audience: 'For principals', highlight: 'Less scheduling friction', tint: 'rgba(245,158,11,0.2)' },
    analytics: { audience: 'For leadership', highlight: 'Data-backed decisions', tint: 'rgba(16,185,129,0.2)' },
    security: { audience: 'For admins', highlight: 'Safer school data', tint: 'rgba(99,102,241,0.2)' },
    mobile: { audience: 'For everyone', highlight: 'Work from anywhere', tint: 'rgba(147,63,231,0.2)' },
};

const LandingPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [searchTerm, setSearchTerm] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [content, setContent] = useState(landingPageDefaults);
    const [contentLoading, setContentLoading] = useState(true);
    const [contentError, setContentError] = useState('');

    useEffect(() => {
        let mounted = true;
        if (isAuthenticated) {
            navigate('/portal', { replace: true });
            return undefined;
        }

        dispatch(fetchSchools());

        const loadLandingContent = async () => {
            setContentLoading(true);
            try {
                const response = await getLandingContent();
                if (mounted && response?.content) {
                    setContent(response.content);
                    setContentError('');
                }
            } catch (error) {
                if (mounted) {
                    setContentError(
                        error?.response?.data?.message || 'Unable to load latest landing content. Showing defaults.'
                    );
                }
            } finally {
                if (mounted) {
                    setContentLoading(false);
                }
            }
        };

        loadLandingContent();
        return () => {
            mounted = false;
        };
    }, [dispatch, isAuthenticated, navigate]);

    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: content?.seo?.organizationName || content?.brand?.name || 'GradeBook Pro',
            description: content?.seo?.description || 'School management platform for grades, attendance, timetables, and parent communication.',
            url: window.location.origin
        });
        document.head.appendChild(script);
        return () => script.remove();
    }, [content]);

    const searchTrimmed = searchTerm.trim().toLowerCase();
    const filtered = searchTrimmed
        ? schools.filter(
            (s) =>
                s.name.toLowerCase().includes(searchTrimmed) ||
                s.slug.toLowerCase().includes(searchTrimmed)
        )
        : schools;
    const schoolsToShow = filtered.slice(0, 8);
    const hasSearchFilter = searchTrimmed.length > 0;

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        setMobileOpen(false);
    };

    const handleAction = (action) => {
        if (!action || typeof action !== 'string') return;
        if (action === '#') return;
        if (action === 'register') {
            navigate('/register-school');
            return;
        }
        if (action === 'login') {
            navigate('/login');
            return;
        }
        if (action.startsWith('scroll:')) {
            scrollTo(action.replace('scroll:', ''));
            return;
        }
        if (action.startsWith('mailto:')) {
            window.location.href = action;
            return;
        }
        if (action.startsWith('#')) {
            scrollTo(action.slice(1));
            return;
        }
        if (action.startsWith('http://') || action.startsWith('https://') || action === '/') {
            window.location.href = action;
        }
    };

    const heroBadge = schools.length > 0
        ? resolveLandingTemplate(content.hero.badgeTemplate, { schoolCount: schools.length })
        : content.hero.badgeFallback;

    const trustItems = (content.trustStrip || [])
        .map((item) => ({
            ...item,
            text: resolveLandingTemplate(item.text, { schoolCount: schools.length })
        }))
        .filter((item) => Boolean(item.text));

    const noMatchMessage = resolveLandingTemplate(content.findSchool.noMatchTemplate, { searchTerm });
    const matchingLabel = resolveLandingTemplate(content.findSchool.matchingLabelTemplate, { searchTerm });
    const showingLimitText = resolveLandingTemplate(content.findSchool.showingLimitTemplate, {
        shownCount: schoolsToShow.length,
        totalCount: filtered.length
    });
    const totalSchoolCountLabel = `${schools.length} ${schools.length === 1 ? 'school' : 'schools'} available`;
    const filteredSchoolCountLabel = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;
    const copyrightText = resolveLandingTemplate(content.footer.copyrightTemplate, {
        year: new Date().getFullYear(),
        copyrightName: content.brand.copyrightName
    });

    if (loading || contentLoading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
                <Paper className="landing-loading-shell" variant="outlined">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <Box className="landing-loading-logo">
                            <HiOutlineAcademicCap size={20} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{content.brand.name}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Loading school experience...
                    </Typography>
                    <CircularProgress size={24} />
                </Paper>
            </Box>
        );
    }

    const navContent = (
        <>
            {(content.navigation || []).map(({ label, id }) => (
                <Button key={id} href={`#${id}`} onClick={() => scrollTo(id)} sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {label}
                </Button>
            ))}
            <Button onClick={() => handleAction('login')} sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {content.header.loginLabel}
            </Button>
            <Button variant="contained" onClick={() => handleAction('register')} sx={{ fontWeight: 600, bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } }}>
                {content.header.startLabel}
            </Button>
        </>
    );

    return (
        <Box sx={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
            <div className="landing-bg-gradient" aria-hidden="true" />
            <div className="landing-bg-mesh" aria-hidden="true" />

            <AppBar position="fixed" elevation={0} sx={{ bgcolor: 'rgba(15,15,26,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Toolbar sx={{ justifyContent: 'space-between', maxWidth: 1280, mx: 'auto', width: '100%' }}>
                    <Button onClick={() => window.scrollTo(0, 0)} sx={{ color: 'inherit', textTransform: 'none' }} startIcon={
                        <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <HiOutlineAcademicCap size={24} />
                        </Box>
                    }>
                        <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', backgroundClip: 'text', color: 'transparent' }}>
                            {content.brand.name}
                        </Typography>
                    </Button>
                    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1 }}>
                        {navContent}
                    </Box>
                    <IconButton sx={{ display: { lg: 'none' }, color: 'inherit' }} onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
                        <HiOutlineMenu size={24} />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Drawer anchor="right" open={mobileOpen} onClose={() => setMobileOpen(false)} PaperProps={{ sx: { width: 280, bgcolor: 'background.default' } }}>
                <Box sx={{ p: 3, pt: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(content.navigation || []).map(({ label, id }) => (
                        <Button key={id} href={`#${id}`} fullWidth onClick={() => scrollTo(id)} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
                            {label}
                        </Button>
                    ))}
                    <Button fullWidth onClick={() => { setMobileOpen(false); handleAction('login'); }} sx={{ color: 'text.secondary' }}>{content.header.loginLabel}</Button>
                    <Button variant="contained" fullWidth onClick={() => { setMobileOpen(false); handleAction('register'); }} sx={{ bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } }}>{content.header.startLabel}</Button>
                </Box>
            </Drawer>

            {/* Hero */}
            <Box component="section" sx={{ position: 'relative', zIndex: 1, pt: { xs: 14, md: 16 }, pb: { xs: 6, md: 10 }, px: 2 }}>
                <Container maxWidth="lg">
                    {contentError ? (
                        <Paper
                            variant="outlined"
                            sx={{ mb: 3, p: 2, borderColor: 'warning.main', bgcolor: 'rgba(245,158,11,0.1)' }}
                        >
                            <Typography variant="body2" color="warning.main">{contentError}</Typography>
                        </Paper>
                    ) : null}
                    <Grid container spacing={6} alignItems="center">
                        <Grid item xs={12} lg={6}>
                            <Paper variant="outlined" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, mb: 3, borderRadius: 10, borderColor: 'primary.main', bgcolor: 'rgba(90,174,238,0.1)' }}>
                                <HiOutlineSparkles size={16} />
                                <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'primary.main' }}>
                                    {heroBadge}
                                </Typography>
                            </Paper>
                            <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 2, lineHeight: 1.15 }}>
                                {content.hero.title}
                            </Typography>
                            <Typography color="text.secondary" sx={{ fontSize: '1.125rem', mb: 3, maxWidth: 520 }}>
                                {content.hero.subtitle}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
                                <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={18} />} onClick={() => handleAction(content.hero.primaryCta.action)} sx={{ bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } }}>
                                    {content.hero.primaryCta.label}
                                </Button>
                                <Button variant="outlined" size="large" onClick={() => handleAction(content.hero.secondaryCta.action)}>{content.hero.secondaryCta.label}</Button>
                            </Box>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                    display: 'block',
                                    mt: 1,
                                    animation: 'fadeIn 1s ease-out',
                                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
                                }}
                            >
                                {content.hero.scrollHint}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, color: 'text.secondary', typography: 'body2' }}>
                                {(content.hero.highlights || []).map((t) => (
                                    <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        <HiOutlineCheckCircle size={16} style={{ color: '#10b981' }} /> {t}
                                    </Box>
                                ))}
                            </Box>
                        </Grid>
                        <Grid item xs={12} lg={6} sx={{ display: 'flex', justifyContent: { lg: 'flex-end' } }}>
                            <Paper className="landing-elevated-card" sx={{ width: '100%', maxWidth: 440, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27c93f' }} />
                                </Box>
                                <Box sx={{ p: 2 }}>
                                    <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                        {(content.hero.preview.metrics || []).map(({ value, label }) => (
                                            <Grid item xs={4} key={label || value}>
                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.06)' }}>
                                                    <Typography variant="h6">{value}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <Grid container sx={{ typography: 'caption', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {(content.hero.preview.tableHeaders || []).map((h) => (
                                            <Grid item xs={4} key={h} sx={{ py: 1, px: 1.5, color: 'text.secondary', fontWeight: 600 }}>{h}</Grid>
                                        ))}
                                        {(content.hero.preview.tableRows || []).map((row, i) => (
                                            row.map((cell, j) => (
                                                <Grid item xs={4} key={`${i}-${j}`} sx={{ py: 1, px: 1.5, color: j === 0 ? 'text.primary' : 'text.secondary' }}>{cell}</Grid>
                                            ))
                                        ))}
                                    </Grid>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            {/* Trust strip */}
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

            {/* How it works */}
            <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.howItWorks.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.howItWorks.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                        {content.howItWorks.subtitle}
                    </Typography>
                    <Grid container spacing={3}>
                        {(content.howItWorks.steps || []).map(({ title, description }, index) => (
                            <Grid item xs={12} md={4} key={title || index}>
                                <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, textAlign: 'center', height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
                                    <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, mx: 'auto', mb: 2 }}>{index + 1}</Box>
                                    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary">{description}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* Features */}
            <Box id="features" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.features.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.features.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                        {content.features.subtitle}
                    </Typography>
                    <Grid container spacing={3}>
                        {(content.features.items || []).map(({ iconKey, title, description }, index) => {
                            const Icon = featureIconMap[iconKey] || HiOutlineSparkles;
                            const featureMeta = featureMetaMap[iconKey] || {
                                audience: 'For schools',
                                highlight: `Feature ${index + 1}`,
                                tint: 'rgba(90,174,238,0.2)'
                            };
                            return (
                            <Grid item xs={12} sm={6} lg={4} key={title} sx={{ display: 'flex' }}>
                                <Paper
                                    className="landing-feature-card landing-lift-card"
                                    variant="outlined"
                                    sx={{ p: 3, height: '100%', width: '100%', '--feature-tint': featureMeta.tint }}
                                >
                                    <Box className="landing-feature-card-accent" aria-hidden="true" />
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
                                        <Box className="landing-feature-card-icon" sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                                            <Icon size={26} />
                                        </Box>
                                        <Chip
                                            size="small"
                                            label={featureMeta.audience}
                                            className="landing-feature-chip"
                                            sx={{ alignSelf: 'center' }}
                                        />
                                    </Box>
                                    <Typography variant="h6" sx={{ mb: 1.25 }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{description}</Typography>
                                    <Box className="landing-feature-card-footer" sx={{ mt: 2.25 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            {featureMeta.highlight}
                                        </Typography>
                                        <HiOutlineArrowRight size={15} />
                                    </Box>
                                </Paper>
                            </Grid>
                            );
                        })}
                    </Grid>
                </Container>
            </Box>

            {/* Pricing */}
            <Box id="pricing" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.pricing.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.pricing.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>{content.pricing.subtitle}</Typography>
                    <Grid container spacing={3} justifyContent="center">
                        {(content.pricing.plans || []).map((plan) => (
                            <Grid item xs={12} md={4} key={`${plan.name}-${plan.price}`}>
                                <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', borderColor: plan.featured ? 'primary.main' : undefined, boxShadow: plan.featured ? 4 : 0 }}>
                                    {plan.featured && (
                                        <Typography variant="caption" sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', px: 1.5, py: 0.5, borderRadius: 10, bgcolor: 'primary.main', color: 'white', fontWeight: 600 }}>Most popular</Typography>
                                    )}
                                    <Typography variant="h6" sx={{ mb: 0.5 }}>{plan.name}</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{plan.price}<Typography component="span" variant="body2" color="text.secondary">{plan.period}</Typography></Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{plan.description}</Typography>
                                    <Box sx={{ flex: 1 }}>
                                        {(plan.features || []).map((f) => (
                                            <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, typography: 'body2', color: 'text.secondary' }}>
                                                <HiOutlineCheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} /> {f}
                                            </Box>
                                        ))}
                                    </Box>
                                    <Button
                                        fullWidth
                                        variant={plan.featured ? 'contained' : 'outlined'}
                                        sx={{
                                            mt: 2,
                                            ...(plan.featured ? { bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } } : {})
                                        }}
                                        onClick={() => handleAction(plan.ctaAction)}
                                    >
                                        {plan.ctaLabel}
                                    </Button>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* Testimonials */}
            <Box id="testimonials" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.testimonials.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.testimonials.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>{content.testimonials.subtitle}</Typography>
                    <Grid container spacing={3}>
                        {(content.testimonials.items || []).map((t, index) => (
                            <Grid item xs={12} md={4} key={`${t.initials || 't'}-${index}`}>
                                <Paper className="landing-lift-card" variant="outlined" sx={{ p: 3, height: '100%' }}>
                                    <Typography color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>&ldquo;{t.quote}&rdquo;</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Typography variant="body2" fontWeight={600} color="primary.main">{t.initials}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography fontWeight={600}>{t.name}</Typography>
                                            <Typography variant="body2" color="text.secondary">{t.role}</Typography>
                                        </Box>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* FAQ */}
            <Box id="faq" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
                <Container maxWidth="md">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.faq.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 4 }}>{content.faq.title}</Typography>
                    {(content.faq.items || []).map((item, i) => (
                        <Accordion className="landing-lift-card" key={`${item.question || 'faq'}-${i}`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', '&:before': { display: 'none' }, mb: 1 }}>
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

            {/* CTA */}
            <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
                <Container maxWidth="sm">
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.finalCta.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>{content.finalCta.subtitle}</Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={20} />} onClick={() => handleAction(content.finalCta.button.action)} sx={{ bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } }}>
                            {content.finalCta.button.label}
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Find school */}
            <Box id="find-school" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
                <Container maxWidth="md">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>{content.findSchool.overline}</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>{content.findSchool.title}</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>{content.findSchool.subtitle}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <Chip size="small" label={totalSchoolCountLabel} sx={{ bgcolor: 'rgba(90,174,238,0.15)', color: 'primary.main' }} />
                        {hasSearchFilter ? (
                            <Chip size="small" label={filteredSchoolCountLabel} variant="outlined" />
                        ) : null}
                    </Box>
                    <TextField
                        fullWidth
                        placeholder={content.findSchool.searchPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <HiOutlineSearch size={20} />
                                </InputAdornment>
                            ),
                            endAdornment: hasSearchFilter ? (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        aria-label="Clear search"
                                        onClick={() => setSearchTerm('')}
                                    >
                                        <HiOutlineX size={16} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null,
                        }}
                        sx={{ mb: 1.5 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                        Type at least 2 letters to quickly find your school.
                    </Typography>
                    <Box sx={{ mb: 3 }}>
                        {hasSearchFilter && filtered.length === 0 ? (
                            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                                <HiOutlineSearch size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                                <Typography color="text.secondary">{noMatchMessage}</Typography>
                            </Paper>
                        ) : schoolsToShow.length > 0 ? (
                            <>
                                {!hasSearchFilter ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {content.findSchool.schoolsLabel}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        {matchingLabel}
                                    </Typography>
                                )}
                                <Grid container spacing={2}>
                                {schoolsToShow.map((school) => (
                                    <Grid item xs={12} sm={6} key={school._id}>
                                        <Button className="landing-school-item" fullWidth variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 2, px: 2 }} onClick={() => navigate(`/login/${school.slug}`)}>
                                            <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: 'primary.main', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5 }}>
                                                <HiOutlineOfficeBuilding size={22} style={{ color: 'var(--mui-palette-primary-main)' }} />
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body1" fontWeight={600} noWrap>{school.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">Up to {school.settings?.maxStudents || 50} students</Typography>
                                            </Box>
                                        </Button>
                                    </Grid>
                                ))}
                                </Grid>
                                {filtered.length > 8 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                                        {showingLimitText}
                                    </Typography>
                                )}
                            </>
                        ) : (
                            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                                <HiOutlineAcademicCap size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                                <Typography color="text.secondary">{content.findSchool.noSchoolsMessage}</Typography>
                            </Paper>
                        )}
                    </Box>
                    <Typography color="text.secondary" align="center" sx={{ mb: 1.5 }}>{content.findSchool.registerPrompt}</Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button variant="contained" startIcon={<HiOutlinePlus size={18} />} onClick={() => handleAction('register')} sx={{ bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#3b82f6' } }}>
                            {content.findSchool.registerCtaLabel}
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Footer */}
            <Box component="footer" sx={{ py: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Container maxWidth="lg">
                    <Grid container spacing={4} sx={{ mb: 3 }}>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <HiOutlineAcademicCap size={22} style={{ color: 'white' }} />
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', backgroundClip: 'text', color: 'transparent' }}>{content.brand.name}</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">{content.brand.tagline}</Typography>
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <Grid container spacing={4}>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.productTitle}</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {(content.footer.productLinks || []).map((link, index) => (
                                            <Button key={`product-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                        ))}
                                    </Box>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.companyTitle}</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {(content.footer.companyLinks || []).map((link, index) => (
                                            <Button key={`company-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                        ))}
                                    </Box>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>{content.footer.legalTitle}</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {(content.footer.legalLinks || []).map((link, index) => (
                                            <Button key={`legal-link-${index}-${link.label}`} size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }} onClick={() => handleAction(link.action)}>{link.label}</Button>
                                        ))}
                                    </Box>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                    <Typography variant="body2" color="text.secondary" sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        {copyrightText}
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
};

export default LandingPage;
