const AssignmentFiltersBar = ({
    filterTeacher,
    setFilterTeacher,
    filterClass,
    setFilterClass,
    teachers,
    classes
}) => {
    return (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: 'var(--surface)' }}>
            <span style={{ fontWeight: 500 }}>Filter by:</span>
            <select
                value={filterTeacher}
                onChange={(e) => setFilterTeacher(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}
            >
                <option value="">All Teachers</option>
                {teachers.map((teacher) => (
                    <option key={teacher._id} value={teacher.user?._id || ''}>
                        {teacher.user?.firstName} {teacher.user?.lastName}
                    </option>
                ))}
            </select>
            <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}
            >
                <option value="">All Classes</option>
                {classes.map((classItem) => (
                    <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                ))}
            </select>
        </div>
    );
};

export default AssignmentFiltersBar;
