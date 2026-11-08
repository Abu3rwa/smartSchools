import { AI_LANGUAGE_OPTIONS } from '../../../constants/aiLanguages.js';

export const REPORT_TYPE_OPTIONS = [
  { value: 'weekly', label: 'Weekly Report' },
  { value: 'monthly', label: 'Monthly Report' },
  { value: 'quarterly', label: 'Quarterly Report' },
  { value: 'yearly', label: 'Yearly Report' },
  { value: 'custom', label: 'Custom Date Range' }
];

export const LANGUAGE_OPTIONS = AI_LANGUAGE_OPTIONS;

export const SOURCES = [
  { key: 'grades', label: 'Academic Grades', labelAr: 'الدرجات الأكاديمية', default: true },
  { key: 'spelling', label: 'Spelling Practice', labelAr: 'تدريب الإملاء', default: true },
  { key: 'liveLessons', label: 'Live Lessons', labelAr: 'الدروس المباشرة', default: false },
  { key: 'standards', label: 'Standards Mastery', labelAr: 'إتقان المعايير', default: false },
  { key: 'attendance', label: 'Attendance', labelAr: 'الحضور', default: true },
  { key: 'homework', label: 'Homework', labelAr: 'الواجبات المنزلية', default: true },
  { key: 'behavior', label: 'Behavior', labelAr: 'السلوك', default: false }
];

export const SECTIONS = [
  { key: 'overview', label: 'Overview', labelAr: 'نظرة عامة', defaultMaxWords: 150 },
  { key: 'academic', label: 'Academic Progress', labelAr: 'التقدم الأكاديمي', defaultMaxWords: 200 },
  { key: 'spelling', label: 'Spelling', labelAr: 'الإملاء', defaultMaxWords: 150 },
  { key: 'participation', label: 'Participation', labelAr: 'المشاركة', defaultMaxWords: 150 },
  { key: 'behavior', label: 'Behavior', labelAr: 'السلوك', defaultMaxWords: 150 },
  { key: 'nextSteps', label: 'Next Steps', labelAr: 'الخطوات التالية', defaultMaxWords: 200 }
];

export const DRAFT_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  SENDING: 'sending',
  SENT: 'sent',
  PARTIAL: 'partial',
  UNKNOWN: 'unknown',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export const createDefaultFormData = () => ({
  classId: '',
  studentId: '',
  subjectId: '',
  reportType: 'monthly',
  primaryLanguage: 'en',
  secondaryLanguage: '',
  dateRange: {
    startDate: '',
    endDate: ''
  },
  customPrompt: '',
  teacherRemark: '',
  sources: SOURCES.filter(s => s.default).map(s => s.key),
  sections: SECTIONS.map(s => ({
    key: s.key,
    enabled: true,
    maxWords: s.defaultMaxWords
  })),
  profileId: '',
  recipients: {
    student: true,
    mother: true,
    father: true,
    guardian: true,
    teacher: false
  }
});
