export const REPORT_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' }
];

export const REPORT_LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'bilingual', label: 'Bilingual' }
];

export const DEFAULT_FILTERS = { type: '', language: '' };

export const createEmptyTemplateForm = () => ({
  name: '',
  type: 'monthly',
  language: 'english',
  customPrompt: '',
  variables: []
});