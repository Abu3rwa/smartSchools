import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ResetPasswordInvalidLinkState() {
  const { t } = useTranslation(["auth"]);

  return (
    <div className="reset-password-page">
      <div className="reset-password-container">
        <div className="error-message">
          <h2>{t("auth:resetPassword.invalid.title")}</h2>
          <p>{t("auth:resetPassword.invalid.description")}</p>
          <Link to="/forgot-password" className="btn btn-primary">
            {t("auth:resetPassword.invalid.requestNewLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
