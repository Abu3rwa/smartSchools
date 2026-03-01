import { useResetPasswordPageData } from "./hooks/useResetPasswordPageData.js";
import ResetPasswordInvalidLinkState from "./components/ResetPasswordInvalidLinkState.jsx";
import ResetPasswordForm from "./components/ResetPasswordForm.jsx";
import "./ResetPasswordPage.css";

/**
 * Reset Password page. Route: /reset-password?token=...
 * Public auth page for completing password reset via email link.
 */
export default function ResetPasswordPage() {
  const {
    tokenValid,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    handleSubmit,
  } = useResetPasswordPageData();

  if (!tokenValid) {
    return <ResetPasswordInvalidLinkState />;
  }

  return (
    <ResetPasswordForm
      password={password}
      setPassword={setPassword}
      confirmPassword={confirmPassword}
      setConfirmPassword={setConfirmPassword}
      loading={loading}
      onSubmit={handleSubmit}
    />
  );
}
