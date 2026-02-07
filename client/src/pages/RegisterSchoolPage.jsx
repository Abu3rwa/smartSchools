import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerSchool, selectSchoolLoading, selectSchoolError, clearSchoolError } from '../store/slices/schoolSlice';
import { HiOutlineAcademicCap, HiOutlineArrowLeft, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './RegisterSchoolPage.css';

const RegisterSchoolPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const loading = useSelector(selectSchoolLoading);
    const serverError = useSelector(selectSchoolError);

    const [formData, setFormData] = useState({
        schoolName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: '',
        estimatedStudents: '50'
    });
    const [localError, setLocalError] = useState('');
    const [success, setSuccess] = useState(false);

    const error = localError || serverError;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        if (error) {
            setLocalError('');
            dispatch(clearSchoolError());
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.adminPassword !== formData.confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        const result = await dispatch(registerSchool({
            schoolName: formData.schoolName,
            adminName: formData.adminName,
            adminEmail: formData.adminEmail,
            adminPassword: formData.adminPassword,
            estimatedStudents: parseInt(formData.estimatedStudents)
        }));

        if (registerSchool.fulfilled.match(result)) {
            setSuccess(true);
            toast.success('School registered!');
            setTimeout(() => {
                navigate(`/login/${result.payload.slug}`);
            }, 2000);
        }
    };

    // Success state
    if (success) {
        return (
            <div className="register-page">
                <div className="bg-gradient"></div>
                <div className="register-content" style={{ alignItems: 'center', minHeight: '100vh' }}>
                    <div className="register-card animate-fadeIn">
                        <div className="register-success">
                            <div className="register-success-icon">
                                <HiOutlineCheckCircle size={28} />
                            </div>
                            <h2>School Registered!</h2>
                            <p>Redirecting to your school login...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="register-page">
            <div className="bg-gradient"></div>
            <div className="bg-grid"></div>

            {/* Header */}
            <header className="register-header">
                <button className="register-back" onClick={() => navigate('/')}>
                    <HiOutlineArrowLeft size={16} />
                    Back
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Register Your School
                </span>
            </header>

            {/* Form */}
            <div className="register-content">
                <div className="register-card animate-fadeIn">
                    <div className="register-info">
                        <div className="register-icon">
                            <HiOutlineAcademicCap size={36} />
                        </div>
                        <h2>Register Your School</h2>
                        <p>14-day free trial. No credit card required.</p>
                    </div>

                    {error && (
                        <div className="error-message" style={{ marginBottom: 'var(--spacing-lg)' }}>
                            {error}
                        </div>
                    )}

                    <form className="register-form" onSubmit={handleSubmit}>
                        <span className="register-section-title">School</span>

                        <div className="form-group">
                            <label htmlFor="schoolName">School Name *</label>
                            <input
                                id="schoolName"
                                name="schoolName"
                                type="text"
                                required
                                value={formData.schoolName}
                                onChange={handleChange}
                                placeholder="Springfield High School"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="estimatedStudents">Estimated Students</label>
                            <select
                                id="estimatedStudents"
                                name="estimatedStudents"
                                value={formData.estimatedStudents}
                                onChange={handleChange}
                            >
                                <option value="25">Up to 25</option>
                                <option value="50">Up to 50</option>
                                <option value="100">Up to 100</option>
                                <option value="200">Up to 200</option>
                                <option value="500">Up to 500</option>
                                <option value="1000">500+</option>
                            </select>
                        </div>

                        <span className="register-section-title">Administrator</span>

                        <div className="form-group">
                            <label htmlFor="adminName">Full Name *</label>
                            <input
                                id="adminName"
                                name="adminName"
                                type="text"
                                required
                                value={formData.adminName}
                                onChange={handleChange}
                                placeholder="Jane Doe"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="adminEmail">Email *</label>
                            <input
                                id="adminEmail"
                                name="adminEmail"
                                type="email"
                                required
                                value={formData.adminEmail}
                                onChange={handleChange}
                                placeholder="admin@school.edu"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="adminPassword">Password *</label>
                            <input
                                id="adminPassword"
                                name="adminPassword"
                                type="password"
                                required
                                value={formData.adminPassword}
                                onChange={handleChange}
                                placeholder="Create a strong password"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password *</label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Confirm password"
                            />
                        </div>

                        <button type="submit" className="register-submit" disabled={loading}>
                            {loading ? (
                                <span className="btn-loading">
                                    <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                    Creating...
                                </span>
                            ) : (
                                'Create School Account'
                            )}
                        </button>
                    </form>

                    <div className="register-terms">
                        By registering, you agree to our Terms of Service and Privacy Policy.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegisterSchoolPage;
