import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const moveInArray = (items = [], fromIndex, toIndex) => {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
};

const CurriculumMapEditorPanel = ({
  draft,
  setDraft,
  classes = [],
  subjects = [],
  activeTemplate,
  importState,
  importLoading,
  googleDriveStatus,
  onRefreshImportState,
  onUploadImportFile,
  onImportGoogleDoc,
  classSubjectPairs = [],
  isTeacherLimited = false,
  onApplyImportJob,
  onConnectGoogleDrive,
  onSave,
  onCancel,
  saving,
}) => {
  const { t } = useTranslation(['curriculum']);
  const [uploadFile, setUploadFile] = useState(null);
  const [googleDocInput, setGoogleDocInput] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);

  const fieldConfig = Array.isArray(activeTemplate?.fields) ? activeTemplate.fields : [];
  const fieldEnabled = (fieldKey) => {
    const field = fieldConfig.find((item) => item.key === fieldKey);
    return field ? field.enabled !== false : true;
  };
  const jobs = Array.isArray(importState?.jobs) ? importState.jobs : [];
  const selectedJob = jobs.find((job) => job._id === selectedJobId) || jobs[0] || null;
  const suggestionSections = Array.isArray(selectedJob?.suggestedSections) ? selectedJob.suggestedSections : [];
  const driveConnected = googleDriveStatus?.connected === true;

  useEffect(() => {
    if (selectedJob?._id && selectedJobId !== selectedJob._id) {
      setSelectedJobId(selectedJob._id);
    }
  }, [selectedJob, selectedJobId]);
  const filteredSubjects = !isTeacherLimited || !draft?.classId
    ? subjects
    : subjects.filter((subject) => classSubjectPairs.some(
      (pair) => pair.classId === draft.classId && pair.subjectId === String(subject._id)
    ));

  useEffect(() => {
    if (!draft?.subjectId) return;
    const hasSelectedSubject = filteredSubjects.some((subject) => String(subject._id) === draft.subjectId);
    if (!hasSelectedSubject) {
      setDraft((prev) => ({ ...prev, subjectId: '' }));
    }
  }, [draft?.subjectId, filteredSubjects, setDraft]);

  useEffect(() => {
    setSelectedSectionIds([]);
  }, [selectedJobId]);

  const updateDraft = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updateStructure = (key, value) => setDraft((prev) => ({
    ...prev,
    structure: { ...(prev.structure || {}), [key]: value },
  }));

  const updateSection = (sectionIndex, patch) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section, index) => (index === sectionIndex ? { ...section, ...patch } : section)),
    }));
  };

  const updateItem = (sectionIndex, itemIndex, patch) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, idx) => (idx === itemIndex ? { ...item, ...patch } : item)),
        };
      }),
    }));
  };

  const addSection = () => {
    setDraft((prev) => ({
      ...prev,
      sections: [
        ...(prev.sections || []),
        { title: `${draft?.structure?.sectionLabel || 'Section'} ${(prev.sections || []).length + 1}`, sectionType: 'period', items: [{ title: '', type: 'instructional_block' }] },
      ],
    }));
  };

  const removeSection = (sectionIndex) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, index) => index !== sectionIndex),
    }));
  };

  const addItem = (sectionIndex) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: [...(section.items || []), { title: '', type: 'instructional_block' }],
        };
      }),
    }));
  };

  const removeItem = (sectionIndex, itemIndex) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.filter((_, idx) => idx !== itemIndex),
        };
      }),
    }));
  };

  const moveSection = (sectionIndex, direction) => {
    setDraft((prev) => ({
      ...prev,
      sections: moveInArray(prev.sections, sectionIndex, sectionIndex + direction),
    }));
  };

  const moveItem = (sectionIndex, itemIndex, direction) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          items: moveInArray(section.items, itemIndex, itemIndex + direction),
        };
      }),
    }));
  };

  const toggleSectionSelection = (sectionId) => {
    setSelectedSectionIds((prev) => (
      prev.includes(sectionId)
        ? prev.filter((value) => value !== sectionId)
        : [...prev, sectionId]
    ));
  };

  return (
    <div className="curriculum-map-editor-panel">
      <div className="panel-header">
        <h2>{draft._id ? t('editor.editTitle') : t('editor.createTitle')}</h2>
      </div>

      <div className="form-grid">
        <label>
          {t('shared.academicYear')}
          <input value={draft.academicYear || ''} onChange={(event) => updateDraft('academicYear', event.target.value)} />
        </label>
        <label>
          {t('shared.class')}
          <select value={draft.classId || ''} onChange={(event) => updateDraft('classId', event.target.value)}>
            <option value="">{t('shared.selectClass')}</option>
            {classes.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
          </select>
        </label>
        <label>
          {t('shared.subject')}
          <select value={draft.subjectId || ''} onChange={(event) => updateDraft('subjectId', event.target.value)}>
            <option value="">{t('shared.selectSubject')}</option>
            {filteredSubjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name}</option>)}
          </select>
        </label>
        <label>
          {t('editor.structure')}
          <select value={draft?.structure?.granularity || 'unit_week'} onChange={(event) => updateStructure('granularity', event.target.value)}>
            <option value="term_only">{t('shared.granularity.term_only')}</option>
            <option value="unit">{t('shared.granularity.unit')}</option>
            <option value="week">{t('shared.granularity.week')}</option>
            <option value="unit_week">{t('shared.granularity.unit_week')}</option>
            <option value="strand_unit">{t('shared.granularity.strand_unit')}</option>
          </select>
        </label>
      </div>

      <label>
        {t('editor.mapTitle')}
        <input value={draft.title || ''} onChange={(event) => updateDraft('title', event.target.value)} />
      </label>
      <label>
        {t('shared.description')}
        <textarea value={draft.description || ''} onChange={(event) => updateDraft('description', event.target.value)} />
      </label>

      <div className="curriculum-ai-import-panel">
        <div className="panel-header">
          <h3>{t('editor.import.title')}</h3>
          {draft?._id && (
            <button type="button" onClick={onRefreshImportState} disabled={importLoading}>
              {importLoading ? t('editor.import.refreshing') : t('editor.import.refresh')}
            </button>
          )}
        </div>
        {!draft?._id ? (
          <p className="empty-hint">{t('editor.import.saveFirst')}</p>
        ) : (
          <>
            <div className="form-grid">
              <label>
                {t('editor.import.uploadLabel')}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                />
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  disabled={!uploadFile || importLoading}
                  onClick={() => {
                    if (!uploadFile) return;
                    onUploadImportFile(uploadFile);
                    setUploadFile(null);
                  }}
                >
                  {t('editor.import.uploadAndExtract')}
                </button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                {t('editor.import.googleDocLabel')}
                <input
                  value={googleDocInput}
                  placeholder={t('editor.import.googleDocPlaceholder')}
                  onChange={(event) => setGoogleDocInput(event.target.value)}
                />
              </label>
              <div className="inline-actions">
                {!driveConnected ? (
                  <button type="button" onClick={onConnectGoogleDrive}>{t('editor.import.connectGoogleDrive')}</button>
                ) : (
                  <button
                    type="button"
                    disabled={!googleDocInput.trim() || importLoading}
                    onClick={() => onImportGoogleDoc(googleDocInput.trim())}
                  >
                    {t('editor.import.importGoogleDoc')}
                  </button>
                )}
              </div>
            </div>
            {!driveConnected && <p className="empty-hint">{t('editor.import.driveDisconnected')}</p>}

            <div className="curriculum-import-jobs">
              <h4>{t('editor.import.jobsTitle')}</h4>
              {jobs.length === 0 ? (
                <p className="empty-hint">{t('editor.import.noJobs')}</p>
              ) : (
                <>
                  <select value={selectedJobId || ''} onChange={(event) => setSelectedJobId(event.target.value)}>
                    {jobs.map((job) => (
                      <option key={job._id} value={job._id}>
                        {job.status} • {job.stage} • {new Date(job.createdAt).toLocaleString()}
                      </option>
                    ))}
                  </select>

                  {selectedJob && (
                    <div className="curriculum-import-job-detail">
                      <p>{t('editor.import.statusLine', { status: t(`status.${selectedJob.status}`, { defaultValue: selectedJob.status }) })}</p>
                      <p>{t('editor.import.stageLine', { stage: selectedJob.stage })}</p>
                      {selectedJob.error ? <p className="error-text">{selectedJob.error}</p> : null}
                      {selectedJob.status === 'completed' && (
                        <>
                          <div className="inline-actions">
                            <button
                              type="button"
                              onClick={() => onApplyImportJob(selectedJob._id, { applyMode: 'all' })}
                            >
                              {t('editor.import.applyAllSections')}
                            </button>
                            <button
                              type="button"
                              disabled={selectedSectionIds.length === 0}
                              onClick={() => onApplyImportJob(selectedJob._id, {
                                applyMode: 'selected',
                                selectedSectionIds,
                              })}
                            >
                              {t('editor.import.applySelected', { count: selectedSectionIds.length })}
                            </button>
                          </div>

                          <div className="curriculum-import-suggestion-list">
                            {suggestionSections.map((section) => (
                              <label key={section.suggestionId} className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={selectedSectionIds.includes(section.suggestionId)}
                                  onChange={() => toggleSectionSelection(section.suggestionId)}
                                />
                                {t('editor.import.suggestionSection', {
                                  title: section.title,
                                  count: Array.isArray(section.items) ? section.items.length : 0,
                                })}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="section-editor-list">
        {(draft.sections || []).map((section, sectionIndex) => (
          <div key={`section-${sectionIndex}`} className="section-editor-card">
            <div className="section-editor-header">
              <input
                value={section.title || ''}
                placeholder={t('editor.sectionTitlePlaceholder', {
                  label: draft?.structure?.sectionLabel || t('shared.section'),
                })}
                onChange={(event) => updateSection(sectionIndex, { title: event.target.value })}
              />
              <div className="mini-actions">
                <button type="button" onClick={() => moveSection(sectionIndex, -1)}>{t('shared.up')}</button>
                <button type="button" onClick={() => moveSection(sectionIndex, 1)}>{t('shared.down')}</button>
                <button type="button" onClick={() => removeSection(sectionIndex)}>{t('shared.remove')}</button>
              </div>
            </div>

            {(section.items || []).map((item, itemIndex) => (
              <div key={`section-${sectionIndex}-item-${itemIndex}`} className="item-editor-card">
                <div className="item-editor-header">
                  <input
                    value={item.title || ''}
                    placeholder={t('editor.itemTitlePlaceholder', {
                      label: draft?.structure?.itemLabel || t('shared.item'),
                    })}
                    onChange={(event) => updateItem(sectionIndex, itemIndex, { title: event.target.value })}
                  />
                  <div className="mini-actions">
                    <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, -1)}>{t('shared.up')}</button>
                    <button type="button" onClick={() => moveItem(sectionIndex, itemIndex, 1)}>{t('shared.down')}</button>
                    <button type="button" onClick={() => removeItem(sectionIndex, itemIndex)}>{t('shared.remove')}</button>
                  </div>
                </div>

                <div className="form-grid">
                  <label>
                    {t('editor.startWeek')}
                    <input
                      type="number"
                      min={1}
                      max={53}
                      value={item.startWeek || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { startWeek: event.target.value })}
                    />
                  </label>
                  <label>
                    {t('editor.endWeek')}
                    <input
                      type="number"
                      min={1}
                      max={53}
                      value={item.endWeek || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { endWeek: event.target.value })}
                    />
                  </label>
                </div>

                {fieldEnabled('standards') && (
                  <label>
                    {activeTemplate?.labels?.standards || t('shared.standards')}
                    <textarea
                      value={item.standardsText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { standardsText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('skills') && (
                  <label>
                    {activeTemplate?.labels?.skills || t('shared.skills')}
                    <textarea
                      value={item.skillsText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { skillsText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('learningObjectives') && (
                  <label>
                    {activeTemplate?.labels?.learningObjectives || t('shared.learningObjectives')}
                    <textarea
                      value={item.objectivesText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { objectivesText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('performanceTasks') && (
                  <label>
                    {activeTemplate?.labels?.performanceTask || t('shared.performanceTasks')}
                    <textarea
                      value={item.performanceTasksText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { performanceTasksText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('essentialQuestions') && (
                  <label>
                    {activeTemplate?.labels?.essentialQuestions || t('shared.essentialQuestions')}
                    <textarea
                      value={item.essentialQuestionsText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { essentialQuestionsText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('activitiesResources') && (
                  <label>
                    {activeTemplate?.labels?.activities || t('shared.activitiesResources')}
                    <textarea
                      value={item.activitiesText || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { activitiesText: event.target.value })}
                    />
                  </label>
                )}
                {fieldEnabled('notes') && (
                  <label>
                    {activeTemplate?.labels?.notes || t('shared.notes')}
                    <textarea
                      value={item.notes || ''}
                      onChange={(event) => updateItem(sectionIndex, itemIndex, { notes: event.target.value })}
                    />
                  </label>
                )}
              </div>
            ))}

            <button type="button" onClick={() => addItem(sectionIndex)}>
              {t('editor.addItem', { label: draft?.structure?.itemLabel || t('shared.item') })}
            </button>
          </div>
        ))}
      </div>

      <div className="editor-footer">
        <button type="button" onClick={addSection}>
          {t('editor.addSection', { label: draft?.structure?.sectionLabel || t('shared.section') })}
        </button>
        <div className="editor-footer-actions">
          <button type="button" onClick={onCancel}>{t('shared.cancel')}</button>
          <button type="button" onClick={onSave} disabled={saving}>{saving ? t('shared.saving') : t('editor.saveMap')}</button>
        </div>
      </div>
    </div>
  );
};

export default CurriculumMapEditorPanel;
