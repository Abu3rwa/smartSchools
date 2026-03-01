import ForgotPasswordForm from './components/ForgotPasswordForm';
import ForgotPasswordSuccessState from './components/ForgotPasswordSuccessState';
import useForgotPasswordPageData from './hooks/useForgotPasswordPageData';
import './ForgotPasswordPage.css';

const ForgotPasswordPage = () => {
    const {
        email,
        setEmail,
        loading,
        submitted,
        handleSubmit,
        handleSendAnotherLink
    } = useForgotPasswordPageData();

    return (
        <div className="forgot-password-page">
            <div className="forgot-password-container">
                {submitted ? (
                    <ForgotPasswordSuccessState
                        email={email}
                        onSendAnotherLink={handleSendAnotherLink}
                    />
                ) : (
                    <ForgotPasswordForm
                        email={email}
                        loading={loading}
                        onEmailChange={setEmail}
                        onSubmit={handleSubmit}
                    />
                )}
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
