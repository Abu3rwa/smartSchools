import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AI_STANDARD_LANGUAGE_OPTIONS } from '../constants';
import StandardAssignSummaryPanel from './standardAssignForm/StandardAssignSummaryPanel';
import StandardAssignStepCoreSetup from './standardAssignForm/StandardAssignStepCoreSetup';
import StandardAssignStepAudience from './standardAssignForm/StandardAssignStepAudience';
import StandardAssignStepRules from './standardAssignForm/StandardAssignStepRules';
import {
    formatDateValue,
    isArabicOrIslamicSubjectName
} from './standardAssignForm/standardAssignFormUtils';

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
    const [standardSearch, setStandardSearch] = useState('');
    const [isStandardMenuOpen, setIsStandardMenuOpen] = useState(false);
    const [openPanels, setOpenPanels] = useState({
        question: true,
        timing: false,
        assessment: formData.practiceConfig.sessionType === 'assessment'
    });
    const standardPickerRef = useRef(null);

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

    useEffect(() => {
        setIsStandardMenuOpen(false);
        setStandardSearch('');
    }, [formData.classId, formData.subjectId]);

    useEffect(() => {
        if (!isStandardMenuOpen) return undefined;

        const handleDocumentMouseDown = (event) => {
            if (!standardPickerRef.current?.contains(event.target)) {
                setIsStandardMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);
        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown);
        };
    }, [isStandardMenuOpen]);

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

    const filteredStandardOptions = useMemo(() => {
        const query = standardSearch.trim().toLowerCase();
        if (!query) return availableStandards;

        return availableStandards.filter((standard) => {
            const optionLabel = String(getStandardOptionLabel(standard) || '').toLowerCase();
            const description = String(getStandardDescription(standard) || '').toLowerCase();
            const code = String(standard?.code || '').toLowerCase();

            return (
                optionLabel.includes(query) ||
                description.includes(query) ||
                code.includes(query)
            );
        });
    }, [availableStandards, standardSearch, getStandardOptionLabel, getStandardDescription]);

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

    const summaryItems = useMemo(() => ([
        {
            key: 'name',
            label: t('standardAssign:form.summary.name'),
            value: String(formData.title || '').trim() || t('standardAssign:form.summary.untitledAssignment')
        },
        {
            key: 'class',
            label: t('standardAssign:form.summary.class'),
            value: selectedClass?.name || t('standardAssign:common.notSelected')
        },
        {
            key: 'subject',
            label: t('standardAssign:form.summary.subject'),
            value: selectedSubjectName
        },
        {
            key: 'standard',
            label: t('standardAssign:form.summary.standard'),
            value: selectedStandardLabel
        },
        {
            key: 'mode',
            label: t('standardAssign:form.summary.mode'),
            value: formData.practiceConfig.sessionType === 'assessment'
                ? t('standardAssign:modes.gradedAssessment')
                : t('standardAssign:modes.practice')
        },
        {
            key: 'learners',
            label: t('standardAssign:form.summary.learners'),
            value: studentScope === 'whole'
                ? t('standardAssign:form.studentScope.wholeClass', { count: students.length })
                : t('standardAssign:form.studentScope.selectedCount', { count: selectedStudents.length })
        },
        {
            key: 'dueDate',
            label: t('standardAssign:form.summary.dueDate'),
            value: formatDateValue(formData.dueDate, locale, t('standardAssign:common.notSet'))
        },
        {
            key: 'preGenerated',
            label: t('standardAssign:form.summary.preGenerated'),
            value: t('standardAssign:form.summary.preGeneratedCount', { count: formData.preGeneratedQuestionCount || 10 })
        },
        {
            key: 'aiLanguages',
            label: t('standardAssign:form.summary.aiLanguages'),
            value: selectedAiLanguages.map((code) => getAiLanguageLabel(code)).join(' + ')
        },
        {
            key: 'notifyParents',
            label: t('standardAssign:form.summary.notifyParents', { defaultValue: 'Notify Parents' }),
            value: formData.notifyParents !== false
                ? t('standardAssign:common.yes', { defaultValue: 'Yes' })
                : t('standardAssign:common.no', { defaultValue: 'No' })
        },
        {
            key: 'notifyStudents',
            label: t('standardAssign:form.summary.notifyStudents', { defaultValue: 'Notify Students' }),
            value: formData.notifyStudents !== false
                ? t('standardAssign:common.yes', { defaultValue: 'Yes' })
                : t('standardAssign:common.no', { defaultValue: 'No' })
        }
    ]), [
        t,
        formData.title,
        formData.practiceConfig.sessionType,
        formData.dueDate,
        formData.preGeneratedQuestionCount,
        formData.notifyParents,
        formData.notifyStudents,
        selectedClass?.name,
        selectedSubjectName,
        selectedStandardLabel,
        studentScope,
        students.length,
        selectedStudents.length,
        selectedAiLanguages,
        locale
    ]);

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

            <StandardAssignSummaryPanel
                t={t}
                showSummaryModal={showSummaryModal}
                setShowSummaryModal={setShowSummaryModal}
                summaryItems={summaryItems}
            />

            {currentStep === 1 && (
                <StandardAssignStepCoreSetup
                    t={t}
                    formData={formData}
                    setFormData={setFormData}
                    selectedClass={selectedClass}
                    availableStandards={availableStandards}
                    getStandardOptionLabel={getStandardOptionLabel}
                    getStandardDescription={getStandardDescription}
                    selectedStandard={selectedStandard}
                    classes={classes}
                    handleClassChange={handleClassChange}
                    subjectOptions={subjectOptions}
                    subjects={subjects}
                    isTeacher={isTeacher}
                    classSubjects={classSubjects}
                    getEntityId={getEntityId}
                    standardPickerRef={standardPickerRef}
                    isStandardMenuOpen={isStandardMenuOpen}
                    setIsStandardMenuOpen={setIsStandardMenuOpen}
                    standardSearch={standardSearch}
                    setStandardSearch={setStandardSearch}
                    filteredStandardOptions={filteredStandardOptions}
                    selectedStandardLabel={selectedStandardLabel}
                    isArabicOrIslamicSubjectName={isArabicOrIslamicSubjectName}
                    showAdvanced={showAdvanced}
                    setShowAdvanced={setShowAdvanced}
                />
            )}

            {currentStep === 2 && (
                <StandardAssignStepAudience
                    t={t}
                    formData={formData}
                    setFormData={setFormData}
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
            )}

            {currentStep === 3 && (
                <StandardAssignStepRules
                    t={t}
                    formData={formData}
                    setFormData={setFormData}
                    showAdvanced={showAdvanced}
                    setShowAdvanced={setShowAdvanced}
                    openPanels={openPanels}
                    togglePanel={togglePanel}
                    primaryAiLanguage={primaryAiLanguage}
                    secondaryAiLanguage={secondaryAiLanguage}
                    applyAiLanguages={applyAiLanguages}
                    formatQuestionType={formatQuestionType}
                />
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
