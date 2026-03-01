const GradebookFilters = ({
    selectedSubject,
    onSubjectChange,
    selectedMonth,
    onMonthChange,
    subjects,
    months
}) => {
    return (
        <div className="gradebook-filters">
            <div className="form-group">
                <label>Subject</label>
                <select value={selectedSubject} onChange={(event) => onSubjectChange(event.target.value)}>
                    <option value="">Select Subject</option>
                    {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                            {subject.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>Month</label>
                <select value={selectedMonth} onChange={(event) => onMonthChange(Number(event.target.value))}>
                    {months.map((month) => (
                        <option key={month.value} value={month.value}>
                            {month.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default GradebookFilters;
