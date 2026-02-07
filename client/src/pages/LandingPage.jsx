import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSchools, selectSchools, selectSchoolLoading } from '../store/slices/schoolSlice';
import { selectIsAuthenticated } from '../store/slices/authSlice';
import { 
    HiOutlineAcademicCap, 
    HiOutlineSearch, 
    HiOutlineMail, 
    HiOutlineUserGroup, 
    HiOutlinePlus,
    HiOutlineCheckCircle,
    HiOutlineChartBar,
    HiOutlineShieldCheck,
    HiOutlineClock,
    HiOutlineDeviceMobile,
    HiOutlineCloud,
    HiOutlineStar,
    HiOutlineArrowRight,
    HiOutlineGlobeAlt,
    HiOutlineAcademicCap as HiOutlineGraduationCap,
    HiOutlineBookOpen,
    HiOutlineSparkles,
    HiOutlinePlay,
    HiOutlineMenu,
    HiOutlineX
} from 'react-icons/hi';
import './LandingPage.css';

const LandingPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const schools = useSelector(selectSchools);
    const loading = useSelector(selectSchoolLoading);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [searchTerm, setSearchTerm] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <div className="bg-gradient"></div>
            <div className="bg-grid"></div>
            <div className="bg-particles">
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
                <div className="bg-particle"></div>
            </div>
            
            {/* Navigation */}
            <nav className="landing-nav">
                <div className="nav-container">
                    <div className="nav-brand">
                        <div className="brand-icon">
                            <HiOutlineGraduationCap size={28} />
                        </div>
                        <span className="brand-text">GradeBook Pro</span>
                    </div>
                    <div className="nav-links">
                        <a href="#features" className="nav-link">Features</a>
                        <a href="#pricing" className="nav-link">Pricing</a>
                        <a href="#testimonials" className="nav-link">Testimonials</a>
                        <button className="nav-admin-btn" onClick={() => navigate('/login')}>
                            Login
                        </button>
                    </div>
                    <button 
                        className="nav-mobile-toggle"
                        onClick={() => setMobileMenuOpen(true)}
                    >
                        <HiOutlineMenu size={24} />
                    </button>
                </div>
            </nav>

            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
                <div className="nav-mobile-menu active">
                    <button 
                        className="nav-mobile-close"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <HiOutlineX size={24} />
                    </button>
                    <div className="nav-mobile-links">
                        <a 
                            href="#features" 
                            className="nav-mobile-link"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Features
                        </a>
                        <a 
                            href="#pricing" 
                            className="nav-mobile-link"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Pricing
                        </a>
                        <a 
                            href="#testimonials" 
                            className="nav-mobile-link"
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Testimonials
                        </a>
                        <button 
                            className="nav-admin-btn" 
                            onClick={() => {
                                setMobileMenuOpen(false);
                                navigate('/login');
                            }}
                        >
                          Login
                        </button>
                    </div>
                </div>
            )}

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-container">
                    <div className="hero-content">
                        <div className="hero-badge">
                            <HiOutlineSparkles size={16} />
                            <span>Trusted by 1,000+ Schools Worldwide</span>
                        </div>
                        <h1 className="hero-title">
                            Modern School Management Made Simple
                        </h1>
                        <p className="hero-subtitle">
                            Streamline your educational institution with powerful tools for grading, attendance, 
                            parent communication, and comprehensive analytics.
                        </p>
                        <div className="hero-actions">
                            <button className="btn-primary" onClick={() => navigate('/register-school')}>
                                <HiOutlinePlus size={20} />
                                Start Free Trial
                            </button>
                            <button className="btn-secondary">
                                <HiOutlinePlay size={20} />
                                Watch Demo
                            </button>
                        </div>
                        <div className="hero-stats">
                            <div className="stat">
                                <span className="stat-number">50K+</span>
                                <span className="stat-label">Active Students</span>
                            </div>
                            <div className="stat">
                                <span className="stat-number">1,000+</span>
                                <span className="stat-label">Schools</span>
                            </div>
                            <div className="stat">
                                <span className="stat-number">99.9%</span>
                                <span className="stat-label">Uptime</span>
                            </div>
                        </div>
                    </div>
                    <div className="hero-visual">
                        <div className="dashboard-preview">
                            <div className="preview-header">
                                <div className="preview-dots">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                                <div className="preview-title">GradeBook Dashboard</div>
                            </div>
                            <div className="preview-content">
                                <div className="preview-card">
                                    <div className="preview-stat">
                                        <span className="preview-number">245</span>
                                        <span className="preview-label">Total Students</span>
                                    </div>
                                </div>
                                <div className="preview-card">
                                    <div className="preview-stat">
                                        <span className="preview-number">18</span>
                                        <span className="preview-label">Classes</span>
                                    </div>
                                </div>
                                <div className="preview-card">
                                    <div className="preview-stat">
                                        <span className="preview-number">92%</span>
                                        <span className="preview-label">Attendance</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="features-section">
                <div className="section-container">
                    <div className="section-header">
                        <h2 className="section-title">Everything You Need to Excel</h2>
                        <p className="section-subtitle">
                            Powerful features designed to make school management effortless
                        </p>
                    </div>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineChartBar size={32} />
                            </div>
                            <h3>Advanced Analytics</h3>
                            <p>Track student performance, attendance trends, and institutional metrics with real-time dashboards.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineCloud size={32} />
                            </div>
                            <h3>Cloud-Based</h3>
                            <p>Access your data from anywhere with secure cloud storage and automatic backups.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineDeviceMobile size={32} />
                            </div>
                            <h3>Mobile Friendly</h3>
                            <p>Full mobile support for teachers, students, and parents on any device.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineShieldCheck size={32} />
                            </div>
                            <h3>Secure & Compliant</h3>
                            <p>Bank-level security with GDPR compliance and data encryption.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineClock size={32} />
                            </div>
                            <h3>24/7 Support</h3>
                            <p>Round-the-clock customer support with dedicated account managers.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon">
                                <HiOutlineBookOpen size={32} />
                            </div>
                            <h3>Digital Gradebook</h3>
                            <p>Comprehensive grade management with automated calculations and report generation.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="pricing-section">
                <div className="section-container">
                    <div className="section-header">
                        <h2 className="section-title">Simple, Transparent Pricing</h2>
                        <p className="section-subtitle">
                            Choose the perfect plan for your institution
                        </p>
                    </div>
                    <div className="pricing-grid">
                        <div className="pricing-card">
                            <div className="pricing-header">
                                <h3>Starter</h3>
                                <div className="pricing-price">
                                    <span className="price-amount">$29</span>
                                    <span className="price-period">/month</span>
                                </div>
                                <p className="pricing-description">Perfect for small schools</p>
                            </div>
                            <ul className="pricing-features">
                                <li><HiOutlineCheckCircle size={16} /> Up to 50 students</li>
                                <li><HiOutlineCheckCircle size={16} /> Basic gradebook</li>
                                <li><HiOutlineCheckCircle size={16} /> Email support</li>
                                <li><HiOutlineCheckCircle size={16} /> Mobile app access</li>
                            </ul>
                            <button className="pricing-btn">Start Free Trial</button>
                        </div>
                        <div className="pricing-card featured">
                            <div className="pricing-badge">Most Popular</div>
                            <div className="pricing-header">
                                <h3>Professional</h3>
                                <div className="pricing-price">
                                    <span className="price-amount">$79</span>
                                    <span className="price-period">/month</span>
                                </div>
                                <p className="pricing-description">Ideal for growing institutions</p>
                            </div>
                            <ul className="pricing-features">
                                <li><HiOutlineCheckCircle size={16} /> Up to 500 students</li>
                                <li><HiOutlineCheckCircle size={16} /> Advanced analytics</li>
                                <li><HiOutlineCheckCircle size={16} /> Parent portal</li>
                                <li><HiOutlineCheckCircle size={16} /> Priority support</li>
                                <li><HiOutlineCheckCircle size={16} /> Custom reports</li>
                                <li><HiOutlineCheckCircle size={16} /> API access</li>
                            </ul>
                            <button className="pricing-btn primary">Start Free Trial</button>
                        </div>
                        <div className="pricing-card">
                            <div className="pricing-header">
                                <h3>Enterprise</h3>
                                <div className="pricing-price">
                                    <span className="price-amount">Custom</span>
                                </div>
                                <p className="pricing-description">For large institutions</p>
                            </div>
                            <ul className="pricing-features">
                                <li><HiOutlineCheckCircle size={16} /> Unlimited students</li>
                                <li><HiOutlineCheckCircle size={16} /> Custom features</li>
                                <li><HiOutlineCheckCircle size={16} /> Dedicated support</li>
                                <li><HiOutlineCheckCircle size={16} /> On-premise option</li>
                                <li><HiOutlineCheckCircle size={16} /> SLA guarantee</li>
                            </ul>
                            <button className="pricing-btn">Contact Sales</button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonials Section */}
            <section id="testimonials" className="testimonials-section">
                <div className="section-container">
                    <div className="section-header">
                        <h2 className="section-title">Loved by Educators Worldwide</h2>
                        <p className="section-subtitle">
                            See what school administrators and teachers are saying
                        </p>
                    </div>
                    <div className="testimonials-grid">
                        <div className="testimonial-card">
                            <div className="testimonial-content">
                                <p>"GradeBook Pro has transformed how we manage our school. The analytics dashboard alone has saved us hours of work each week."</p>
                            </div>
                            <div className="testimonial-author">
                                <div className="author-avatar">
                                    <span>JD</span>
                                </div>
                                <div className="author-info">
                                    <h4>Dr. Jane Davis</h4>
                                    <p>Principal, Lincoln High School</p>
                                </div>
                            </div>
                            <div className="testimonial-rating">
                                {[...Array(5)].map((_, i) => <HiOutlineStar key={i} size={16} className="star-filled" />)}
                            </div>
                        </div>
                        <div className="testimonial-card">
                            <div className="testimonial-content">
                                <p>"The parent portal has revolutionized our communication. Parents love being able to track their child's progress in real-time."</p>
                            </div>
                            <div className="testimonial-author">
                                <div className="author-avatar">
                                    <span>MS</span>
                                </div>
                                <div className="author-info">
                                    <h4>Mark Stevens</h4>
                                    <p>IT Director, Riverside Academy</p>
                                </div>
                            </div>
                            <div className="testimonial-rating">
                                {[...Array(5)].map((_, i) => <HiOutlineStar key={i} size={16} className="star-filled" />)}
                            </div>
                        </div>
                        <div className="testimonial-card">
                            <div className="testimonial-content">
                                <p>"As a teacher, the mobile app is a game-changer. I can update grades and attendance right from my classroom."</p>
                            </div>
                            <div className="testimonial-author">
                                <div className="author-avatar">
                                    <span>SC</span>
                                </div>
                                <div className="author-info">
                                    <h4>Sarah Chen</h4>
                                    <p>Math Teacher, Oak Valley School</p>
                                </div>
                            </div>
                            <div className="testimonial-rating">
                                {[...Array(5)].map((_, i) => <HiOutlineStar key={i} size={16} className="star-filled" />)}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* School Search Section */}
            <section className="school-search-section">
                <div className="section-container">
                    <div className="section-header">
                        <h2 className="section-title">Find Your School</h2>
                        <p className="section-subtitle">
                            Search for your institution to get started
                        </p>
                    </div>
                    <div className="search-container">
                        <div className="search-input-wrapper">
                            <HiOutlineSearch className="search-icon" size={20} />
                            <input
                                type="text"
                                placeholder="Search for your school..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />
                        </div>
                    </div>
                    <div className="schools-container">
                        {filtered.length > 0 ? (
                            <div className="schools-grid">
                                {filtered.map((school) => (
                                    <div
                                        key={school._id}
                                        className="school-card"
                                        onClick={() => navigate(`/login/${school.slug}`)}
                                    >
                                        <div className="school-card-header">
                                            <div className="school-card-icon">
                                                <HiOutlineGraduationCap size={24} />
                                            </div>
                                            <div className="school-card-info">
                                                <h3>{school.name}</h3>
                                                <span>
                                                    <HiOutlineUserGroup size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                    Up to {school.settings?.maxStudents || 50} students
                                                </span>
                                            </div>
                                        </div>
                                        <div className="school-card-footer">
                                            <HiOutlineMail size={14} />
                                            <span>{school.contact?.adminEmail}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="schools-empty">
                                <div className="schools-empty-icon">
                                    <HiOutlineGraduationCap size={32} />
                                </div>
                                <h3>No schools found</h3>
                                <p>Try a different search or register your school below</p>
                            </div>
                        )}
                    </div>
                    <div className="register-cta">
                        <p>Don't see your school?</p>
                        <button className="btn-primary" onClick={() => navigate('/register-school')}>
                            <HiOutlinePlus size={20} />
                            Register Your School
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <div className="brand-icon">
                                <HiOutlineGraduationCap size={24} />
                            </div>
                            <span className="brand-text">GradeBook Pro</span>
                            <p>Modern school management for the digital age</p>
                        </div>
                        <div className="footer-links">
                            <div className="footer-column">
                                <h4>Product</h4>
                                <a href="#features">Features</a>
                                <a href="#pricing">Pricing</a>
                                <a href="#testimonials">Testimonials</a>
                            </div>
                            <div className="footer-column">
                                <h4>Company</h4>
                                <a href="#">About</a>
                                <a href="#">Blog</a>
                                <a href="#">Careers</a>
                            </div>
                            <div className="footer-column">
                                <h4>Support</h4>
                                <a href="#">Help Center</a>
                                <a href="#">Contact</a>
                                <a href="#">Status</a>
                            </div>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>&copy; 2024 GradeBook Pro. All rights reserved.</p>
                        <div className="footer-legal">
                            <a href="#">Privacy Policy</a>
                            <a href="#">Terms of Service</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
