import { SEMESTER_OPTIONS } from '../../constants';

const StandardAssignStepCoreSetup = ({
    t,
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
    getEntityId,
    standardPickerRef,
    isStandardMenuOpen,
    setIsStandardMenuOpen,
    standardSearch,
    setStandardSearch,
    filteredStandardOptions,
    selectedStandardLabel,
    isArabicOrIslamicSubjectName,
    showAdvanced,
    setShowAdvanced,
    grammarOnly = false
}) => (
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

        {!grammarOnly && (
            <div className="form-group">
                <label>{t('standardAssign:form.labels.standardRequired')}</label>
                <div className="standard-picker" ref={standardPickerRef}>
                    <button
                        type="button"
                        className="standard-picker-trigger"
                        onClick={() => {
                            if (!formData.classId || !formData.subjectId) return;
                            setIsStandardMenuOpen((previous) => !previous);
                        }}
                        disabled={!formData.classId || !formData.subjectId}
                        aria-haspopup="listbox"
                        aria-expanded={isStandardMenuOpen}
                    >
                        <span
                            className={`standard-picker-trigger-text ${
                                formData.standardId ? '' : 'is-placeholder'
                            }`}
                        >
                            {formData.standardId
                                ? selectedStandardLabel
                                : t('standardAssign:form.options.selectStandard')}
                        </span>
                    </button>

                    {isStandardMenuOpen && (
                        <div className="standard-picker-menu" role="listbox">
                            <div className="standard-picker-search-wrap">
                                <input
                                    type="text"
                                    className="standard-picker-search"
                                    value={standardSearch}
                                    onChange={(event) => setStandardSearch(event.target.value)}
                                    placeholder={t('standardAssign:form.placeholders.searchStandard', {
                                        defaultValue: 'Search standards...'
                                    })}
                                    autoFocus
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') {
                                            setIsStandardMenuOpen(false);
                                        }
                                    }}
                                />
                            </div>

                            <div className="standard-picker-options">
                                {filteredStandardOptions.length === 0 ? (
                                    <div className="standard-picker-empty">
                                        {t('standardAssign:form.hints.noMatchingStandards', {
                                            defaultValue: 'No standards match your search.'
                                        })}
                                    </div>
                                ) : (
                                    filteredStandardOptions.map((standard) => {
                                        const isSelected = String(formData.standardId) === String(standard._id);
                                        return (
                                            <button
                                                key={standard._id}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                className={`standard-picker-option ${isSelected ? 'is-selected' : ''}`}
                                                onClick={() => {
                                                    setFormData({ ...formData, standardId: standard._id });
                                                    setIsStandardMenuOpen(false);
                                                }}
                                            >
                                                <span className="standard-picker-option-label">
                                                    {getStandardOptionLabel(standard)}
                                                </span>
                                                <span className="standard-picker-option-meta">
                                                    {getStandardDescription(standard)}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
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
                    <small
                        className="text-muted assign-inline-hint assign-standard-description"
                        title={getStandardDescription(selectedStandard)}
                    >
                        {getStandardDescription(selectedStandard)}
                    </small>
                )}
            </div>
        )}

        <div className="form-row">
            <div className="form-group">
                <label>{t('standardAssign:form.labels.assignmentModeRequired')}</label>
                {grammarOnly ? (
                    <input
                        type="text"
                        value={t('standardAssign:form.options.gradedAssessmentSb')}
                        disabled
                        readOnly
                    />
                ) : (
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
                )}
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
);

export default StandardAssignStepCoreSetup;
