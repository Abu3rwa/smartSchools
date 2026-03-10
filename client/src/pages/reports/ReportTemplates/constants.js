import { AI_LANGUAGE_OPTIONS } from '../../../constants/aiLanguages';

export const REPORT_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' }
];

export const REPORT_LANGUAGES = AI_LANGUAGE_OPTIONS;

export const DEFAULT_FILTERS = { type: '', language: '' };

export const createEmptyTemplateForm = () => ({
  name: '',
  type: 'monthly',
  language: 'en',
  customPrompt: '',
  variables: []
});
