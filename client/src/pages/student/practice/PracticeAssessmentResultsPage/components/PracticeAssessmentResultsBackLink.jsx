import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HiOutlineArrowLeft } from "react-icons/hi";

export default function PracticeAssessmentResultsBackLink() {
  const navigate = useNavigate();
  const { t } = useTranslation("studentPractice");

  return (
    <button className="back-link" onClick={() => navigate("/portal/practice")}>
      <HiOutlineArrowLeft size={16} /> {t("results.back")}
    </button>
  );
}
