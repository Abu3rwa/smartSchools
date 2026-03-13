const toListText = (value = []) => (Array.isArray(value) ? value.join('\n') : '');
const toArrayFromText = (value = '') => String(value || '')
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const toStandardsText = (standards = []) => (
  Array.isArray(standards)
    ? standards.map((item) => item.code || item.title || item.description || '').filter(Boolean).join('\n')
    : ''
);

const standardsFromText = (value = '') => toArrayFromText(value).map((code) => ({
  standardId: null,
  sourceType: 'custom_entry',
  code,
  title: '',
  description: '',
  framework: '',
}));

const toEditorItem = (item = {}) => ({
  title: item.title || '',
  type: item.type || 'instructional_block',
  startWeek: item.startWeek || '',
  endWeek: item.endWeek || '',
  standardsText: item.standardsText || toStandardsText(item.standards || []),
  skillsText: item.skillsText || toListText(item.skills || []),
  objectivesText: item.objectivesText || toListText(item.learningObjectives || []),
  performanceTasksText: item.performanceTasksText || toListText(item.performanceTasks || []),
  essentialQuestionsText: item.essentialQuestionsText || toListText(item.essentialQuestions || []),
  activitiesText: item.activitiesText || toListText(item.activitiesResources || []),
  notes: item.notes || '',
});

const toEditorSection = (section = {}, index = 0) => ({
  title: section.title || `Section ${index + 1}`,
  sectionType: section.sectionType || 'period',
  items: Array.isArray(section.items) && section.items.length > 0
    ? section.items.map((item) => toEditorItem(item))
    : [toEditorItem()],
});

const toPayloadItem = (item = {}, index = 0) => ({
  title: item.title || `Instructional Block ${index + 1}`,
  type: item.type || 'instructional_block',
  orderIndex: index,
  startWeek: item.startWeek ? Number(item.startWeek) : null,
  endWeek: item.endWeek ? Number(item.endWeek) : item.startWeek ? Number(item.startWeek) : null,
  standards: standardsFromText(item.standardsText),
  skills: toArrayFromText(item.skillsText),
  learningObjectives: toArrayFromText(item.objectivesText),
  performanceTasks: toArrayFromText(item.performanceTasksText),
  essentialQuestions: toArrayFromText(item.essentialQuestionsText),
  activitiesResources: toArrayFromText(item.activitiesText),
  notes: item.notes || '',
});

const createEmptyItem = () => toEditorItem();

const createEmptySection = (label = 'Section', index = 0) => ({
  title: `${label} ${index + 1}`,
  sectionType: 'period',
  items: [createEmptyItem()],
});

export const createEmptyMapDraft = ({ settings = {}, academicYear = '' } = {}) => ({
  academicYear: academicYear || settings?.defaultAcademicYear || '',
  classId: '',
  subjectId: '',
  title: '',
  description: '',
  templateKey: settings?.activeTemplateKey || 'default-flex-template',
  structure: {
    periodType: settings?.mapStructure?.periodType || 'term',
    granularity: settings?.mapStructure?.granularity || 'unit_week',
    sectionLabel: settings?.terminology?.section || 'Unit',
    itemLabel: settings?.terminology?.item || 'Week',
  },
  sections: [createEmptySection(settings?.terminology?.section || 'Section', 0)],
});

export const toEditorDraftFromMap = (map = {}) => ({
  academicYear: map.academicYear || '',
  classId: map.classId?._id || map.classId || '',
  subjectId: map.subject?._id || map.subject || '',
  title: map.title || '',
  description: map.description || '',
  templateKey: map.templateKey || 'default-flex-template',
  structure: {
    periodType: map?.structure?.periodType || 'term',
    granularity: map?.structure?.granularity || 'unit_week',
    sectionLabel: map?.structure?.sectionLabel || 'Unit',
    itemLabel: map?.structure?.itemLabel || 'Week',
  },
  sections: Array.isArray(map.sections) && map.sections.length > 0
    ? map.sections.map((section, index) => toEditorSection(section, index))
    : [toEditorSection({}, 0)],
});

export const toMapPayloadFromDraft = (draft = {}) => ({
  academicYear: draft.academicYear,
  classId: draft.classId,
  subjectId: draft.subjectId,
  title: draft.title,
  description: draft.description,
  templateKey: draft.templateKey,
  structure: {
    periodType: draft?.structure?.periodType || 'term',
    granularity: draft?.structure?.granularity || 'unit_week',
    sectionLabel: draft?.structure?.sectionLabel || 'Unit',
    itemLabel: draft?.structure?.itemLabel || 'Week',
  },
  sections: (draft.sections || []).map((section, index) => ({
    title: section.title || `Section ${index + 1}`,
    sectionType: section.sectionType || 'period',
    orderIndex: index,
    items: (section.items || []).map((item, itemIndex) => toPayloadItem(item, itemIndex)),
  })),
});

export const getStatusClassName = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'published') return 'status-badge status-published';
  if (normalized === 'approved') return 'status-badge status-approved';
  if (normalized === 'rejected') return 'status-badge status-rejected';
  if (normalized === 'revision_requested') return 'status-badge status-revision';
  if (normalized === 'submitted' || normalized === 'in_review') return 'status-badge status-review';
  return 'status-badge status-draft';
};

export const filterMaps = (maps = [], filters = {}) => {
  const searchTerm = String(filters.search || '').trim().toLowerCase();
  return (maps || []).filter((map) => {
    if (filters.status && map.status !== filters.status) return false;
    if (filters.academicYear && map.academicYear !== filters.academicYear) return false;
    if (filters.classId && (map.classId?._id || map.classId) !== filters.classId) return false;
    if (filters.subjectId && (map.subject?._id || map.subject) !== filters.subjectId) return false;
    if (!searchTerm) return true;
    const haystack = [
      map.title,
      map.description,
      map.classId?.name,
      map.subject?.name,
      map.academicYear,
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  });
};

export const buildWorkflowActions = ({ map, canReview, canPublish, canEdit }) => {
  const status = map?.status;
  const actions = [];
  if (canEdit && ['draft', 'revision_requested', 'rejected'].includes(status)) {
    actions.push({ key: 'submit', labelKey: 'workflow.actions.submit' });
  }
  if (canReview && status === 'submitted') {
    actions.push({ key: 'start_review', labelKey: 'workflow.actions.startReview' });
  }
  if (canReview && ['submitted', 'in_review'].includes(status)) {
    actions.push({ key: 'approve', labelKey: 'workflow.actions.approve' });
    actions.push({ key: 'request_revision', labelKey: 'workflow.actions.requestRevision' });
    actions.push({ key: 'reject', labelKey: 'workflow.actions.reject' });
  }
  if (canPublish && ['approved', 'draft', 'submitted', 'in_review'].includes(status)) {
    actions.push({ key: 'publish', labelKey: 'workflow.actions.publish' });
  }
  if (canEdit && ['submitted', 'revision_requested', 'rejected'].includes(status)) {
    actions.push({ key: 'return_to_draft', labelKey: 'workflow.actions.returnToDraft' });
  }
  return actions;
};
