import { useTranslation } from "react-i18next";
import { HiOutlineAcademicCap } from "react-icons/hi";

const PracticeEmptyState = () => {
  const { t } = useTranslation("studentPractice");

  return (
    <div className="practice-empty">
      <HiOutlineAcademicCap size={56} />
      <h3>{t("dashboard.emptyTitle")}</h3>
      <p>{t("dashboard.emptyBody")}</p>
    </div>
  );
};

export default PracticeEmptyState;
