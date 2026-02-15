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
    HiOutlineMail,
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
import './LandingPage.css';

const FAQ_ITEMS = [
    { q: 'How does the free trial work?', a: 'Start with our Free plan—no credit card required. You get up to 50 students, full gradebook, attendance, teacher substitution, and parent notifications. Upgrade to Growth anytime when you need more capacity or premium features.' },
    { q: 'What is teacher substitution?', a: 'When a teacher is absent, department principals create a sub request, select available substitutes from the system, and teachers receive an email with a secure link to confirm or decline. The system prevents double-booking and keeps a full audit trail.' },
    { q: 'Is my school data secure?', a: 'Yes. We use bank-level encryption, secure cloud hosting, and are designed for GDPR compliance. Each school\'s data is fully isolated—no other institution can access your information.' },
    { q: 'Can we use our own branding?', a: 'Growth and Enterprise plans support white-label options: custom logo, colors, and domain so parents and staff see your school\'s brand when they log in.' },
    { q: 'Do you integrate with existing systems?', a: 'We offer CSV import for students and grades. Enterprise plans can include API access and custom integrations—contact us to discuss your needs.' },
    { q: 'What kind of support do you offer?', a: 'All plans include email support. Growth adds priority support; Enterprise includes a dedicated success manager and optional training for your staff.' },
];

const navLinks = [
    { label: 'Features', id: 'features' },
    { label: 'Pricing', id: 'pricing' },
    { label: 'Testimonials', id: 'testimonials' },
    { label: 'FAQ', id: 'faq' },
    { label: 'Find your school', id: 'find-school' },
];

const LandingPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [searchTerm, setSearchTerm] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/portal', { replace: true });
            return;
        }
        dispatch(fetchSchools());
    }, [dispatch, isAuthenticated, navigate]);

    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'GradeBook Pro',
            description: 'School management platform for grades, attendance, timetables, and parent communication.',
            url: window.location.origin
        });
        document.head.appendChild(script);
        return () => script.remove();
    }, []);

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

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
                <CircularProgress />
            </Box>
        );
    }

    const navContent = (
        <>
            {navLinks.map(({ label, id }) => (
                <Button key={id} href={`#${id}`} onClick={() => scrollTo(id)} sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {label}
                </Button>
            ))}
            <Button onClick={() => navigate('/login')} sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Log in
            </Button>
            <Button variant="contained" onClick={() => navigate('/register-school')} sx={{ fontWeight: 600 }}>
                Start free
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
                            GradeBook Pro
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
                    {navLinks.map(({ label, id }) => (
                        <Button key={id} href={`#${id}`} fullWidth onClick={() => scrollTo(id)} sx={{ justifyContent: 'flex-start', color: 'text.primary' }}>
                            {label}
                        </Button>
                    ))}
                    <Button fullWidth onClick={() => { setMobileOpen(false); navigate('/login'); }} sx={{ color: 'text.secondary' }}>Log in</Button>
                    <Button variant="contained" fullWidth onClick={() => { setMobileOpen(false); navigate('/register-school'); }}>Start free</Button>
                </Box>
            </Drawer>

            {/* Hero */}
            <Box component="section" sx={{ position: 'relative', zIndex: 1, pt: { xs: 14, md: 16 }, pb: { xs: 6, md: 10 }, px: 2 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={6} alignItems="center">
                        <Grid item xs={12} lg={6}>
                            <Paper variant="outlined" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, mb: 3, borderRadius: 10, borderColor: 'primary.main', bgcolor: 'rgba(90,174,238,0.1)' }}>
                                <HiOutlineSparkles size={16} />
                                <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'primary.main' }}>
                                    {schools.length > 0 ? `Used by ${schools.length}+ schools` : 'Trusted by schools worldwide'}
                                </Typography>
                            </Paper>
                            <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 2, lineHeight: 1.15 }}>
                                The gradebook that runs your school—not the other way around
                            </Typography>
                            <Typography color="text.secondary" sx={{ fontSize: '1.125rem', mb: 3, maxWidth: 520 }}>
                                Daily grades, attendance, timetables, and parent communication in one place. Start free with up to 50 students—no credit card required.
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
                                <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={18} />} onClick={() => navigate('/register-school')}>
                                    Start free trial
                                </Button>
                                <Button variant="outlined" size="large" onClick={() => scrollTo('pricing')}>See pricing</Button>
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
                                Scroll to explore
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, color: 'text.secondary', typography: 'body2' }}>
                                {['Free up to 50 students', 'No credit card', 'Cancel anytime'].map((t) => (
                                    <Box key={t} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        <HiOutlineCheckCircle size={16} style={{ color: '#10b981' }} /> {t}
                                    </Box>
                                ))}
                            </Box>
                        </Grid>
                        <Grid item xs={12} lg={6} sx={{ display: 'flex', justifyContent: { lg: 'flex-end' } }}>
                            <Paper sx={{ width: '100%', maxWidth: 440, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Box sx={{ display: 'flex', gap: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e' }} />
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27c93f' }} />
                                </Box>
                                <Box sx={{ p: 2 }}>
                                    <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                        {[[245, 'Students'], [18, 'Classes'], ['92%', 'Attendance']].map(([num, label]) => (
                                            <Grid item xs={4} key={label}>
                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.06)' }}>
                                                    <Typography variant="h6">{num}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <Grid container sx={{ typography: 'caption', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        {['Class', 'Subject', 'Grades today'].map((h) => (
                                            <Grid item xs={4} key={h} sx={{ py: 1, px: 1.5, color: 'text.secondary', fontWeight: 600 }}>{h}</Grid>
                                        ))}
                                        {[['10-A', 'Math', '24'], ['10-B', 'Science', '22'], ['11-A', 'English', '20']].map((row, i) => (
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
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><HiOutlineShieldCheck size={18} aria-hidden /> Secure & compliant</Box>
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><HiOutlineCloud size={18} aria-hidden /> Cloud-based</Box>
                        {schools.length > 0 && (
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                                {schools.length}+ schools
                            </Box>
                        )}
                        <Box component="span">99.9% uptime</Box>
                    </Box>
                </Container>
            </Box>

            {/* How it works */}
            <Box component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper' }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>How it works</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Get started in minutes</Typography>
                    <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                        Register your school, add classes and teachers, then start recording grades and attendance.
                    </Typography>
                    <Grid container spacing={3}>
                        {[
                            { n: 1, title: 'Create your school', desc: 'Sign up with your school details. No credit card required for the Free plan.' },
                            { n: 2, title: 'Add classes & teachers', desc: 'Set up grades, subjects, and assign teachers. Import students via CSV if you like.' },
                            { n: 3, title: 'Start managing', desc: 'Enter daily grades, take attendance, and send reports to parents—all from one dashboard.' },
                        ].map(({ n, title, desc }) => (
                            <Grid item xs={12} md={4} key={n}>
                                <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', height: '100%', '&:hover': { borderColor: 'primary.main' } }}>
                                    <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, mx: 'auto', mb: 2 }}>{n}</Box>
                                    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary">{desc}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* Features */}
            <Box id="features" component="section" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: 80 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>Features</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Built for how schools actually work</Typography>
                    <Typography color="text.secondary" align="center" sx={{ maxWidth: 580, mx: 'auto', mb: 4 }}>
                        One platform for grades, attendance, timetables, and parent communication.
                    </Typography>
                    <Grid container spacing={3}>
                        {[
                            { icon: HiOutlineClipboardCheck, title: 'Daily gradebook', desc: 'Bulk entry by class, automatic averages, and report generation. Configure max marks and passing criteria per subject.' },
                            { icon: HiOutlineUserGroup, title: 'Attendance & timetable', desc: 'Period-based timetables and attendance. Teachers see their day at a glance and record attendance in one click.' },
                            { icon: HiOutlineUserAdd, title: 'Teacher substitution', desc: 'When a teacher is absent, principals create sub requests, see available substitutes, and teachers confirm or decline via secure links. Full audit trail and no double-booking.' },
                            { icon: HiOutlineMail, title: 'Parent notifications', desc: 'Send grade updates and reports on demand. Optional Gmail integration for a professional sender address.' },
                            { icon: HiOutlineChartBar, title: 'Analytics & reports', desc: 'Dashboards, monthly and semester averages, and AI-powered report generation for parents and admins.' },
                            { icon: HiOutlineShieldCheck, title: 'Multi-tenant & secure', desc: 'Each school\'s data is isolated. Role-based access, secure auth, and white-label options on paid plans.' },
                            { icon: HiOutlineDeviceMobile, title: 'Works everywhere', desc: 'Responsive web app—use it on desktop, tablet, or phone. No separate app install required.' },
                        ].map(({ icon: Icon, title, desc }) => (
                            <Grid item xs={12} sm={6} lg={4} key={title}>
                                <Paper variant="outlined" sx={{ p: 3, height: '100%', '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(90,174,238,0.04)' } }}>
                                    <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'rgba(90,174,238,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main', mb: 2 }}>
                                        <Icon size={26} />
                                    </Box>
                                    <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
                                    <Typography variant="body2" color="text.secondary">{desc}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            {/* Pricing */}
            <Box id="pricing" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
                <Container maxWidth="lg">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>Pricing</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Simple, transparent pricing</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>Start free. Scale when you grow. No hidden fees.</Typography>
                    <Grid container spacing={3} justifyContent="center">
                        {[
                            { name: 'Starter', price: '$0', period: '/month', desc: 'Up to 50 students', features: ['Full gradebook', 'Attendance & timetable', 'Teacher substitution', 'Parent notifications', 'Email support'], featured: false, cta: 'Start free', ctaAction: 'register' },
                            { name: 'Growth', price: '$2', period: '/student/mo', desc: 'Unlimited students + premium features', features: ['Everything in Starter', 'White-label branding', 'Priority support', 'Usage analytics'], featured: true, cta: 'Get started', ctaAction: 'register' },
                            { name: 'Enterprise', price: 'Custom', period: '', desc: 'Advanced features & dedicated support', features: ['Everything in Growth', 'Custom integrations', 'Dedicated success manager', 'SLA & training'], featured: false, cta: 'Contact sales', ctaAction: 'contact' },
                        ].map((plan) => (
                            <Grid item xs={12} md={4} key={plan.name}>
                                <Paper variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', borderColor: plan.featured ? 'primary.main' : undefined, boxShadow: plan.featured ? 4 : 0 }}>
                                    {plan.featured && (
                                        <Typography variant="caption" sx={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', px: 1.5, py: 0.5, borderRadius: 10, bgcolor: 'primary.main', color: 'white', fontWeight: 600 }}>Most popular</Typography>
                                    )}
                                    <Typography variant="h6" sx={{ mb: 0.5 }}>{plan.name}</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{plan.price}<Typography component="span" variant="body2" color="text.secondary">{plan.period}</Typography></Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{plan.desc}</Typography>
                                    <Box sx={{ flex: 1 }}>
                                        {plan.features.map((f) => (
                                            <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, typography: 'body2', color: 'text.secondary' }}>
                                                <HiOutlineCheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} /> {f}
                                            </Box>
                                        ))}
                                    </Box>
                                    <Button
                                        fullWidth
                                        variant={plan.featured ? 'contained' : 'outlined'}
                                        sx={{ mt: 2 }}
                                        onClick={() => plan.ctaAction === 'contact' ? window.location.href = 'mailto:support@gradebookpro.com?subject=Enterprise%20inquiry' : navigate('/register-school')}
                                    >
                                        {plan.cta}
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
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>Testimonials</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Loved by educators</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 4 }}>See what admins and teachers say about GradeBook Pro.</Typography>
                    <Grid container spacing={3}>
                        {[
                            { quote: 'The analytics dashboard alone has saved us hours each week. Parents love the real-time grade updates.', name: 'Dr. Jane Davis', role: 'Principal, Lincoln High School', initials: 'JD' },
                            { quote: 'We switched from spreadsheets last year. Setup was quick, and our teachers actually use it every day.', name: 'Mark Stevens', role: 'IT Director, Riverside Academy', initials: 'MS' },
                            { quote: 'I can update grades and take attendance from my phone between classes. Game-changer.', name: 'Sarah Chen', role: 'Math Teacher, Oak Valley School', initials: 'SC' },
                        ].map((t) => (
                            <Grid item xs={12} md={4} key={t.initials}>
                                <Paper variant="outlined" sx={{ p: 3, height: '100%' }}>
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
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>FAQ</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 4 }}>Frequently asked questions</Typography>
                    {FAQ_ITEMS.map((item, i) => (
                        <Accordion key={i} sx={{ bgcolor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', '&:before': { display: 'none' }, mb: 1 }}>
                            <AccordionSummary expandIcon={<HiOutlineChevronDown size={20} />}>
                                <Typography fontWeight={500}>{item.q}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography color="text.secondary">{item.a}</Typography>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </Container>
            </Box>

            {/* CTA */}
            <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
                <Container maxWidth="sm">
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Ready to simplify your school?</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>Join schools that switched from spreadsheets and paperwork to one clear system.</Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button variant="contained" size="large" endIcon={<HiOutlineArrowRight size={20} />} onClick={() => navigate('/register-school')}>
                            Start free trial
                        </Button>
                    </Box>
                </Container>
            </Box>

            {/* Find school */}
            <Box id="find-school" component="section" sx={{ py: { xs: 8, md: 10 }, bgcolor: 'background.paper', scrollMarginTop: 80 }}>
                <Container maxWidth="md">
                    <Typography variant="overline" color="primary" sx={{ display: 'block', textAlign: 'center', mb: 1 }}>Find your school</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 1 }}>Log in to your institution</Typography>
                    <Typography color="text.secondary" align="center" sx={{ mb: 3 }}>Search for your school to log in, or register a new one.</Typography>
                    <TextField
                        fullWidth
                        placeholder="Search by school name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <HiOutlineSearch size={20} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mb: 3 }}
                    />
                    <Box sx={{ mb: 3 }}>
                        {hasSearchFilter && filtered.length === 0 ? (
                            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                                <HiOutlineSearch size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                                <Typography color="text.secondary">No schools match &quot;{searchTerm}&quot;. Try a different search or register your school.</Typography>
                            </Paper>
                        ) : schoolsToShow.length > 0 ? (
                            <>
                                {!hasSearchFilter ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Schools on GradeBook Pro
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Matching &quot;{searchTerm}&quot;
                                    </Typography>
                                )}
                                <Grid container spacing={2}>
                                {schoolsToShow.map((school) => (
                                    <Grid item xs={12} sm={6} key={school._id}>
                                        <Button fullWidth variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 2, px: 2 }} onClick={() => navigate(`/login/${school.slug}`)}>
                                            <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: 'primary.main', opacity: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 1.5 }}>
                                                <HiOutlineOfficeBuilding size={22} style={{ color: 'var(--mui-palette-primary-main)' }} />
                                            </Box>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body1" fontWeight={600} noWrap>{school.name}</Typography>
                                                <Typography variant="caption" color="text.secondary">Up to {school.settings?.maxStudents || 50} students</Typography>
                                            </Box>
                                            {school.contact?.adminEmail && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}><HiOutlineMail size={14} /> {school.contact.adminEmail}</Typography>
                                            )}
                                        </Button>
                                    </Grid>
                                ))}
                                </Grid>
                                {filtered.length > 8 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                                        Showing 8 of {filtered.length} schools. Narrow your search to find your school.
                                    </Typography>
                                )}
                            </>
                        ) : (
                            <Paper variant="outlined" sx={{ py: 6, textAlign: 'center', borderStyle: 'dashed' }}>
                                <HiOutlineAcademicCap size={48} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden />
                                <Typography color="text.secondary">No schools yet. Be the first—register your school.</Typography>
                            </Paper>
                        )}
                    </Box>
                    <Typography color="text.secondary" align="center" sx={{ mb: 1.5 }}>Don&apos;t see your school?</Typography>
                    <Box sx={{ textAlign: 'center' }}>
                        <Button variant="contained" startIcon={<HiOutlinePlus size={18} />} onClick={() => navigate('/register-school')}>
                            Register your school
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
                                <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #203bb4 0%, #933fe7 100%)', backgroundClip: 'text', color: 'transparent' }}>GradeBook Pro</Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">School management for the digital age.</Typography>
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <Grid container spacing={4}>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Product</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <Button href="#features" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Features</Button>
                                        <Button href="#pricing" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Pricing</Button>
                                        <Button href="#faq" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>FAQ</Button>
                                    </Box>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Company</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <Button href="#features" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>About</Button>
                                        <Button href="mailto:support@gradebookpro.com" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Contact</Button>
                                    </Box>
                                </Grid>
                                <Grid item xs={6} sm={4}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Legal</Typography>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <Button href="#" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Privacy</Button>
                                        <Button href="#" size="small" sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>Terms</Button>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                    <Typography variant="body2" color="text.secondary" sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        &copy; {new Date().getFullYear()} GradeBook Pro. All rights reserved.
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
};

export default LandingPage;
