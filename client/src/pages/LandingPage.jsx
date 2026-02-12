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
    HiOutlineMail,
    HiOutlineClipboardCheck,
    HiOutlineOfficeBuilding
} from 'react-icons/hi';
import './LandingPage.css';

const FAQ_ITEMS = [
    {
        q: 'How does the free trial work?',
        a: 'Start with our Free plan—no credit card required. You get up to 50 students, full gradebook, and parent notifications. Upgrade to Growth anytime when you need more capacity or premium features.'
    },
    {
        q: 'Is my school data secure?',
        a: 'Yes. We use bank-level encryption, secure cloud hosting, and are designed for GDPR compliance. Each school\'s data is fully isolated—no other institution can access your information.'
    },
    {
        q: 'Can we use our own branding?',
        a: 'Growth and Enterprise plans support white-label options: custom logo, colors, and domain so parents and staff see your school\'s brand when they log in.'
    },
    {
        q: 'Do you integrate with existing systems?',
        a: 'We offer CSV import for students and grades. Enterprise plans can include API access and custom integrations—contact us to discuss your needs.'
    },
    {
        q: 'What kind of support do you offer?',
        a: 'All plans include email support. Growth adds priority support; Enterprise includes a dedicated success manager and optional training for your staff.'
    }
];

const LandingPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [searchTerm, setSearchTerm] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [openFaqIndex, setOpenFaqIndex] = useState(null);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/portal', { replace: true });
            return;
        }
        dispatch(fetchSchools());
    }, [dispatch, isAuthenticated, navigate]);

    const filtered = schools.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.slug.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="landing-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="landing-page">
            <div className="landing-bg-gradient" aria-hidden="true" />
            <div className="landing-bg-mesh" aria-hidden="true" />

            {/* Navigation */}
            <header className="landing-header">
                <div className="landing-header-inner">
                    <a href="#" className="landing-logo" onClick={(e) => { e.preventDefault(); window.scrollTo(0, 0); }}>
                        <span className="landing-logo-icon">
                            <HiOutlineAcademicCap size={26} />
                        </span>
                        <span className="landing-logo-text">GradeBook Pro</span>
                    </a>
                    <nav className="landing-nav">
                        <a href="#features">Features</a>
                        <a href="#pricing">Pricing</a>
                        <a href="#testimonials">Testimonials</a>
                        <a href="#faq">FAQ</a>
                        <a href="#find-school">Find your school</a>
                        <button type="button" className="landing-nav-btn secondary" onClick={() => navigate('/login')}>
                            Log in
                        </button>
                        <button type="button" className="landing-nav-btn primary" onClick={() => navigate('/register-school')}>
                            Start free
                        </button>
                    </nav>
                    <button
                        type="button"
                        className="landing-nav-mobile-toggle"
                        onClick={() => setMobileMenuOpen(true)}
                        aria-label="Open menu"
                    >
                        <HiOutlineMenu size={24} />
                    </button>
                </div>
            </header>

            {mobileMenuOpen && (
                <div className="landing-mobile-menu" role="dialog" aria-label="Menu">
                    <div className="landing-mobile-menu-inner">
                        <button type="button" className="landing-mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                            <HiOutlineX size={24} />
                        </button>
                        <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
                        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
                        <a href="#testimonials" onClick={() => setMobileMenuOpen(false)}>Testimonials</a>
                        <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
                        <a href="#find-school" onClick={() => setMobileMenuOpen(false)}>Find your school</a>
                        <button type="button" className="landing-nav-btn secondary" onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}>
                            Log in
                        </button>
                        <button type="button" className="landing-nav-btn primary" onClick={() => { setMobileMenuOpen(false); navigate('/register-school'); }}>
                            Start free
                        </button>
                    </div>
                </div>
            )}

            {/* Hero */}
            <section className="landing-hero">
                <div className="landing-hero-inner">
                    <div className="landing-hero-content">
                        <p className="landing-hero-badge">
                            <HiOutlineSparkles size={16} />
                            Trusted by schools worldwide
                        </p>
                        <h1 className="landing-hero-title">
                            The gradebook that runs your school—not the other way around
                        </h1>
                        <p className="landing-hero-subtitle">
                            Daily grades, attendance, timetables, and parent communication in one place. 
                            Start free with up to 50 students—no credit card required.
                        </p>
                        <div className="landing-hero-actions">
                            <button type="button" className="landing-cta primary" onClick={() => navigate('/register-school')}>
                                Start free trial
                                <HiOutlineArrowRight size={18} />
                            </button>
                            <button type="button" className="landing-cta secondary" onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
                                See pricing
                            </button>
                        </div>
                        <div className="landing-hero-trust">
                            <span><HiOutlineCheckCircle size={16} /> Free up to 50 students</span>
                            <span><HiOutlineCheckCircle size={16} /> No credit card</span>
                            <span><HiOutlineCheckCircle size={16} /> Cancel anytime</span>
                        </div>
                    </div>
                    <div className="landing-hero-visual">
                        <div className="landing-hero-mock">
                            <div className="landing-hero-mock-bar">
                                <span /><span /><span />
                            </div>
                            <div className="landing-hero-mock-body">
                                <div className="landing-hero-mock-row">
                                    <div className="landing-hero-mock-card"><strong>245</strong> Students</div>
                                    <div className="landing-hero-mock-card"><strong>18</strong> Classes</div>
                                    <div className="landing-hero-mock-card"><strong>92%</strong> Attendance</div>
                                </div>
                                <div className="landing-hero-mock-table">
                                    <div className="landing-hero-mock-th">Class</div>
                                    <div className="landing-hero-mock-th">Subject</div>
                                    <div className="landing-hero-mock-th">Grades today</div>
                                    <div className="landing-hero-mock-tr"><span>10-A</span><span>Math</span><span>24</span></div>
                                    <div className="landing-hero-mock-tr"><span>10-B</span><span>Science</span><span>22</span></div>
                                    <div className="landing-hero-mock-tr"><span>11-A</span><span>English</span><span>20</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust strip */}
            <section className="landing-trust-strip">
                <div className="landing-trust-inner">
                    <span><HiOutlineShieldCheck size={18} /> Secure & compliant</span>
                    <span><HiOutlineCloud size={18} /> Cloud-based</span>
                    <span>99.9% uptime</span>
                </div>
            </section>

            {/* How it works */}
            <section className="landing-section landing-how">
                <div className="landing-container">
                    <p className="landing-section-label">How it works</p>
                    <h2 className="landing-section-title">Get started in minutes</h2>
                    <p className="landing-section-subtitle">Register your school, add classes and teachers, then start recording grades and attendance.</p>
                    <div className="landing-steps">
                        <div className="landing-step">
                            <div className="landing-step-num">1</div>
                            <h3>Create your school</h3>
                            <p>Sign up with your school details. No credit card required for the Free plan.</p>
                        </div>
                        <div className="landing-step">
                            <div className="landing-step-num">2</div>
                            <h3>Add classes & teachers</h3>
                            <p>Set up grades, subjects, and assign teachers. Import students via CSV if you like.</p>
                        </div>
                        <div className="landing-step">
                            <div className="landing-step-num">3</div>
                            <h3>Start managing</h3>
                            <p>Enter daily grades, take attendance, and send reports to parents—all from one dashboard.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="landing-section landing-features">
                <div className="landing-container">
                    <p className="landing-section-label">Features</p>
                    <h2 className="landing-section-title">Built for how schools actually work</h2>
                    <p className="landing-section-subtitle">One platform for grades, attendance, timetables, and parent communication.</p>
                    <div className="landing-features-grid">
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineClipboardCheck size={28} /></div>
                            <h3>Daily gradebook</h3>
                            <p>Bulk entry by class, automatic averages, and report generation. Configure max marks and passing criteria per subject.</p>
                        </div>
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineUserGroup size={28} /></div>
                            <h3>Attendance & timetable</h3>
                            <p>Period-based timetables and attendance. Teachers see their day at a glance and record attendance in one click.</p>
                        </div>
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineMail size={28} /></div>
                            <h3>Parent notifications</h3>
                            <p>Send grade updates and reports on demand. Optional Gmail integration for a professional sender address.</p>
                        </div>
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineChartBar size={28} /></div>
                            <h3>Analytics & reports</h3>
                            <p>Dashboards, monthly and semester averages, and AI-powered report generation for parents and admins.</p>
                        </div>
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineShieldCheck size={28} /></div>
                            <h3>Multi-tenant & secure</h3>
                            <p>Each school’s data is isolated. Role-based access, secure auth, and white-label options on paid plans.</p>
                        </div>
                        <div className="landing-feature">
                            <div className="landing-feature-icon"><HiOutlineDeviceMobile size={28} /></div>
                            <h3>Works everywhere</h3>
                            <p>Responsive web app—use it on desktop, tablet, or phone. No separate app install required.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="landing-section landing-pricing">
                <div className="landing-container">
                    <p className="landing-section-label">Pricing</p>
                    <h2 className="landing-section-title">Simple, transparent pricing</h2>
                    <p className="landing-section-subtitle">Start free. Scale when you grow. No hidden fees.</p>
                    <div className="landing-pricing-grid">
                        <div className="landing-price-card">
                            <h3>Starter</h3>
                            <div className="landing-price-amount"><span className="landing-price-num">$0</span><span className="landing-price-period">/month</span></div>
                            <p className="landing-price-desc">Up to 50 students</p>
                            <ul>
                                <li><HiOutlineCheckCircle size={16} /> Full gradebook</li>
                                <li><HiOutlineCheckCircle size={16} /> Attendance & timetable</li>
                                <li><HiOutlineCheckCircle size={16} /> Parent notifications</li>
                                <li><HiOutlineCheckCircle size={16} /> Email support</li>
                            </ul>
                            <button type="button" className="landing-price-btn" onClick={() => navigate('/register-school')}>Start free</button>
                        </div>
                        <div className="landing-price-card featured">
                            <span className="landing-price-badge">Most popular</span>
                            <h3>Growth</h3>
                            <div className="landing-price-amount"><span className="landing-price-num">$2</span><span className="landing-price-period">/student/mo</span></div>
                            <p className="landing-price-desc">Unlimited students + premium features</p>
                            <ul>
                                <li><HiOutlineCheckCircle size={16} /> Everything in Starter</li>
                                <li><HiOutlineCheckCircle size={16} /> White-label branding</li>
                                <li><HiOutlineCheckCircle size={16} /> Priority support</li>
                                <li><HiOutlineCheckCircle size={16} /> Usage analytics</li>
                            </ul>
                            <button type="button" className="landing-price-btn primary" onClick={() => navigate('/register-school')}>Get started</button>
                        </div>
                        <div className="landing-price-card">
                            <h3>Enterprise</h3>
                            <div className="landing-price-amount"><span className="landing-price-num">Custom</span></div>
                            <p className="landing-price-desc">Advanced features & dedicated support</p>
                            <ul>
                                <li><HiOutlineCheckCircle size={16} /> Everything in Growth</li>
                                <li><HiOutlineCheckCircle size={16} /> Custom integrations</li>
                                <li><HiOutlineCheckCircle size={16} /> Dedicated success manager</li>
                                <li><HiOutlineCheckCircle size={16} /> SLA & training</li>
                            </ul>
                            <button type="button" className="landing-price-btn" onClick={() => navigate('/register-school')}>Contact sales</button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section id="testimonials" className="landing-section landing-testimonials">
                <div className="landing-container">
                    <p className="landing-section-label">Testimonials</p>
                    <h2 className="landing-section-title">Loved by educators</h2>
                    <p className="landing-section-subtitle">See what admins and teachers say about GradeBook Pro.</p>
                    <div className="landing-testimonials-grid">
                        <div className="landing-testimonial">
                            <p>"The analytics dashboard alone has saved us hours each week. Parents love the real-time grade updates."</p>
                            <div className="landing-testimonial-author">
                                <div className="landing-testimonial-avatar">JD</div>
                                <div>
                                    <strong>Dr. Jane Davis</strong>
                                    <span>Principal, Lincoln High School</span>
                                </div>
                            </div>
                        </div>
                        <div className="landing-testimonial">
                            <p>"We switched from spreadsheets last year. Setup was quick, and our teachers actually use it every day."</p>
                            <div className="landing-testimonial-author">
                                <div className="landing-testimonial-avatar">MS</div>
                                <div>
                                    <strong>Mark Stevens</strong>
                                    <span>IT Director, Riverside Academy</span>
                                </div>
                            </div>
                        </div>
                        <div className="landing-testimonial">
                            <p>"I can update grades and take attendance from my phone between classes. Game-changer."</p>
                            <div className="landing-testimonial-author">
                                <div className="landing-testimonial-avatar">SC</div>
                                <div>
                                    <strong>Sarah Chen</strong>
                                    <span>Math Teacher, Oak Valley School</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="landing-section landing-faq">
                <div className="landing-container landing-faq-container">
                    <p className="landing-section-label">FAQ</p>
                    <h2 className="landing-section-title">Frequently asked questions</h2>
                    <div className="landing-faq-list">
                        {FAQ_ITEMS.map((item, i) => (
                            <div
                                key={i}
                                className={`landing-faq-item ${openFaqIndex === i ? 'open' : ''}`}
                                onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                            >
                                <button type="button" className="landing-faq-q" aria-expanded={openFaqIndex === i}>
                                    {item.q}
                                    <HiOutlineChevronDown size={20} className="landing-faq-chevron" />
                                </button>
                                <div className="landing-faq-a"><p>{item.a}</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="landing-section landing-cta-block">
                <div className="landing-container landing-cta-inner">
                    <h2 className="landing-cta-title">Ready to simplify your school?</h2>
                    <p className="landing-cta-subtitle">Join schools that switched from spreadsheets and paperwork to one clear system.</p>
                    <button type="button" className="landing-cta primary large" onClick={() => navigate('/register-school')}>
                        Start free trial
                        <HiOutlineArrowRight size={20} />
                    </button>
                </div>
            </section>

            {/* Find your school */}
            <section id="find-school" className="landing-section landing-school-search">
                <div className="landing-container">
                    <p className="landing-section-label">Find your school</p>
                    <h2 className="landing-section-title">Log in to your institution</h2>
                    <p className="landing-section-subtitle">Search for your school to log in, or register a new one.</p>
                    <div className="landing-search-wrap">
                        <HiOutlineSearch size={20} className="landing-search-icon" />
                        <input
                            type="text"
                            placeholder="Search by school name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="landing-search-input"
                        />
                    </div>
                    <div className="landing-schools-wrap">
                        {filtered.length > 0 ? (
                            <div className="landing-schools-grid">
                                {filtered.map((school) => (
                                    <button
                                        key={school._id}
                                        type="button"
                                        className="landing-school-card"
                                        onClick={() => navigate(`/login/${school.slug}`)}
                                    >
                                        <span className="landing-school-card-icon"><HiOutlineOfficeBuilding size={22} /></span>
                                        <div className="landing-school-card-info">
                                            <strong>{school.name}</strong>
                                            <span>Up to {school.settings?.maxStudents || 50} students</span>
                                        </div>
                                        {school.contact?.adminEmail && (
                                            <span className="landing-school-card-email"><HiOutlineMail size={14} /> {school.contact.adminEmail}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="landing-schools-empty">
                                <HiOutlineAcademicCap size={40} />
                                <p>No schools found. Try a different search or register your school.</p>
                            </div>
                        )}
                    </div>
                    <div className="landing-register-cta">
                        <p>Don’t see your school?</p>
                        <button type="button" className="landing-cta primary" onClick={() => navigate('/register-school')}>
                            <HiOutlinePlus size={18} />
                            Register your school
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <div className="landing-footer-top">
                        <div className="landing-footer-brand">
                            <span className="landing-logo-icon"><HiOutlineAcademicCap size={24} /></span>
                            <span className="landing-logo-text">GradeBook Pro</span>
                            <p>School management for the digital age.</p>
                        </div>
                        <div className="landing-footer-links">
                            <div>
                                <h4>Product</h4>
                                <a href="#features">Features</a>
                                <a href="#pricing">Pricing</a>
                                <a href="#faq">FAQ</a>
                            </div>
                            <div>
                                <h4>Company</h4>
                                <a href="#">About</a>
                                <a href="#">Contact</a>
                            </div>
                            <div>
                                <h4>Legal</h4>
                                <a href="#">Privacy</a>
                                <a href="#">Terms</a>
                            </div>
                        </div>
                    </div>
                    <div className="landing-footer-bottom">
                        <p>&copy; {new Date().getFullYear()} GradeBook Pro. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
