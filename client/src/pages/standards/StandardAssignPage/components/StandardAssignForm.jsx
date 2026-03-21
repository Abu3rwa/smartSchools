import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AI_STANDARD_LANGUAGE_OPTIONS,
    DIFFICULTY_OPTIONS,
    QUESTION_TYPE_OPTIONS,
    SEMESTER_OPTIONS
} from '../constants';

const formatDateValue = (value, locale, notSetLabel) => {
    if (!value) return notSetLabel;
    const parts = String(value).split('-').map((item) => Number(item));
    const date =
        parts.length === 3 && parts.every((part) => Number.isFinite(part))
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(value);
    if (Number.isNaN(date.getTime())) return notSetLabel;
    return date.toLocaleDateString(locale);
};

const isArabicOrIslamicSubjectName = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
        /\barabic\b/.test(normalized) ||
        /\bislamic\b/.test(normalized) ||
        /\bislamiyat\b/.test(normalized) ||
        /\bquran\b/.test(normalized) ||
        /لغة عربية/.test(normalized) ||
        /عربي/.test(normalized) ||
        /دراسات اسلامية/.test(normalized) ||
        /تربية اسلامية/.test(normalized) ||
        /قرآن/.test(normalized)
    );
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
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;

    const formatQuestionType = (type) =>
        t(`standardAssign:questionTypes.${type}`, {
            defaultValue: type
                .split('_')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ')
        });

    const [currentStep, setCurrentStep] = useState(1);
    const [showSummaryModal, setShowSummaryModal] = useState(false);
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
    const selectedAiLanguages = Array.isArray(formData.aiLanguages)
        ? formData.aiLanguages.filter(Boolean).slice(0, 2)
        : ['en'];
    const primaryAiLanguage = selectedAiLanguages[0] || 'en';
    const secondaryAiLanguage = selectedAiLanguages[1] || '';
    const applyAiLanguages = (primary, secondary = '') => {
        const next = [primary, secondary].filter(Boolean);
        const deduped = Array.from(new Set(next)).slice(0, 2);
        setFormData({
            ...formData,
            aiLanguages: deduped.length > 0 ? deduped : ['en']
        });
    };
    const getAiLanguageLabel = (code) =>
        AI_STANDARD_LANGUAGE_OPTIONS.find((item) => item.value === code)?.label || code;

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
        return inAllSubjects?.name || t('standardAssign:common.notSelected');
    }, [subjectOptions, subjects, formData.subjectId, getEntityId, t]);

    const selectedStandardLabel = useMemo(() => {
        const standard = availableStandards.find((item) => item._id === formData.standardId);
        if (!standard) return t('standardAssign:common.notSelected');
        return getStandardOptionLabel(standard);
    }, [availableStandards, formData.standardId, getStandardOptionLabel, t]);

    const stepItems = [
        { id: 1, title: t('standardAssign:form.steps.coreSetup') },
        { id: 2, title: t('standardAssign:form.steps.audienceDetails') },
        { id: 3, title: t('standardAssign:form.steps.rulesRelease') }
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
                            <small className="text-muted">{t('standardAssign:form.studentScope.noStudentsMatch')}</small>
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

    const renderSummaryContent = () => (
        <div className="assign-summary-grid">
            <span>{t('standardAssign:form.summary.name')}</span>
            <strong>{String(formData.title || '').trim() || t('standardAssign:form.summary.untitledAssignment')}</strong>
            <span>{t('standardAssign:form.summary.class')}</span>
            <strong>{selectedClass?.name || t('standardAssign:common.notSelected')}</strong>
            <span>{t('standardAssign:form.summary.subject')}</span>
            <strong>{selectedSubjectName}</strong>
            <span>{t('standardAssign:form.summary.standard')}</span>
            <strong>{selectedStandardLabel}</strong>
            <span>{t('standardAssign:form.summary.mode')}</span>
            <strong>
                {formData.practiceConfig.sessionType === 'assessment'
                    ? t('standardAssign:modes.gradedAssessment')
                    : t('standardAssign:modes.practice')}
            </strong>
            <span>{t('standardAssign:form.summary.learners')}</span>
            <strong>
                {studentScope === 'whole'
                    ? t('standardAssign:form.studentScope.wholeClass', { count: students.length })
                    : t('standardAssign:form.studentScope.selectedCount', { count: selectedStudents.length })}
            </strong>
            <span>{t('standardAssign:form.summary.dueDate')}</span>
            <strong>{formatDateValue(formData.dueDate, locale, t('standardAssign:common.notSet'))}</strong>
            <span>{t('standardAssign:form.summary.preGenerated')}</span>
            <strong>{t('standardAssign:form.summary.preGeneratedCount', { count: formData.preGeneratedQuestionCount || 10 })}</strong>
            <span>{t('standardAssign:form.summary.aiLanguages')}</span>
            <strong>
                {selectedAiLanguages.map((code) => getAiLanguageLabel(code)).join(' + ')}
            </strong>
        </div>
    );

    return (
        <div className="modal-body standard-assign-form-body">
            <div className="assign-stepper" role="tablist" aria-label={t('standardAssign:form.aria.assignmentSetupSteps')}>
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

            <div
                className="assign-summary-card"
                role="button"
                tabIndex={0}
                onClick={() => setShowSummaryModal(true)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setShowSummaryModal(true);
                    }
                }}
            >
                <div className="assign-summary-card-header">
                    <h4>{t('standardAssign:form.summary.title')}</h4>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            setShowSummaryModal(true);
                        }}
                    >
                        {t('standardAssign:actions.openSummary', { defaultValue: 'Open Summary' })}
                    </button>
                </div>
                {renderSummaryContent()}
            </div>

            {showSummaryModal && (
                <div className="assign-summary-modal-overlay" onClick={() => setShowSummaryModal(false)}>
                    <div
                        className="assign-summary-modal"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="assign-summary-modal-header">
                            <h4>{t('standardAssign:form.summary.title')}</h4>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowSummaryModal(false)}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="assign-summary-modal-body">
                            {renderSummaryContent()}
                        </div>
                        <div className="assign-summary-modal-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => setShowSummaryModal(false)}
                            >
                                {t('standardAssign:actions.close', { defaultValue: 'Close' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 1 && (
                <section className="assign-step-section">
                    <h4>{t('standardAssign:form.steps.coreSetup')}</h4>
                    <div className="form-group">
                        <label>{t('standardAssign:form.labels.assignmentNameRequired')}</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(event) =>
                                setFormData({ ...formData, title: event.target.value })
                            }
                            placeholder={t('standardAssign:form.placeholders.assignmentName')}
                            required
                        />
                        <small className="text-muted">
                            {t('standardAssign:form.assignmentNameHint')}
                        </small>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>{t('standardAssign:form.labels.classRequired')}</label>
                            <select
                                value={formData.classId}
                                onChange={(event) => handleClassChange(event.target.value)}
                                required
                            >
                                <option value="">{t('standardAssign:form.options.selectClass')}</option>
                                {classes.map((schoolClass) => (
                                    <option key={schoolClass._id} value={schoolClass._id}>
                                        {schoolClass.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>{t('standardAssign:form.labels.subjectRequired')}</label>
                            <select
                                value={formData.subjectId}
                                onChange={(event) => {
                                    const nextSubjectId = event.target.value;
                                    const subjectEntry = subjectOptions.find(
                                        (item) => getEntityId(item) === nextSubjectId
                                    );
                                    const fallbackSubject = subjects.find(
                                        (item) => getEntityId(item) === nextSubjectId
                                    );
                                    const selectedSubjectName =
                                        subjectEntry?.name || fallbackSubject?.name || '';
                                    const nextAiLanguages =
                                        isArabicOrIslamicSubjectName(selectedSubjectName) &&
                                        (
                                            !Array.isArray(formData.aiLanguages) ||
                                            formData.aiLanguages.length === 0 ||
                                            (
                                                formData.aiLanguages.length === 1 &&
                                                String(formData.aiLanguages[0]).toLowerCase() === 'en'
                                            )
                                        )
                                            ? ['ar']
                                            : formData.aiLanguages;
                                    setFormData({
                                        ...formData,
                                        subjectId: nextSubjectId,
                                        standardId: '',
                                        aiLanguages: nextAiLanguages
                                    });
                                }}
                                disabled={!formData.classId || subjectOptions.length === 0}
                                required
                            >
                                <option value="">{t('standardAssign:form.options.selectSubject')}</option>
                                {subjectOptions.map((subject) => {
                                    const subjectId = getEntityId(subject);
                                    const subjectName =
                                        subject?.name ||
                                        subjects.find((item) => getEntityId(item) === subjectId)?.name ||
                                        t('standardAssign:common.subject');
                                    return (
                                        <option key={subjectId} value={subjectId}>
                                            {subjectName}
                                        </option>
                                    );
                                })}
                            </select>
                            {!selectedClass && isTeacher && (
                                <small className="text-muted">
                                    {t('standardAssign:form.hints.selectClassForSubjects')}
                                </small>
                            )}
                            {selectedClass && classSubjects.length > 0 && (
                                <small className="text-muted">
                                    {isTeacher
                                        ? t('standardAssign:form.hints.teacherSubjectsOnly')
                                        : t('standardAssign:form.hints.classConfiguredSubjects')}
                                </small>
                            )}
                            {selectedClass && isTeacher && classSubjects.length === 0 && subjectOptions.length === 0 && (
                                <small className="text-danger">
                                    {t('standardAssign:form.hints.noSubjectsMapped')}
                                </small>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>{t('standardAssign:form.labels.standardRequired')}</label>
                        <select
                            value={formData.standardId}
                            disabled={!formData.classId || !formData.subjectId}
                            onChange={(event) =>
                                setFormData({ ...formData, standardId: event.target.value })
                            }
                            required
                        >
                            <option value="">{t('standardAssign:form.options.selectStandard')}</option>
                            {availableStandards.map((standard) => (
                                <option key={standard._id} value={standard._id}>
                                    {getStandardOptionLabel(standard)}
                                </option>
                            ))}
                        </select>
                        {selectedClass && (
                            <small className="text-muted">
                                {t('standardAssign:form.hints.showingStandardsForGrade', {
                                    grade: selectedClass.grade
                                })}
                                {formData.subjectId ? t('standardAssign:form.hints.andSelectedSubject') : ''}.
                            </small>
                        )}
                        {!formData.classId || !formData.subjectId ? (
                            <small className="text-muted assign-inline-hint">
                                {t('standardAssign:form.hints.selectClassSubjectStandard')}
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
                            <label>{t('standardAssign:form.labels.assignmentModeRequired')}</label>
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
                                <option value="practice">{t('standardAssign:form.options.practiceNotGraded')}</option>
                                <option value="assessment">{t('standardAssign:form.options.gradedAssessmentSb')}</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>{t('standardAssign:form.labels.semesterRequired')}</label>
                            <select
                                value={formData.semester || 1}
                                onChange={(event) =>
                                    setFormData({ ...formData, semester: event.target.value })
                                }
                                required
                            >
                                {SEMESTER_OPTIONS.map((semesterOption) => (
                                    <option key={semesterOption} value={semesterOption}>
                                        {t('standardAssign:form.options.semesterOption', {
                                            semester: semesterOption
                                        })}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>
            )}

            {currentStep === 2 && (
                <section className="assign-step-section">
                    <h4>{t('standardAssign:form.steps.audienceDetails')}</h4>
                    {students.length > 0 ? (
                        renderStudentScope()
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
                </section>
            )}

            {currentStep === 3 && (
                <section className="assign-step-section">
                    <div className="assign-advanced-header">
                        <h4>{t('standardAssign:form.steps.rulesRelease')}</h4>
                        <button
                            type="button"
                            className="advanced-toggle"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            {showAdvanced
                                ? t('standardAssign:actions.hideAdvancedSettings')
                                : t('standardAssign:actions.showAdvancedSettings')}
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
                                    <span>{t('standardAssign:form.panels.questionGeneration')}</span>
                                    <span>{openPanels.question ? '−' : '+'}</span>
                                </button>
                                {openPanels.question && (
                                    <div className="assign-accordion-content">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>{t('standardAssign:form.labels.primaryAiLanguage')}</label>
                                                <select
                                                    value={primaryAiLanguage}
                                                    onChange={(event) =>
                                                        applyAiLanguages(event.target.value, secondaryAiLanguage)
                                                    }
                                                >
                                                    {AI_STANDARD_LANGUAGE_OPTIONS.map((language) => (
                                                        <option key={language.value} value={language.value}>
                                                            {language.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>{t('standardAssign:form.labels.secondaryAiLanguageOptional')}</label>
                                                <select
                                                    value={secondaryAiLanguage}
                                                    onChange={(event) =>
                                                        applyAiLanguages(primaryAiLanguage, event.target.value)
                                                    }
                                                >
                                                    <option value="">{t('standardAssign:form.options.none')}</option>
                                                    {AI_STANDARD_LANGUAGE_OPTIONS
                                                        .filter((language) => language.value !== primaryAiLanguage)
                                                        .map((language) => (
                                                            <option key={language.value} value={language.value}>
                                                                {language.label}
                                                            </option>
                                                        ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>{t('standardAssign:form.labels.preGeneratedQuestionsPerStandard')}</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="50"
                                                    placeholder={t('standardAssign:form.placeholders.preGeneratedQuestions')}
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
                                                    {t('standardAssign:form.hints.questionsGeneratedHint')}
                                                </small>
                                            </div>
                                            <div className="form-group">
                                                <label>{t('standardAssign:form.labels.questionsLimit')}</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder={t('standardAssign:form.placeholders.questionsLimit')}
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
                                            <label>{t('standardAssign:form.labels.allowedQuestionTypes')}</label>
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
                                            <label>{t('standardAssign:form.labels.allowedDifficulties')}</label>
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
                                                        {t(`standardAssign:difficulty.${difficulty}`, {
                                                            defaultValue:
                                                                difficulty.charAt(0).toUpperCase() +
                                                                difficulty.slice(1)
                                                        })}
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
                                                {t('standardAssign:form.labels.lockStudentOptions')}
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
                                    <span>{t('standardAssign:form.panels.timingAndAvailability')}</span>
                                    <span>{openPanels.timing ? '−' : '+'}</span>
                                </button>
                                {openPanels.timing && (
                                    <div className="assign-accordion-content">
                                        <div className="form-group">
                                            <label>{t('standardAssign:form.labels.timeLimit')}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                placeholder={t('standardAssign:form.placeholders.timeLimit')}
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
                                                <label>{t('standardAssign:form.labels.startTimeOptional')}</label>
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
                                                <label>{t('standardAssign:form.labels.endTimeOptional')}</label>
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
                                        <span>{t('standardAssign:form.panels.assessmentGradebookRules')}</span>
                                        <span>{openPanels.assessment ? '−' : '+'}</span>
                                    </button>
                                    {openPanels.assessment && (
                                        <div className="assign-accordion-content">
                                            <div className="form-group">
                                                <small className="text-muted">
                                                    {t('standardAssign:form.hints.separateGradebookHint')}
                                                </small>
                                            </div>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>{t('standardAssign:form.labels.maxMarks')}</label>
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
                                                    <label>{t('standardAssign:form.labels.passMarks')}</label>
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
                                                    <label>{t('standardAssign:form.labels.resultsVisibility')}</label>
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
                                                        <option value="immediate">{t('standardAssign:form.options.immediate')}</option>
                                                        <option value="manual_release">
                                                            {t('standardAssign:form.options.manualRelease')}
                                                        </option>
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>{t('standardAssign:form.labels.resultsReleaseAtOptional')}</label>
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
                    {t('standardAssign:actions.back')}
                </button>
                {currentStep < 3 ? (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => goToStep(currentStep + 1)}
                        disabled={(currentStep === 1 && !isStep1Valid) || (currentStep === 2 && !isStep2Valid)}
                    >
                        {t('standardAssign:actions.next')}
                    </button>
                ) : (
                    <small className="text-muted">
                        {t('standardAssign:form.hints.useAssignButtonBelow')}
                    </small>
                )}
            </div>
        </div>
    );
};

export default StandardAssignForm;
