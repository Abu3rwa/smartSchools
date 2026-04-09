import { AI_LANGUAGE_OPTIONS } from '../../../constants/aiLanguages';

export const REPORT_TYPE_OPTIONS = [
  { value: 'weekly', label: 'Weekly Report' },
  { value: 'monthly', label: 'Monthly Report' },
  { value: 'quarterly', label: 'Quarterly Report' },
  { value: 'yearly', label: 'Yearly Report' },
  { value: 'custom', label: 'Custom Date Range' }
];

export const LANGUAGE_OPTIONS = AI_LANGUAGE_OPTIONS;

export const createDefaultFormData = () => ({
  classId: '',
  studentId: '',
  reportType: 'monthly',
  primaryLanguage: 'en',
  secondaryLanguage: '',
  dateRange: {
    startDate: '',
    endDate: ''
  },
  customPrompt: '',
  sendEmail: true,
  recipients: {
    student: true,
    mother: true,
    father: true,
    guardian: true,
    teacher: false
  }
});
