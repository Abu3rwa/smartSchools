import RegisterPageHeader from './components/RegisterPageHeader';
import RegisterLogo from './components/RegisterLogo';
import RegisterForm from './components/RegisterForm';
import RegisterSuccessState from './components/RegisterSuccessState';
import useRegisterSchoolPageData from './hooks/useRegisterSchoolPageData';
import './RegisterSchoolPage.css';

const RegisterSchoolPage = () => {
    const {
        formData,
        error,
        loading,
        success,
        handleChange,
        handleSubmit,
        handleBack
    } = useRegisterSchoolPageData();

    if (success) {
        return (
            <div className="register-page">
                <div className="bg-gradient"></div>
                <div className="register-content" style={{ alignItems: 'center', minHeight: '100vh' }}>
                    <RegisterSuccessState />
                </div>
            </div>
        );
    }

    return (
        <div className="register-page">
            <div className="bg-gradient"></div>
            <div className="bg-grid"></div>

            <RegisterPageHeader onBack={handleBack} />

            <div className="register-content">
                <div className="register-card animate-fadeIn">
                    <RegisterLogo />
                    <RegisterForm
                        formData={formData}
                        error={error}
                        loading={loading}
                        onChange={handleChange}
                        onSubmit={handleSubmit}
                    />
                </div>
            </div>
        </div>
    );
};

export default RegisterSchoolPage;
