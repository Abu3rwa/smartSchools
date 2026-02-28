/**
 * Shared create/edit lesson plan modal.
 * Used by both Admin and Teacher lesson plan pages.
 */
import AISuggestButton from './AISuggestButton.jsx';
import StandardsSuggester from './StandardsSuggester.jsx';
import { buildLessonPayload } from './lessonPlanConstants.js';

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-lg lesson-plan-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{editingId ? 'Edit Lesson Plan' : 'Create Lesson Plan'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body lesson-plan-form">
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Class *</label>
                <select
                  value={formData.classId}
                  onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                  required
                >
                  <option value="">Select Class</option>
                  {classes.map((cls) => (
                    <option key={cls._id} value={cls._id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Subject *</label>
                <select
                  value={formData.subjectId}
                  onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                  required
                >
                  <option value="">Select Subject</option>
                  {subjects.map((sub) => (
                    <option key={sub._id} value={sub._id}>{sub.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group form-group-with-suggest">
              <div>
                <label>Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Introduction to Fractions"
                  required
                />
              </div>
              <AISuggestButton
                field="title"
                currentValue={formData.title}
                subjectId={formData.subjectId}
                classId={formData.classId}
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
                  Generating…
                </>
              ) : (
                <>✨ Generate from title</>
              )}
            </button>

            <div className="form-group form-group-with-suggest">
              <label>Summary</label>
              <textarea
                rows={4}
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                placeholder="Brief summary"
              />
              <AISuggestButton
                field="summary"
                currentValue={formData.summary}
                subjectId={formData.subjectId}
                classId={formData.classId}
                title={formData.title}
                onSuggestion={(s) => setFormData({ ...formData, summary: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Description</label>
              <textarea
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What will be covered in this lesson?"
              />
              <AISuggestButton
                field="description"
                currentValue={formData.description}
                subjectId={formData.subjectId}
                classId={formData.classId}
                title={formData.title}
                summary={formData.summary}
                onSuggestion={(s) => setFormData({ ...formData, description: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Homework</label>
              <textarea
                rows={4}
                value={formData.homework}
                onChange={(e) => setFormData({ ...formData, homework: e.target.value })}
                placeholder="Homework / take-home material"
              />
              <AISuggestButton
                field="homework"
                currentValue={formData.homework}
                subjectId={formData.subjectId}
                classId={formData.classId}
                title={formData.title}
                summary={formData.summary}
                onSuggestion={(s) => setFormData({ ...formData, homework: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Previous Knowledge / Skills</label>
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
                title={formData.title}
                onSuggestion={(s) =>
                  setFormData({ ...formData, previousKnowledge: s })
                }
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Teaching Objectives (Standards)</label>
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
                title={formData.title}
                summary={formData.summary}
                onSuggestion={(s) =>
                  setFormData({ ...formData, teachingObjectives: s })
                }
              />
            </div>

            <StandardsSuggester
              subjectId={formData.subjectId}
              classId={formData.classId}
              lessonText={`${formData.title || ''}\n${formData.summary || ''}\n${formData.description || ''}\n${formData.teachingObjectives || ''}`}
              selectedStandardIds={formData.standardIds}
              onSelectionChange={(ids) => setFormData({ ...formData, standardIds: ids })}
              initialSuggestions={generatedStandards}
            />

            <div className="form-group form-group-with-suggest">
              <label>Vocabulary</label>
              <input
                type="text"
                value={formData.vocabulary}
                onChange={(e) => setFormData({ ...formData, vocabulary: e.target.value })}
                placeholder="Key vocabulary"
              />
              <AISuggestButton
                field="vocabulary"
                currentValue={formData.vocabulary}
                subjectId={formData.subjectId}
                classId={formData.classId}
                title={formData.title}
                onSuggestion={(s) => setFormData({ ...formData, vocabulary: s })}
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Links with Character Trait / Cognitive Skills</label>
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
                title={formData.title}
                onSuggestion={(s) =>
                  setFormData({ ...formData, characterTraitLinks: s })
                }
              />
            </div>

            <div className="form-group form-group-with-suggest">
              <label>Tech Integration (if applicable)</label>
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
                title={formData.title}
                onSuggestion={(s) =>
                  setFormData({ ...formData, techIntegration: s })
                }
              />
            </div>

            <div className="stages-section">
              <h4>Stages – Procedure, Materials/Resources, Timing</h4>
              {formData.stages.map((stage, index) => (
                <div key={index} className="stage-block">
                  <div className="stage-name">
                    {stage.name || `Stage ${index + 1}`}
                  </div>
                  <div className="form-group form-group-with-suggest">
                    <div>
                      <label>Procedure</label>
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
                      title={formData.title}
                      summary={formData.summary}
                      onSuggestion={(s) => handleStageChange(index, 'procedure', s)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Materials / Resources</label>
                    <input
                      type="text"
                      value={stage.materials}
                      onChange={(e) =>
                        handleStageChange(index, 'materials', e.target.value)
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Timing</label>
                    <input
                      type="text"
                      value={stage.timing}
                      onChange={(e) =>
                        handleStageChange(index, 'timing', e.target.value)
                      }
                      placeholder="e.g. 10 min"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update Lesson Plan' : 'Save Lesson Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LessonPlanFormModal;
