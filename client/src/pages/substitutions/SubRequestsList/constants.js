export const STATUS_OPTIONS = [
  { value: '', labelKey: 'filters.status.all' },
  { value: 'SUBMITTED', labelKey: 'status.submitted' },
  { value: 'CONFIRMED', labelKey: 'status.confirmed' },
  { value: 'DECLINED', labelKey: 'status.declined' },
  { value: 'CANCELLED', labelKey: 'status.cancelled' },
  { value: 'EXPIRED', labelKey: 'status.expired' }
];

export const DEFAULT_FILTERS = {
  status: '',
  startDate: '',
  endDate: '',
  absentTeacherId: '',
  substituteTeacherId: ''
};
