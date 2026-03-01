import { HiOutlineRefresh } from "react-icons/hi";
import { PRACTICE_DASHBOARD_SUBTITLE, PRACTICE_DASHBOARD_TITLE } from "../constants";

const PracticeDashboardHeader = ({ loading, onRefresh }) => (
  <div className="page-header">
    <div>
      <h1>{PRACTICE_DASHBOARD_TITLE}</h1>
      <p className="text-muted">{PRACTICE_DASHBOARD_SUBTITLE}</p>
    </div>
    <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading}>
      <HiOutlineRefresh size={16} />
      <span>{loading ? "Refreshing..." : "Refresh"}</span>
    </button>
  </div>
);

export default PracticeDashboardHeader;
