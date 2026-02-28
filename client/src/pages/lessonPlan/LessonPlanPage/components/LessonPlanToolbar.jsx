const LessonPlanToolbar = ({
  canFilterAsAdmin,
  canFilterBySubject,
  teachers,
  filterClasses,
  filterSubjects,
  subjects,
  selectedTeacherFilter,
  setSelectedTeacherFilter,
  selectedClassFilter,
  setSelectedClassFilter,
  selectedSubjectFilter,
  setSelectedSubjectFilter,
  startDateFilter,
  setStartDateFilter,
  endDateFilter,
  setEndDateFilter,
}) => {
  const subjectOptions = canFilterAsAdmin ? filterSubjects : subjects;
  if (!canFilterBySubject && !canFilterAsAdmin) return null;

  return (
    <div className="lessons-toolbar">
      {canFilterAsAdmin && (
        <>
          <div className="lesson-filter-group">
            <select
              id="lesson-teacher-filter"
              value={selectedTeacherFilter}
              onChange={(e) => setSelectedTeacherFilter(e.target.value)}
            >
              <option value="">All teachers</option>
              {teachers.map((t) => {
                const uid = t.user?._id || t.user;
                const name = t.user
                  ? `${t.user.firstName || ''} ${t.user.lastName || ''}`.trim() || 'Unknown'
                  : 'Unknown';
                return (
                  <option key={uid || t._id} value={uid || ''}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="lesson-filter-group">
            <select
              id="lesson-class-filter"
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {filterClasses.map((cls) => (
                <option key={cls._id} value={cls._id}>{cls.name}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="lesson-filter-group">
        <select
          id="lesson-subject-filter"
          value={selectedSubjectFilter}
          onChange={(e) => setSelectedSubjectFilter(e.target.value)}
        >
          <option value="">All subjects</option>
          {subjectOptions.map((sub) => (
            <option key={sub._id} value={sub._id}>{sub.name}</option>
          ))}
        </select>
      </div>
      {canFilterAsAdmin && (
        <>
          <div className="lesson-filter-group">
            <label htmlFor="lesson-start-date">From date</label>
            <input
              id="lesson-start-date"
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
            />
          </div>
          <div className="lesson-filter-group">
            <label htmlFor="lesson-end-date">To date</label>
            <input
              id="lesson-end-date"
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default LessonPlanToolbar;
