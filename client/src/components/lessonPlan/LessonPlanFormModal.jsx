/**
 * Shared create/edit lesson plan modal.
 * Used by both Admin and Teacher lesson plan pages.
 */
import { HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineCloudUpload } from 'react-icons/hi';
import AISuggestButton from './AISuggestButton.jsx';
import StandardsSuggester from './StandardsSuggester.jsx';
import { buildLessonPayload } from './lessonPlanConstants.js';
import { AI_LANGUAGE_OPTIONS } from '../../constants/aiLanguages';
import { useTranslation } from 'react-i18next';

const LessonPlanFormModal = ({
  open,
  onClose,
  editingId,
  formData,
  setFormData,
  classes,
  subjects,
  onSubmit,
  onGenerateSection,
  generatingSection,
  generatedStandards = [],
}) => {
  const { t } = useTranslation(['lessonPlan']);
  if (!open) return null;

  const handleStageChange = (index, field, value) => {
    const next = formData.stages.map((s, i) =>
      i === index ? { ...s, [field]: value } : s
    );
    setFormData({ ...formData, stages: next });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(buildLessonPayload(formData));
  };

  const getExtractionStatus = () => {
    if (formData.materialFile) {
      return {
        label: t('lessonPlan:teacherForm.aiContext.statusPending'),
        icon: <HiOutlineCloudUpload size={16} />,
        className: 'status-pending'
      };
    }
    if (formData.extractedMaterialText) {
      return {
        label: t('lessonPlan:teacherForm.aiContext.statusExtracted'),
        icon: <HiOutlineCheckCircle size={16} color="#10b981" />,
        className: 'status-success'
      };
    }
    return {
      label: t('lessonPlan:teacherForm.aiContext.statusNone'),
      icon: <HiOutlineDocumentText size={16} color="#94a3b8" />,
      className: 'status-none'
    };
  };

  const extractionStatus = getExtractionStatus();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg lesson-plan-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            {editingId
              ? t('lessonPlan:teacherForm.title.edit')
              : t('lessonPlan:teacherForm.title.create')}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body lesson-plan-form">
            <div className="form-row">
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.fields.date')} *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.fields.class')} *</label>
                <select
                  value={formData.classId}
                  onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                  required
                >
                  <option value="">{t('lessonPlan:teacherForm.select.selectClass')}</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.fields.subject')} *</label>
                <select
                  value={formData.subjectId}
                  onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                  required
                >
                  <option value="">{t('lessonPlan:teacherForm.select.selectSubject')}</option>
                  {subjects.map((sub) => (
                    <option key={sub._id} value={sub._id}>{sub.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="ai-context-section" style={{ padding: '16px', background: '#f5f7fb', borderRadius: '8px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#1e293b' }}>{t('lessonPlan:teacherForm.aiContext.title')}</h4>
                  <p style={{ margin: '0', fontSize: '12px', color: '#64748b' }}>{t('lessonPlan:teacherForm.aiContext.description')}</p>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '4px 10px', 
                  borderRadius: '20px', 
                  fontSize: '11px', 
                  fontWeight: '500',
                  background: formData.extractedMaterialText ? '#ecfdf5' : '#f1f5f9',
                  color: formData.extractedMaterialText ? '#059669' : '#64748b',
                  border: formData.extractedMaterialText ? '1px solid #10b981' : '1px solid #e2e8f0'
                }}>
                  {extractionStatus.icon}
                  {extractionStatus.label}
                </div>
              </div>
              
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.aiContext.extraNotes')}</label>
                <textarea
                  rows={2}
                  value={formData.contextText || ''}
                  onChange={(e) => setFormData({ ...formData, contextText: e.target.value })}
                  placeholder={t('lessonPlan:teacherForm.aiContext.extraNotesPlaceholder')}
                />
              </div>
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.aiContext.uploadPdf')}</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFormData({ ...formData, materialFile: e.target.files[0] });
                    } else {
                      setFormData({ ...formData, materialFile: null });
                    }
                  }}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.fields.primaryAiLanguage')}</label>
                <select
                  value={formData.aiPrimaryLanguage || 'en'}
                  onChange={(e) => {
                    const nextPrimary = e.target.value || 'en';
                    const shouldResetSecondary = nextPrimary === (formData.aiSecondaryLanguage || '');
                    setFormData({
                      ...formData,
                      aiPrimaryLanguage: nextPrimary,
                      aiSecondaryLanguage: shouldResetSecondary ? '' : (formData.aiSecondaryLanguage || ''),
                    });
                  }}
                >
                  {AI_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('lessonPlan:teacherForm.fields.secondaryAiLanguageOptional')}</label>
                <select
                  value={formData.aiSecondaryLanguage || ''}
                  onChange={(e) => setFormData({ ...formData, aiSecondaryLanguage: e.target.value || '' })}
                >
                  <option value="">{t('lessonPlan:teacherForm.select.none')}</option>
                  {AI_LANGUAGE_OPTIONS
                    .filter((option) => option.value !== (formData.aiPrimaryLanguage || 'en'))
                    .map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="form-group form-group-with-suggest">
              <div>
                <label>{t('lessonPlan:teacherForm.fields.title')} *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('lessonPlan:teacherForm.placeholders.title')}
                  required
                />
              </div>
              <AISuggestButton
                field="title"
                currentValue={formData.title}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) => setFormData({ ...formData, title: s })}
              />
            </div>

            <button
              type="button"
              className="btn btn-secondary generate-from-title-btn"
              onClick={() => onGenerateSection(formData)}
              disabled={
                generatingSection ||
                !formData.classId ||
                !formData.subjectId ||
                !formData.title?.trim()
              }
            >
              {generatingSection ? (
                <>
                  <span className="spinner-small" />
                  {t('lessonPlan:teacherForm.actions.generating')}
                </>
              ) : (
                <>{t('lessonPlan:teacherForm.actions.generateFromTitle')}</>
              )}
            </button>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.summary')}</label>
              <textarea
                rows={4}
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder={t('lessonPlan:teacherForm.placeholders.summary')}
              />
              <AISuggestButton
                field="summary"
                currentValue={formData.summary}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) => setFormData({ ...formData, summary: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.description')}</label>
              <textarea
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('lessonPlan:teacherForm.placeholders.description')}
              />
              <AISuggestButton
                field="description"
                currentValue={formData.description}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                summary={formData.summary}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) => setFormData({ ...formData, description: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.homework')}</label>
              <textarea
                rows={4}
                value={formData.homework}
                onChange={(e) => setFormData({ ...formData, homework: e.target.value })}
                placeholder={t('lessonPlan:teacherForm.placeholders.homework')}
              />
              <AISuggestButton
                field="homework"
                currentValue={formData.homework}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                summary={formData.summary}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) => setFormData({ ...formData, homework: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.previousKnowledge')}</label>
              <textarea
                rows={4}
                value={formData.previousKnowledge}
                onChange={(e) =>
                  setFormData({ ...formData, previousKnowledge: e.target.value })
                }
              />
              <AISuggestButton
                field="previousKnowledge"
                currentValue={formData.previousKnowledge}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) =>
                  setFormData({ ...formData, previousKnowledge: s })
                }
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.teachingObjectives')}</label>
              <textarea
                rows={4}
                value={formData.teachingObjectives}
                onChange={(e) =>
                  setFormData({ ...formData, teachingObjectives: e.target.value })
                }
              />
              <AISuggestButton
                field="teachingObjectives"
                currentValue={formData.teachingObjectives}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                summary={formData.summary}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) =>
                  setFormData({ ...formData, teachingObjectives: s })
                }
              />
            </div>

            <StandardsSuggester
              subjectId={formData.subjectId}
              classId={formData.classId}
              aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
              aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
              lessonText={`${formData.title || ''}\n${formData.summary || ''}\n${formData.description || ''}\n${formData.teachingObjectives || ''}`}
              selectedStandardIds={formData.standardIds}
              contextText={formData.contextText}
              lessonPlanId={editingId}
              onSelectionChange={(ids) => setFormData({ ...formData, standardIds: ids })}
              initialSuggestions={generatedStandards}
            />

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.vocabulary')}</label>
              <input
                type="text"
                value={formData.vocabulary}
                onChange={(e) => setFormData({ ...formData, vocabulary: e.target.value })}
                placeholder={t('lessonPlan:teacherForm.placeholders.vocabulary')}
              />
              <AISuggestButton
                field="vocabulary"
                currentValue={formData.vocabulary}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) => setFormData({ ...formData, vocabulary: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.characterTraitLinks')}</label>
              <input
                type="text"
                value={formData.characterTraitLinks}
                onChange={(e) =>
                  setFormData({ ...formData, characterTraitLinks: e.target.value })
                }
              />
              <AISuggestButton
                field="characterTraitLinks"
                currentValue={formData.characterTraitLinks}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) =>
                  setFormData({ ...formData, characterTraitLinks: s })
                }
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>{t('lessonPlan:teacherForm.fields.techIntegration')}</label>
              <input
                type="text"
                value={formData.techIntegration}
                onChange={(e) =>
                  setFormData({ ...formData, techIntegration: e.target.value })
                }
              />
              <AISuggestButton
                field="techIntegration"
                currentValue={formData.techIntegration}
                subjectId={formData.subjectId}
                classId={formData.classId}
                aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                title={formData.title}
                contextText={formData.contextText}
                lessonPlanId={editingId}
                onSuggestion={(s) =>
                  setFormData({ ...formData, techIntegration: s })
                }
              />
            </div>

            <div className="stages-section">
              <h4>{t('lessonPlan:teacherForm.stages.title')}</h4>
              {formData.stages.map((stage, index) => (
                <div key={index} className="stage-block">
                  <div className="stage-name">
                    {stage.name || t('lessonPlan:teacherForm.stages.stageNumber', { number: index + 1 })}
                  </div>
                  <div className="form-group form-group-with-suggest">
                    <div>
                      <label>{t('lessonPlan:teacherForm.stages.procedure')}</label>
                      <textarea
                        rows={4}
                        value={stage.procedure}
                        onChange={(e) =>
                          handleStageChange(index, 'procedure', e.target.value)
                        }
                      />
                    </div>
                    <AISuggestButton
                      field="stageProcedure"
                      stageProcedure={stage.procedure}
                      stageIndex={index}
                      subjectId={formData.subjectId}
                      classId={formData.classId}
                      aiPrimaryLanguage={formData.aiPrimaryLanguage || 'en'}
                      aiSecondaryLanguage={formData.aiSecondaryLanguage || ''}
                      title={formData.title}
                      summary={formData.summary}
                      contextText={formData.contextText}
                      lessonPlanId={editingId}
                      onSuggestion={(s) => handleStageChange(index, 'procedure', s)}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('lessonPlan:teacherForm.stages.materials')}</label>
                    <input
                      type="text"
                      value={stage.materials}
                      onChange={(e) =>
                        handleStageChange(index, 'materials', e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('lessonPlan:teacherForm.stages.timing')}</label>
                    <input
                      type="text"
                      value={stage.timing}
                      onChange={(e) =>
                        handleStageChange(index, 'timing', e.target.value)
                      }
                      placeholder={t('lessonPlan:teacherForm.stages.timingPlaceholder')}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('lessonPlan:teacherForm.actions.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {editingId
                ? t('lessonPlan:teacherForm.actions.update')
                : t('lessonPlan:teacherForm.actions.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LessonPlanFormModal;
