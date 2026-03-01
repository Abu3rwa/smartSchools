import { STATUS_OPTIONS } from '../constants';

const AssignmentsFilters = ({
    selectedClass,
    onClassChange,
    selectedSubject,
    onSubjectChange,
    selectedStatus,
    onStatusChange,
    availableClasses,
    availableSubjects
}) => {
    return (
        <div className="filters card">
            <div className="filters-grid">
                <div className="form-group">
                    <label>Class</label>
                    <select value={selectedClass} onChange={(event) => onClassChange(event.target.value)}>
                        <option value="">Select class</option>
                        {availableClasses.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Subject</label>
                    <select value={selectedSubject} onChange={(event) => onSubjectChange(event.target.value)}>
                        <option value="">All subjects</option>
                        {availableSubjects.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Status</label>
                    <select value={selectedStatus} onChange={(event) => onStatusChange(event.target.value)}>
                        {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default AssignmentsFilters;
