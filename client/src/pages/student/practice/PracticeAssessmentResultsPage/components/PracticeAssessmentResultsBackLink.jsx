import { useNavigate } from "react-router-dom";
import { HiOutlineArrowLeft } from "react-icons/hi";

export default function PracticeAssessmentResultsBackLink() {
  const navigate = useNavigate();
  return (
    <button className="back-link" onClick={() => navigate("/portal/practice")}>
      <HiOutlineArrowLeft size={16} /> Back to Practice
    </button>
  );
}
