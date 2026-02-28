export const REPORT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' }
];

export const DEFAULT_HISTORY_FILTERS = {
  studentId: '',
  reportType: '',
  startDate: '',
  endDate: ''
};