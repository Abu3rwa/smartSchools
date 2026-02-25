import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { VIEW_MODES } from '../constants';

const AttendanceViewControls = ({
    classes,
    dateRangeText,
    filters,
    navigateDate,
    setFilters,
    setViewMode,
    subjects,
    teachers,
    viewMode
}) => {
    return (
        <div className="view-controls">
            <div className="view-modes">
                <div className="toggle-buttons">
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.TODAY ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.TODAY)}
                    >
                        Today
                    </button>
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.WEEK ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.WEEK)}
                    >
                        Week
                    </button>
                    <button
                        className={`toggle-btn ${viewMode === VIEW_MODES.MONTH ? 'active' : ''}`}
                        onClick={() => setViewMode(VIEW_MODES.MONTH)}
                    >
                        Month
                    </button>
                </div>

                <div className="date-navigation">
                    <button onClick={() => navigateDate('prev')}>
                        <HiOutlineChevronLeft size={20} />
                    </button>
                    <span>{dateRangeText}</span>
                    <button onClick={() => navigateDate('next')}>
                        <HiOutlineChevronRight size={20} />
                    </button>
                </div>
            </div>

            <div className="filters">
                <div className="filter-group">
                    <select
                        value={filters.teacher}
                        onChange={(e) => setFilters((prev) => ({ ...prev, teacher: e.target.value }))}
                    >
                        <option value="">All Teachers</option>
                        {teachers.map((teacher) => (
                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                {teacher.user
                                    ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim()
                                    : 'Unknown'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.class}
                        onChange={(e) => setFilters((prev) => ({ ...prev, class: e.target.value }))}
                    >
                        <option value="">All Classes</option>
                        {classes.map((cls) => (
                            <option key={cls._id} value={cls._id}>
                                {cls.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.subject}
                        onChange={(e) => setFilters((prev) => ({ ...prev, subject: e.target.value }))}
                    >
                        <option value="">All Subjects</option>
                        {subjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="">All Status</option>
                        <option value="recorded">Recorded</option>
                        <option value="pending">Pending</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default AttendanceViewControls;
