import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ResetPasswordForm({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  onSubmit,
}) {
  const { t } = useTranslation(["auth"]);

  return (
    <div className="reset-password-page">
      <div className="reset-password-container">
        <div className="reset-password-form">
          <h2>{t("auth:resetPassword.form.title")}</h2>
          <p>{t("auth:resetPassword.form.description")}</p>
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="password">{t("auth:resetPassword.form.newPasswordLabel")}</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth:resetPassword.form.newPasswordPlaceholder")}
                required
                disabled={loading}
                minLength={6}
              />
              <small>{t("auth:resetPassword.form.passwordHint")}</small>
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">{t("auth:resetPassword.form.confirmPasswordLabel")}</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth:resetPassword.form.confirmPasswordPlaceholder")}
                required
                disabled={loading}
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? t("auth:resetPassword.form.resetting") : t("auth:resetPassword.form.submit")}
            </button>
          </form>
          <div className="back-to-login">
            <Link to="/login">{`← ${t("auth:resetPassword.form.backToLogin")}`}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
