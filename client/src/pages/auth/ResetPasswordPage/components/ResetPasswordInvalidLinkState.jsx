import { Link } from "react-router-dom";

export default function ResetPasswordInvalidLinkState() {
  return (
    <div className="reset-password-page">
      <div className="reset-password-container">
        <div className="error-message">
          <h2>Invalid Reset Link</h2>
          <p>This password reset link is invalid or has expired.</p>
          <Link to="/forgot-password" className="btn btn-primary">
            Request New Reset Link
          </Link>
        </div>
      </div>
    </div>
  );
}
