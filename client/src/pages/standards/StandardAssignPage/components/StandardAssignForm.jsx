import { useEffect, useMemo, useState } from 'react';
import {
    DIFFICULTY_OPTIONS,
    QUESTION_TYPE_OPTIONS,
    SEMESTER_OPTIONS
} from '../constants';

const formatQuestionType = (type) =>
    type
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

const formatDateValue = (value) => {
    if (!value) return 'Not set';
    const parts = String(value).split('-').map((item) => Number(item));
    const date =
        parts.length === 3 && parts.every((part) => Number.isFinite(part))
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not set';
    return date.toLocaleDateString();
};

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
    const [currentStep, setCurrentStep] = useState(1);
    const [studentScope, setStudentScope] = useState(
        Array.isArray(formData.students) && formData.students.length > 0 ? 'specific' : 'whole'
    );
    const [studentSearch, setStudentSearch] = useState('');
    const [openPanels, setOpenPanels] = useState({
        question: true,
        timing: false,
        assessment: formData.practiceConfig.sessionType === 'assessment'
    });

    const selectedStudents = Array.isArray(formData.students) ? formData.students : [];

    useEffect(() => {
        setStudentSearch('');
        setStudentScope(selectedStudents.length > 0 ? 'specific' : 'whole');
    }, [formData.classId]);

    useEffect(() => {
        if (currentStep === 3 && !showAdvanced) {
            setShowAdvanced(true);
        }
    }, [currentStep, showAdvanced, setShowAdvanced]);

    useEffect(() => {
        if (formData.practiceConfig.sessionType === 'assessment') {
            setOpenPanels((previous) => ({ ...previous, assessment: true }));
        }
    }, [formData.practiceConfig.sessionType]);

    const visibleStudents = useMemo(() => {
        const query = studentSearch.trim().toLowerCase();
        if (!query) return students;

        return students.filter((student) => {
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`
                .trim()
                .toLowerCase();
            const studentId = String(student.studentId || '').toLowerCase();
            return fullName.includes(query) || studentId.includes(query);
        });
    }, [students, studentSearch]);

    const studentMap = useMemo(() => {
        return students.reduce((accumulator, student) => {
            accumulator[student._id] = student;
            return accumulator;
        }, {});
    }, [students]);

    const selectedStudentsWithInfo = selectedStudents
        .map((studentId) => studentMap[studentId])
        .filter(Boolean);

    const selectedSubjectName = useMemo(() => {
        const inSubjectOptions = subjectOptions.find(
            (subject) => getEntityId(subject) === formData.subjectId
        );
        if (inSubjectOptions?.name) return inSubjectOptions.name;

        const inAllSubjects = subjects.find((subject) => getEntityId(subject) === formData.subjectId);
        return inAllSubjects?.name || 'Not selected';
    }, [subjectOptions, subjects, formData.subjectId, getEntityId]);

    const selectedStandardLabel = useMemo(() => {
        const standard = availableStandards.find((item) => item._id === formData.standardId);
        if (!standard) return 'Not selected';
        return getStandardOptionLabel(standard);
    }, [availableStandards, formData.standardId, getStandardOptionLabel]);

    const stepItems = [
        { id: 1, title: 'Core Setup' },
        { id: 2, title: 'Audience & Details' },
        { id: 3, title: 'Rules & Release' }
    ];

    const isStep1Valid =
        String(formData.title || '').trim().length > 0 &&
        Boolean(formData.classId) &&
        Boolean(formData.subjectId) &&
        Boolean(formData.standardId);

    const isStep2Valid = studentScope === 'whole' || selectedStudents.length > 0;

    const toggleStudent = (studentId) => {
        const alreadySelected = selectedStudents.includes(studentId);
        const nextStudents = alreadySelected
            ? selectedStudents.filter((id) => id !== studentId)
            : [...selectedStudents, studentId];
        setFormData({ ...formData, students: nextStudents });
    };

    const setWholeClassScope = () => {
        setStudentScope('whole');
        if (selectedStudents.length > 0) {
            setFormData({ ...formData, students: [] });
        }
    };

    const selectAllVisibleStudents = () => {
        const visibleIds = visibleStudents.map((student) => student._id);
        const merged = Array.from(new Set([...selectedStudents, ...visibleIds]));
        setFormData({ ...formData, students: merged });
    };

    const clearSelectedStudents = () => {
        setFormData({ ...formData, students: [] });
    };

    const togglePanel = (panel) => {
        setOpenPanels((previous) => ({ ...previous, [panel]: !previous[panel] }));
    };

    const goToStep = (targetStep) => {
        if (targetStep <= currentStep) {
            setCurrentStep(targetStep);
            return;
        }

        if (currentStep === 1 && !isStep1Valid) return;
        if (currentStep === 2 && !isStep2Valid) return;
        setCurrentStep(targetStep);
    };

    const renderStudentScope = () => (
        <div className="form-group">
            <label>Who gets this assignment?</label>
            <div className="assign-student-scope-row">
                <label className="assign-radio-option">
                    <input
                        type="radio"
                        name="studentScope"
                        checked={studentScope === 'whole'}
                        onChange={setWholeClassScope}
                    />
                    Whole class ({students.length})
                </label>
                <label className="assign-radio-option">
                    <input
                        type="radio"
                        name="studentScope"
                        checked={studentScope === 'specific'}
                        onChange={() => setStudentScope('specific')}
                    />
                    Specific students only
                </label>
            </div>

            {studentScope === 'specific' && (
                <div className="assign-student-picker">
                    <div className="assign-student-picker-toolbar">
                        <input
                            type="text"
                            placeholder="Search student name or ID"
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
                                Select All Visible
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={clearSelectedStudents}
                                disabled={selectedStudents.length === 0}
                            >
                                Clear
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
                                    title="Remove student"
                                >
                                    {student.firstName} {student.lastName}
                                    <span aria-hidden="true">x</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="assign-student-list">
                        {visibleStudents.length === 0 ? (
                            <small className="text-muted">No students match your search.</small>
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
                        {selectedStudents.length} selected
                    </small>
                </div>
            )}
        </div>
    );

    return (
        <div className="modal-body standard-assign-form-body">
            <div className="assign-stepper" role="tablist" aria-label="Assignment setup steps">
                {stepItems.map((step) => {
                    const stateClass =
                        currentStep === step.id
                            ? 'active'
                            : currentStep > step.id
                              ? 'completed'
                              : '';
                    return (
                        <button
                            key={step.id}
                            type="button"
                            className={`assign-step ${stateClass}`.trim()}
                            onClick={() => goToStep(step.id)}
                        >
                            <span className="assign-step-index">{step.id}</span>
                            <span className="assign-step-title">{step.title}</span>
                        </button>
                    );
                })}
            </div>

            <div className="assign-summary-card">
                <h4>Assignment Summary</h4>
                <div className="assign-summary-grid">
                    <span>Name</span>
                    <strong>{String(formData.title || '').trim() || 'Untitled assignment'}</strong>
                    <span>Class</span>
                    <strong>{selectedClass?.name || 'Not selected'}</strong>
                    <span>Subject</span>
                    <strong>{selectedSubjectName}</strong>
                    <span>Standard</span>
                    <strong>{selectedStandardLabel}</strong>
                    <span>Mode</span>
                    <strong>
                        {formData.practiceConfig.sessionType === 'assessment'
                            ? 'Graded Assessment'
                            : 'Practice'}
                    </strong>
                    <span>Learners</span>
                    <strong>
                        {studentScope === 'whole'
                            ? `Whole class (${students.length})`
                            : `${selectedStudents.length} selected`}
                    </strong>
                    <span>Due Date</span>
                    <strong>{formatDateValue(formData.dueDate)}</strong>
                    <span>Pre-generated</span>
                    <strong>{formData.preGeneratedQuestionCount || 10} questions</strong>
                </div>
            </div>

            {currentStep === 1 && (
                <section className="assign-step-section">
                    <h4>Core Setup</h4>
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

                    <div className="form-group">
                        <label>Standard *</label>
                        <select
                            value={formData.standardId}
                            disabled={!formData.classId || !formData.subjectId}
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
                        {!formData.classId || !formData.subjectId ? (
                            <small className="text-muted assign-inline-hint">
                                Select class, then subject, then standard.
                            </small>
                        ) : null}
                        {formData.standardId && (
                            <small className="text-muted assign-inline-hint">
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
                                        event.target.value === 'assessment'
                                            ? 'assessment'
                                            : 'practice';
                                    setFormData({
                                        ...formData,
                                        practiceConfig: {
                                            ...formData.practiceConfig,
                                            sessionType: nextMode
                                        }
                                    });
                                    if (nextMode === 'assessment' && !showAdvanced) {
                                        setShowAdvanced(true);
                                    }
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
                </section>
            )}

            {currentStep === 2 && (
                <section className="assign-step-section">
                    <h4>Audience And Assignment Details</h4>
                    {students.length > 0 ? (
                        renderStudentScope()
                    ) : (
                        <div className="form-group">
                            <small className="text-muted">No active students found in this class.</small>
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

                    <div className="form-group">
                        <label>Instructions (optional)</label>
                        <textarea
                            value={formData.instructions}
                            onChange={(event) =>
                                setFormData({ ...formData, instructions: event.target.value })
                            }
                            rows={3}
                            placeholder="Additional instructions for students..."
                        />
                    </div>
                </section>
            )}

            {currentStep === 3 && (
                <section className="assign-step-section">
                    <div className="assign-advanced-header">
                        <h4>Rules And Release</h4>
                        <button
                            type="button"
                            className="advanced-toggle"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
                        </button>
                    </div>

                    {showAdvanced && (
                        <div className="advanced-settings assign-accordion-group">
                            <div className="assign-accordion-item">
                                <button
                                    type="button"
                                    className="assign-accordion-trigger"
                                    onClick={() => togglePanel('question')}
                                >
                                    <span>Question Generation</span>
                                    <span>{openPanels.question ? '−' : '+'}</span>
                                </button>
                                {openPanels.question && (
                                    <div className="assign-accordion-content">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Pre-generated Questions Per Standard</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="50"
                                                    placeholder="e.g. 10"
                                                    value={formData.preGeneratedQuestionCount}
                                                    onChange={(event) =>
                                                        setFormData({
                                                            ...formData,
                                                            preGeneratedQuestionCount:
                                                                event.target.value
                                                        })
                                                    }
                                                />
                                                <small className="text-muted">
                                                    Questions are generated at assignment creation and
                                                    must be reviewed before publish.
                                                </small>
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
                                            <label>Allowed Question Types</label>
                                            <div className="checkbox-group assign-inline-checkboxes">
                                                {QUESTION_TYPE_OPTIONS.map((type) => (
                                                    <label key={type} className="assign-checkbox-option">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.practiceConfig.allowedQuestionTypes.includes(
                                                                type
                                                            )}
                                                            onChange={(event) => {
                                                                const current =
                                                                    formData.practiceConfig
                                                                        .allowedQuestionTypes;
                                                                const next = event.target.checked
                                                                    ? [...current, type]
                                                                    : current.filter(
                                                                          (item) => item !== type
                                                                      );
                                                                setFormData({
                                                                    ...formData,
                                                                    practiceConfig: {
                                                                        ...formData.practiceConfig,
                                                                        allowedQuestionTypes: next
                                                                    }
                                                                });
                                                            }}
                                                        />
                                                        {formatQuestionType(type)}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Allowed Difficulties</label>
                                            <div className="checkbox-group assign-inline-checkboxes">
                                                {DIFFICULTY_OPTIONS.map((difficulty) => (
                                                    <label
                                                        key={difficulty}
                                                        className="assign-checkbox-option"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.practiceConfig.allowedDifficulties.includes(
                                                                difficulty
                                                            )}
                                                            onChange={(event) => {
                                                                const current =
                                                                    formData.practiceConfig
                                                                        .allowedDifficulties;
                                                                const next = event.target.checked
                                                                    ? [...current, difficulty]
                                                                    : current.filter(
                                                                          (item) =>
                                                                              item !== difficulty
                                                                      );
                                                                setFormData({
                                                                    ...formData,
                                                                    practiceConfig: {
                                                                        ...formData.practiceConfig,
                                                                        allowedDifficulties: next
                                                                    }
                                                                });
                                                            }}
                                                        />
                                                        {difficulty.charAt(0).toUpperCase() +
                                                            difficulty.slice(1)}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label className="assign-checkbox-option">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.practiceConfig.lockStudentOptions}
                                                    onChange={(event) =>
                                                        setFormData({
                                                            ...formData,
                                                            practiceConfig: {
                                                                ...formData.practiceConfig,
                                                                lockStudentOptions:
                                                                    event.target.checked
                                                            }
                                                        })
                                                    }
                                                />
                                                Lock student options (students cannot override strict
                                                difficulty/type)
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="assign-accordion-item">
                                <button
                                    type="button"
                                    className="assign-accordion-trigger"
                                    onClick={() => togglePanel('timing')}
                                >
                                    <span>Timing And Availability</span>
                                    <span>{openPanels.timing ? '−' : '+'}</span>
                                </button>
                                {openPanels.timing && (
                                    <div className="assign-accordion-content">
                                        <div className="form-group">
                                            <label>Time Limit (seconds, 0 = Unlimited)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder="e.g. 1800"
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
                                                                    ...formData.practiceConfig
                                                                        .availability,
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
                                                                    ...formData.practiceConfig
                                                                        .availability,
                                                                    endAt: event.target.value
                                                                }
                                                            }
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {formData.practiceConfig.sessionType === 'assessment' && (
                                <div className="assign-accordion-item">
                                    <button
                                        type="button"
                                        className="assign-accordion-trigger"
                                        onClick={() => togglePanel('assessment')}
                                    >
                                        <span>Assessment Gradebook Rules</span>
                                        <span>{openPanels.assessment ? '−' : '+'}</span>
                                    </button>
                                    {openPanels.assessment && (
                                        <div className="assign-accordion-content">
                                            <div className="form-group">
                                                <small className="text-muted">
                                                    This writes to a separate Standards-Based gradebook,
                                                    not the regular gradebook.
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
                                                        value={
                                                            formData.assessmentConfig
                                                                .resultsVisibility
                                                        }
                                                        onChange={(event) =>
                                                            setFormData({
                                                                ...formData,
                                                                assessmentConfig: {
                                                                    ...formData.assessmentConfig,
                                                                    resultsVisibility:
                                                                        event.target.value
                                                                }
                                                            })
                                                        }
                                                    >
                                                        <option value="immediate">Immediate</option>
                                                        <option value="manual_release">
                                                            Manual release
                                                        </option>
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Results Release At (optional)</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={
                                                            formData.assessmentConfig
                                                                .resultsReleaseAt
                                                        }
                                                        onChange={(event) =>
                                                            setFormData({
                                                                ...formData,
                                                                assessmentConfig: {
                                                                    ...formData.assessmentConfig,
                                                                    resultsReleaseAt:
                                                                        event.target.value
                                                                }
                                                            })
                                                        }
                                                        disabled={
                                                            formData.assessmentConfig
                                                                .resultsVisibility !==
                                                            'manual_release'
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}

            <div className="assign-step-actions">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => goToStep(currentStep - 1)}
                    disabled={currentStep === 1}
                >
                    Back
                </button>
                {currentStep < 3 ? (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => goToStep(currentStep + 1)}
                        disabled={(currentStep === 1 && !isStep1Valid) || (currentStep === 2 && !isStep2Valid)}
                    >
                        Next
                    </button>
                ) : (
                    <small className="text-muted">Use the Assign button below to save this assignment.</small>
                )}
            </div>
        </div>
    );
};

export default StandardAssignForm;
