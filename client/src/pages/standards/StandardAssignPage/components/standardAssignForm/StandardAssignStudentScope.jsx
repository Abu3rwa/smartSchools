const StandardAssignStudentScope = ({
    t,
    students,
    studentScope,
    setStudentScope,
    setWholeClassScope,
    studentSearch,
    setStudentSearch,
    visibleStudents,
    selectedStudents,
    selectedStudentsWithInfo,
    toggleStudent,
    selectAllVisibleStudents,
    clearSelectedStudents
}) => (
    <div className="form-group">
        <label>{t('standardAssign:form.studentScope.title')}</label>
        <div className="assign-student-scope-row">
            <label className="assign-radio-option">
                <input
                    type="radio"
                    name="studentScope"
                    checked={studentScope === 'whole'}
                    onChange={setWholeClassScope}
                />
                {t('standardAssign:form.studentScope.wholeClass', { count: students.length })}
            </label>
            <label className="assign-radio-option">
                <input
                    type="radio"
                    name="studentScope"
                    checked={studentScope === 'specific'}
                    onChange={() => setStudentScope('specific')}
                />
                {t('standardAssign:form.studentScope.specificStudents')}
            </label>
        </div>

        {studentScope === 'specific' && (
            <div className="assign-student-picker">
                <div className="assign-student-picker-toolbar">
                    <input
                        type="text"
                        placeholder={t('standardAssign:form.studentScope.searchPlaceholder')}
                        value={studentSearch}
                        onChange={(event) => setStudentSearch(event.target.value)}
                    />
                    <div className="assign-student-picker-actions">
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={selectAllVisibleStudents}
                            disabled={visibleStudents.length === 0}
                        >
                            {t('standardAssign:actions.selectAllVisible')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={clearSelectedStudents}
                            disabled={selectedStudents.length === 0}
                        >
                            {t('standardAssign:actions.clear')}
                        </button>
                    </div>
                </div>

                {selectedStudentsWithInfo.length > 0 && (
                    <div className="assign-selected-chips">
                        {selectedStudentsWithInfo.map((student) => (
                            <button
                                type="button"
                                key={student._id}
                                className="assign-selected-chip"
                                onClick={() => toggleStudent(student._id)}
                                title={t('standardAssign:actions.removeStudent')}
                            >
                                {student.firstName} {student.lastName}
                                <span aria-hidden="true">x</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="assign-student-list">
                    {visibleStudents.length === 0 ? (
                        <small className="text-muted">
                            {t('standardAssign:form.studentScope.noStudentsMatch')}
                        </small>
                    ) : (
                        visibleStudents.map((student) => (
                            <label key={student._id} className="assign-student-row">
                                <input
                                    type="checkbox"
                                    checked={selectedStudents.includes(student._id)}
                                    onChange={() => toggleStudent(student._id)}
                                />
                                <span>
                                    {student.firstName} {student.lastName} ({student.studentId})
                                </span>
                            </label>
                        ))
                    )}
                </div>
                <small className="text-muted assign-selected-count">
                    {t('standardAssign:form.studentScope.selectedCount', { count: selectedStudents.length })}
                </small>
            </div>
        )}
    </div>
);

export default StandardAssignStudentScope;
