export const REPORT_TYPE_OPTIONS = [
  { value: 'weekly', label: 'Weekly Report' },
  { value: 'monthly', label: 'Monthly Report' },
  { value: 'quarterly', label: 'Quarterly Report' },
  { value: 'yearly', label: 'Yearly Report' },
  { value: 'custom', label: 'Custom Date Range' }
];

export const LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English Only' },
  { value: 'arabic', label: 'Arabic Only' },
  { value: 'bilingual', label: 'Bilingual (English & Arabic)' }
];

export const createDefaultFormData = () => ({
  studentId: '',
  reportType: 'monthly',
  language: 'english',
  dateRange: {
    startDate: '',
    endDate: ''
  },
  customPrompt: '',
  sendEmail: true,
  recipients: {
    student: false,
    mother: true,
    father: true,
    teacher: true
  }
});