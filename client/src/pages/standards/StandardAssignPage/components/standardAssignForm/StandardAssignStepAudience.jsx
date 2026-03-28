import StandardAssignStudentScope from './StandardAssignStudentScope';

const StandardAssignStepAudience = ({
    t,
    formData,
    setFormData,
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
    <section className="assign-step-section">
        <h4>{t('standardAssign:form.steps.audienceDetails')}</h4>
        {students.length > 0 ? (
            <StandardAssignStudentScope
                t={t}
                students={students}
                studentScope={studentScope}
                setStudentScope={setStudentScope}
                setWholeClassScope={setWholeClassScope}
                studentSearch={studentSearch}
                setStudentSearch={setStudentSearch}
                visibleStudents={visibleStudents}
                selectedStudents={selectedStudents}
                selectedStudentsWithInfo={selectedStudentsWithInfo}
                toggleStudent={toggleStudent}
                selectAllVisibleStudents={selectAllVisibleStudents}
                clearSelectedStudents={clearSelectedStudents}
            />
        ) : (
            <div className="form-group">
                <small className="text-muted">{t('standardAssign:form.hints.noActiveStudents')}</small>
            </div>
        )}

        <div className="form-group">
            <label>{t('standardAssign:form.labels.dueDateOptional')}</label>
            <input
                type="date"
                value={formData.dueDate}
                onChange={(event) =>
                    setFormData({ ...formData, dueDate: event.target.value })
                }
            />
        </div>

        <div className="form-group">
            <label>{t('standardAssign:form.labels.instructionsOptional')}</label>
            <textarea
                value={formData.instructions}
                onChange={(event) =>
                    setFormData({ ...formData, instructions: event.target.value })
                }
                rows={3}
                placeholder={t('standardAssign:form.placeholders.instructions')}
            />
        </div>

        <div className="form-group">
            <label>{t('standardAssign:form.labels.notifications', { defaultValue: 'Notifications' })}</label>
            <div className="checkbox-group assign-inline-checkboxes">
                <label className="assign-checkbox-option">
                    <input
                        type="checkbox"
                        checked={formData.notifyParents !== false}
                        onChange={(event) =>
                            setFormData({
                                ...formData,
                                notifyParents: event.target.checked
                            })
                        }
                    />
                    {t('standardAssign:form.labels.notifyParents', { defaultValue: 'Notify parents' })}
                </label>
                <label className="assign-checkbox-option">
                    <input
                        type="checkbox"
                        checked={formData.notifyStudents !== false}
                        onChange={(event) =>
                            setFormData({
                                ...formData,
                                notifyStudents: event.target.checked
                            })
                        }
                    />
                    {t('standardAssign:form.labels.notifyStudents', { defaultValue: 'Notify students' })}
                </label>
            </div>
        </div>
    </section>
);

export default StandardAssignStepAudience;
