import { format } from 'date-fns';

export const DEFAULT_STAGES = [
  { name: 'Warm Up', procedure: '', materials: '', timing: '' },
  { name: 'Presentation of Content', procedure: '', materials: '', timing: '' },
  { name: 'Guided Practice', procedure: '', materials: '', timing: '' },
  { name: 'Individual Practice', procedure: '', materials: '', timing: '' },
  { name: 'Homework/Take Home Material', procedure: '', materials: '', timing: '' },
];

export const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  needs_revision: 'Needs revision',
  rejected: 'Rejected',
};

export const getStatusLabel = (status = 'draft') =>
  STATUS_LABELS[status] || 'Draft';

export function getInitialFormData() {
  return {
    date: format(new Date(), 'yyyy-MM-dd'),
    classId: '',
    subjectId: '',
    title: '',
    summary: '',
    description: '',
    homework: '',
    previousKnowledge: '',
    teachingObjectives: '',
    vocabulary: '',
    characterTraitLinks: '',
    techIntegration: '',
    aiPrimaryLanguage: 'en',
    aiSecondaryLanguage: '',
    standardIds: [],
    stages: DEFAULT_STAGES.map((s) => ({ ...s })),
    contextText: '',
    materialFile: null,
  };
}

export function lessonToFormData(lesson) {
  const d = lesson.date ? new Date(lesson.date) : new Date();
  const stdIds = Array.isArray(lesson.standardIds)
    ? lesson.standardIds.map((s) => s._id || s)
    : [];
  return {
    date: format(d, 'yyyy-MM-dd'),
    classId: lesson.class?._id || lesson.class || '',
    subjectId: lesson.subject?._id || lesson.subject || '',
    title: lesson.title || '',
    summary: lesson.summary || '',
    description: lesson.description || '',
    homework: lesson.homework || '',
    previousKnowledge: lesson.previousKnowledge || '',
    teachingObjectives: lesson.teachingObjectives || '',
    vocabulary: lesson.vocabulary || '',
    characterTraitLinks: lesson.characterTraitLinks || '',
    techIntegration: lesson.techIntegration || '',
    aiPrimaryLanguage: 'en',
    aiSecondaryLanguage: '',
    standardIds: stdIds,
    stages:
      Array.isArray(lesson.stages) && lesson.stages.length
        ? lesson.stages.map((s) => ({
            name: s.name ?? '',
            procedure: s.procedure ?? '',
            materials: s.materials ?? '',
            timing: s.timing ?? '',
          }))
        : DEFAULT_STAGES.map((s) => ({ ...s })),
    contextText: lesson.contextText || '',
    extractedMaterialText: lesson.extractedMaterialText || '',
    materialFile: null,
  };
}

export function buildLessonPayload(formData) {
  const rawIds = formData.standardIds || [];
  const standardIds = rawIds.filter((id) => {
    const s = String(id);
    return /^[a-fA-F0-9]{24}$/.test(s);
  });
  
  const payload = {
    class: formData.classId,
    subject: formData.subjectId,
    date: formData.date,
    title: (formData.title || '').trim(),
    summary: formData.summary,
    description: formData.description,
    homework: formData.homework,
    previousKnowledge: formData.previousKnowledge,
    teachingObjectives: formData.teachingObjectives,
    vocabulary: formData.vocabulary,
    characterTraitLinks: formData.characterTraitLinks,
    techIntegration: formData.techIntegration,
    contextText: formData.contextText || '',
    standardIds,
    stages: formData.stages,
  };

  if (formData.materialFile) {
    const data = new FormData();
    Object.keys(payload).forEach(key => {
      if (Array.isArray(payload[key]) || typeof payload[key] === 'object') {
        data.append(key, JSON.stringify(payload[key]));
      } else {
        data.append(key, payload[key] == null ? '' : payload[key]);
      }
    });
    data.append('materialFile', formData.materialFile);
    return data;
  }

  return payload;
}
