import {
    DIFFICULTY_OPTIONS,
    QUESTION_TYPE_OPTIONS,
    SEMESTER_OPTIONS
} from '../constants';

const StandardAssignForm = ({
    formData,
    setFormData,
    selectedClass,
    availableStandards,
    getStandardOptionLabel,
    getStandardDescription,
    selectedStandard,
    classes,
    handleClassChange,
    subjectOptions,
    subjects,
    isTeacher,
    classSubjects,
    students,
    showAdvanced,
    setShowAdvanced,
    getEntityId
}) => {
    return (
        <div className="modal-body">
            <div className="form-group">
                <label>Assignment Name *</label>
                <input
                    type="text"
                    value={formData.title}
                    onChange={(event) =>
                        setFormData({ ...formData, title: event.target.value })
                    }
                    placeholder="e.g. Fractions Unit Test - Term 1"
                    required
                />
                <small className="text-muted">
                    This name appears in Standards-Based (SB) gradebook and reports.
                </small>
            </div>
            <div className="form-group">
                <label>Standard *</label>
                <select
                    value={formData.standardId}
                    onChange={(event) =>
                        setFormData({ ...formData, standardId: event.target.value })
                    }
                    required
                >
                    <option value="">Select Standard</option>
                    {availableStandards.map((standard) => (
                        <option key={standard._id} value={standard._id}>
                            {getStandardOptionLabel(standard)}
                        </option>
                    ))}
                </select>
                {selectedClass && (
                    <small className="text-muted">
                        Showing standards for Grade {selectedClass.grade}
                        {formData.subjectId ? ' and selected subject' : ''}.
                    </small>
                )}
                {formData.standardId && (
                    <small className="text-muted" style={{ display: 'block', marginTop: 8 }}>
                        {getStandardDescription(selectedStandard)}
                    </small>
                )}
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Assignment Mode *</label>
                    <select
                        value={
                            formData.practiceConfig.sessionType === 'assessment'
                                ? 'assessment'
                                : 'practice'
                        }
                        onChange={(event) => {
                            const nextMode =
                                event.target.value === 'assessment' ? 'assessment' : 'practice';
                            setFormData({
                                ...formData,
                                practiceConfig: {
                                    ...formData.practiceConfig,
                                    sessionType: nextMode
                                }
                            });
                        }}
                        required
                    >
                        <option value="practice">Practice (Not Graded)</option>
                        <option value="assessment">Graded Assessment (SB)</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Semester *</label>
                    <select
                        value={formData.semester || 1}
                        onChange={(event) =>
                            setFormData({ ...formData, semester: event.target.value })
                        }
                        required
                    >
                        {SEMESTER_OPTIONS.map((semesterOption) => (
                            <option key={semesterOption} value={semesterOption}>
                                Semester {semesterOption}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Class *</label>
                    <select
                        value={formData.classId}
                        onChange={(event) => handleClassChange(event.target.value)}
                        required
                    >
                        <option value="">Select Class</option>
                        {classes.map((schoolClass) => (
                            <option key={schoolClass._id} value={schoolClass._id}>
                                {schoolClass.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>Subject *</label>
                    <select
                        value={formData.subjectId}
                        onChange={(event) =>
                            setFormData({
                                ...formData,
                                subjectId: event.target.value,
                                standardId: ''
                            })
                        }
                        disabled={!formData.classId || subjectOptions.length === 0}
                        required
                    >
                        <option value="">Select Subject</option>
                        {subjectOptions.map((subject) => {
                            const subjectId = getEntityId(subject);
                            const subjectName =
                                subject?.name ||
                                subjects.find((item) => getEntityId(item) === subjectId)?.name ||
                                'Subject';
                            return (
                                <option key={subjectId} value={subjectId}>
                                    {subjectName}
                                </option>
                            );
                        })}
                    </select>
                    {!selectedClass && isTeacher && (
                        <small className="text-muted">
                            Select a class to view your assigned subjects.
                        </small>
                    )}
                    {selectedClass && classSubjects.length > 0 && (
                        <small className="text-muted">
                            {isTeacher
                                ? 'Showing only subjects you teach in this class.'
                                : 'Subjects limited to this class configuration.'}
                        </small>
                    )}
                    {selectedClass && isTeacher && classSubjects.length === 0 && (
                        <small className="text-danger">
                            No subjects are mapped to you for this class yet.
                        </small>
                    )}
                </div>
            </div>
            {students.length > 0 && (
                <div className="form-group">
                    <label>Specific Students (leave empty for whole class)</label>
                    <select
                        multiple
                        value={formData.students}
                        onChange={(event) => {
                            const selected = Array.from(
                                event.target.selectedOptions,
                                (option) => option.value
                            );
                            setFormData({ ...formData, students: selected });
                        }}
                        style={{ minHeight: 100 }}
                    >
                        {students.map((student) => (
                            <option key={student._id} value={student._id}>
                                {student.firstName} {student.lastName} ({student.studentId})
                            </option>
                        ))}
                    </select>
                    <small className="text-muted">
                        Hold Ctrl/Cmd to select multiple students
                    </small>
                </div>
            )}
            <div className="form-group">
                <label>Due Date (optional)</label>
                <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(event) =>
                        setFormData({ ...formData, dueDate: event.target.value })
                    }
                />
            </div>

            <div
                className="advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{
                    cursor: 'pointer',
                    color: 'var(--primary-600)',
                    fontWeight: 600,
                    margin: '15px 0',
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                <span style={{ marginRight: 5 }}>{showAdvanced ? '▼' : '▶'}</span>
                Advanced Settings (Practice Config)
            </div>

            {showAdvanced && (
                <div
                    className="advanced-settings"
                    style={{
                        background: 'var(--bg-secondary)',
                        padding: '15px',
                        borderRadius: '8px',
                        marginBottom: '15px'
                    }}
                >
                    <div className="form-row">
                        <div className="form-group">
                            <label>Assignment Mode</label>
                            <select
                                value={formData.practiceConfig.sessionType}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            sessionType: event.target.value
                                        }
                                    })
                                }
                            >
                                <option value="practice">Practice (Not Graded)</option>
                                <option value="assessment">Graded Assessment (SB)</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Questions Limit (0 = Unlimited)</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="e.g. 10"
                                value={formData.practiceConfig.questionLimit}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            questionLimit: event.target.value
                                        }
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Time Limit (minutes, 0 = Unlimited)</label>
                        <input
                            type="number"
                            min="0"
                            placeholder="e.g. 30"
                            value={formData.practiceConfig.timeLimitSeconds}
                            onChange={(event) =>
                                setFormData({
                                    ...formData,
                                    practiceConfig: {
                                        ...formData.practiceConfig,
                                        timeLimitSeconds: event.target.value
                                    }
                                })
                            }
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Time (optional)</label>
                            <input
                                type="datetime-local"
                                value={formData.practiceConfig.availability.startAt}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            availability: {
                                                ...formData.practiceConfig.availability,
                                                startAt: event.target.value
                                            }
                                        }
                                    })
                                }
                            />
                        </div>
                        <div className="form-group">
                            <label>End Time (optional)</label>
                            <input
                                type="datetime-local"
                                value={formData.practiceConfig.availability.endAt}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            availability: {
                                                ...formData.practiceConfig.availability,
                                                endAt: event.target.value
                                            }
                                        }
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Allowed Question Types</label>
                        <div className="checkbox-group" style={{ display: 'flex', gap: '15px' }}>
                            {QUESTION_TYPE_OPTIONS.map((type) => (
                                <label
                                    key={type}
                                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.practiceConfig.allowedQuestionTypes.includes(type)}
                                        onChange={(event) => {
                                            const current = formData.practiceConfig.allowedQuestionTypes;
                                            let next;
                                            if (event.target.checked) next = [...current, type];
                                            else next = current.filter((item) => item !== type);
                                            setFormData({
                                                ...formData,
                                                practiceConfig: {
                                                    ...formData.practiceConfig,
                                                    allowedQuestionTypes: next
                                                }
                                            });
                                        }}
                                        style={{ marginRight: 5 }}
                                    />
                                    {type.replace('_', ' ')}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Allowed Difficulties</label>
                        <div className="checkbox-group" style={{ display: 'flex', gap: '15px' }}>
                            {DIFFICULTY_OPTIONS.map((difficulty) => (
                                <label
                                    key={difficulty}
                                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.practiceConfig.allowedDifficulties.includes(
                                            difficulty
                                        )}
                                        onChange={(event) => {
                                            const current = formData.practiceConfig.allowedDifficulties;
                                            let next;
                                            if (event.target.checked) next = [...current, difficulty];
                                            else next = current.filter((item) => item !== difficulty);
                                            setFormData({
                                                ...formData,
                                                practiceConfig: {
                                                    ...formData.practiceConfig,
                                                    allowedDifficulties: next
                                                }
                                            });
                                        }}
                                        style={{ marginRight: 5 }}
                                    />
                                    {difficulty}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={formData.practiceConfig.lockStudentOptions}
                                onChange={(event) =>
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            lockStudentOptions: event.target.checked
                                        }
                                    })
                                }
                                style={{ marginRight: 8 }}
                            />
                            Lock student options (Student cannot override strict difficulty/type)
                        </label>
                    </div>

                    {formData.practiceConfig.sessionType === 'assessment' && (
                        <>
                            <hr style={{ margin: '15px 0' }} />
                            <div className="form-group">
                                <label style={{ fontWeight: 700 }}>
                                    Official Assessment Settings (SB Gradebook)
                                </label>
                                <small className="text-muted" style={{ display: 'block' }}>
                                    This writes to a separate Standards-Based gradebook, not the regular
                                    gradebook.
                                </small>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Max Marks</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.assessmentConfig.maxMarks}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                assessmentConfig: {
                                                    ...formData.assessmentConfig,
                                                    maxMarks: event.target.value
                                                }
                                            })
                                        }
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Pass Marks</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.assessmentConfig.passMarks}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                assessmentConfig: {
                                                    ...formData.assessmentConfig,
                                                    passMarks: event.target.value
                                                }
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Results Visibility</label>
                                    <select
                                        value={formData.assessmentConfig.resultsVisibility}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                assessmentConfig: {
                                                    ...formData.assessmentConfig,
                                                    resultsVisibility: event.target.value
                                                }
                                            })
                                        }
                                    >
                                        <option value="immediate">Immediate</option>
                                        <option value="manual_release">Manual release</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Results Release At (optional)</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.assessmentConfig.resultsReleaseAt}
                                        onChange={(event) =>
                                            setFormData({
                                                ...formData,
                                                assessmentConfig: {
                                                    ...formData.assessmentConfig,
                                                    resultsReleaseAt: event.target.value
                                                }
                                            })
                                        }
                                        disabled={
                                            formData.assessmentConfig.resultsVisibility !==
                                            'manual_release'
                                        }
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="form-group">
                <label>Instructions (optional)</label>
                <textarea
                    value={formData.instructions}
                    onChange={(event) =>
                        setFormData({ ...formData, instructions: event.target.value })
                    }
                    rows={2}
                    placeholder="Additional instructions for students..."
                />
            </div>
        </div>
    );
};

export default StandardAssignForm;
