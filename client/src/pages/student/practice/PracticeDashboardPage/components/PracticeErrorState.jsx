import { useTranslation } from "react-i18next";
import { HiOutlineExclamationCircle, HiOutlineRefresh } from "react-icons/hi";

const PracticeErrorState = ({ error, onRetry }) => {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="practice-empty error">
      <HiOutlineExclamationCircle size={56} />
      <h3>{t("dashboard.errorTitle")}</h3>
      <p>{error}</p>
      <button className="btn btn-primary btn-sm" onClick={onRetry}>
        <HiOutlineRefresh size={16} />
        <span>{t("dashboard.tryAgain")}</span>
      </button>
    </div>
  );
};

export default PracticeErrorState;
