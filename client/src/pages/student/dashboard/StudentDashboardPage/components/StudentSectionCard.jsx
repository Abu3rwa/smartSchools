import { HiOutlineChevronRight } from "react-icons/hi";

const StudentSectionCard = ({ icon: Icon, label, description, onClick }) => {
  return (
    <button type="button" className="student-section-card" onClick={onClick}>
      <span className="student-section-card-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="student-section-card-body">
        <span className="student-section-card-title">{label}</span>
        <span className="student-section-card-description">{description}</span>
      </span>
      <HiOutlineChevronRight
        size={18}
        className="student-section-card-chevron"
        aria-hidden="true"
      />
    </button>
  );
};

export default StudentSectionCard;
