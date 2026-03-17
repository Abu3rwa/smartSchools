import {
  HiOutlineSearch, HiOutlineFilter,
  HiOutlineChevronLeft, HiOutlineChevronRight,
} from "react-icons/hi";
import { getDateRangeText } from "../attendanceUtils";

const VIEW_MODES = ["today", "week", "month"];

const AttendanceViewControls = ({
  viewMode, setViewMode,
  currentDate, onNavigate,
  searchQuery, setSearchQuery,
  filters, setFilters,
  classOptions, subjectOptions,
}) => (
  <div className="view-controls">
    <div className="view-modes">
      <div className="toggle-buttons">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            className={`toggle-btn ${viewMode === mode ? "active" : ""}`}
            onClick={() => setViewMode(mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
      <div className="date-navigation">
        <button onClick={() => onNavigate("prev")}><HiOutlineChevronLeft size={20} /></button>
        <span>{getDateRangeText(currentDate, viewMode)}</span>
        <button onClick={() => onNavigate("next")}><HiOutlineChevronRight size={20} /></button>
      </div>
    </div>

    <div className="filters">
      <div className="filter-group search-group">
        <HiOutlineSearch size={16} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search class, subject, room..."
        />
      </div>
      <div className="filter-group select-group">
        <HiOutlineFilter size={15} />
        <select value={filters.class} onChange={(e) => setFilters((p) => ({ ...p, class: e.target.value }))}>
          <option value="">All Classes</option>
          {classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <select value={filters.subject} onChange={(e) => setFilters((p) => ({ ...p, subject: e.target.value }))}>
          <option value="">All Subjects</option>
          {subjectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="recorded">Recorded</option>
          <option value="pending">Pending</option>
        </select>
      </div>
    </div>
  </div>
);

export default AttendanceViewControls;
