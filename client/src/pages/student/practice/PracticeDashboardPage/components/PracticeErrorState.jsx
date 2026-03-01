import { HiOutlineExclamationCircle, HiOutlineRefresh } from "react-icons/hi";

const PracticeErrorState = ({ error, onRetry }) => (
  <div className="practice-empty error">
    <HiOutlineExclamationCircle size={56} />
    <h3>Unable to load standards</h3>
    <p>{error}</p>
    <button className="btn btn-primary btn-sm" onClick={onRetry}>
      <HiOutlineRefresh size={16} />
      <span>Try Again</span>
    </button>
  </div>
);

export default PracticeErrorState;
