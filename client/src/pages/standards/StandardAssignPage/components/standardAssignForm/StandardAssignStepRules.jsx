import {
    AI_STANDARD_LANGUAGE_OPTIONS,
    DIFFICULTY_OPTIONS,
    GRAMMAR_LEVEL_OPTIONS,
    QUESTION_TYPE_OPTIONS
} from '../../constants';

const StandardAssignStepRules = ({
    t,
    formData,
    setFormData,
    showAdvanced,
    setShowAdvanced,
    openPanels,
    togglePanel,
    primaryAiLanguage,
    secondaryAiLanguage,
    applyAiLanguages,
    formatQuestionType,
    grammarOnly = false
}) => (
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
                            {!grammarOnly && (
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
                            )}

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
                                {grammarOnly ? (
                                    <>
                                        <label>
                                            {t('standardAssign:form.labels.enableGrammarLeveling', {
                                                defaultValue: 'Enable Grammar Level Test (MAP-style)'
                                            })}
                                        </label>
                                        <small className="text-muted">
                                            {t('standardAssign:form.hints.grammarModeFixed', {
                                                defaultValue: 'Grammar level mode is always enabled on this page.'
                                            })}
                                        </small>
                                    </>
                                ) : (
                                    <>
                                        <label className="assign-checkbox-option">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(formData.practiceConfig.enableGrammarLeveling)}
                                                onChange={(event) => {
                                                    const enabled = event.target.checked;
                                                    const fallbackLevels = GRAMMAR_LEVEL_OPTIONS.map((item) => item.value);
                                                    const currentLevels = Array.isArray(formData.practiceConfig.grammarLevels)
                                                        ? formData.practiceConfig.grammarLevels
                                                        : [];
                                                    setFormData({
                                                        ...formData,
                                                        practiceConfig: {
                                                            ...formData.practiceConfig,
                                                            enableGrammarLeveling: enabled,
                                                            grammarLevels: enabled
                                                                ? (currentLevels.length > 0
                                                                    ? currentLevels
                                                                    : fallbackLevels)
                                                                : []
                                                        }
                                                    });
                                                }}
                                            />
                                            {t('standardAssign:form.labels.enableGrammarLeveling', {
                                                defaultValue: 'Enable Grammar Level Test (MAP-style)'
                                            })}
                                        </label>
                                        <small className="text-muted">
                                            {t('standardAssign:form.hints.enableGrammarLeveling', {
                                                defaultValue: 'Use level-based grammar coverage (Beginner to Advanced) and save progress over time.'
                                            })}
                                        </small>
                                    </>
                                )}
                            </div>

                            {Boolean(formData.practiceConfig.enableGrammarLeveling) && (
                                <div className="form-group">
                                    <label>
                                        {t('standardAssign:form.labels.grammarLevels', {
                                            defaultValue: 'Grammar Levels Included'
                                        })}
                                    </label>
                                    <div className="checkbox-group assign-inline-checkboxes">
                                        {GRAMMAR_LEVEL_OPTIONS.map((level) => {
                                            const selectedLevels = Array.isArray(formData.practiceConfig.grammarLevels)
                                                ? formData.practiceConfig.grammarLevels
                                                : [];
                                            return (
                                                <label key={level.value} className="assign-checkbox-option">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLevels.includes(level.value)}
                                                        onChange={(event) => {
                                                            const current = Array.isArray(formData.practiceConfig.grammarLevels)
                                                                ? formData.practiceConfig.grammarLevels
                                                                : [];
                                                            const next = event.target.checked
                                                                ? Array.from(new Set([...current, level.value]))
                                                                : current.filter((item) => item !== level.value);
                                                            setFormData({
                                                                ...formData,
                                                                practiceConfig: {
                                                                    ...formData.practiceConfig,
                                                                    grammarLevels: next
                                                                }
                                                            });
                                                        }}
                                                    />
                                                    {t(`standardAssign:grammarLevels.${level.value}`, {
                                                        defaultValue: level.label
                                                    })}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() =>
                                                setFormData({
                                                    ...formData,
                                                    practiceConfig: {
                                                        ...formData.practiceConfig,
                                                        grammarLevels: ['beginner']
                                                    }
                                                })
                                            }
                                        >
                                            {t('standardAssign:actions.beginnerOnly', { defaultValue: 'Beginner only' })}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() =>
                                                setFormData({
                                                    ...formData,
                                                    practiceConfig: {
                                                        ...formData.practiceConfig,
                                                        grammarLevels: GRAMMAR_LEVEL_OPTIONS.map((item) => item.value)
                                                    }
                                                })
                                            }
                                        >
                                            {t('standardAssign:actions.allLevels', { defaultValue: 'All levels' })}
                                        </button>
                                    </div>
                                </div>
                            )}

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
);

export default StandardAssignStepRules;
