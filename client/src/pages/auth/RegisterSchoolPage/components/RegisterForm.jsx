import { ESTIMATED_STUDENTS_OPTIONS } from '../constants';
import RegisterLoadingState from './RegisterLoadingState';

const RegisterForm = ({ formData, error, loading, onChange, onSubmit }) => {
    return (
        <>
            {error && (
                <div className="error-message" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    {error}
                </div>
            )}

            <form className="register-form" onSubmit={onSubmit}>
                <span className="register-section-title">School</span>

                <div className="form-group">
                    <label htmlFor="schoolName">School Name *</label>
                    <input
                        id="schoolName"
                        name="schoolName"
                        type="text"
                        required
                        value={formData.schoolName}
                        onChange={onChange}
                        placeholder="Springfield High School"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="estimatedStudents">Estimated Students</label>
                    <select
                        id="estimatedStudents"
                        name="estimatedStudents"
                        value={formData.estimatedStudents}
                        onChange={onChange}
                    >
                        {ESTIMATED_STUDENTS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
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
                        onChange={onChange}
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
                        onChange={onChange}
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
                        onChange={onChange}
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
                        onChange={onChange}
                        placeholder="Confirm password"
                    />
                </div>

                <button type="submit" className="register-submit" disabled={loading}>
                    {loading ? <RegisterLoadingState /> : 'Create School Account'}
                </button>
            </form>

            <div className="register-terms">
                By registering, you agree to our Terms of Service and Privacy Policy.
            </div>
        </>
    );
};

export default RegisterForm;
