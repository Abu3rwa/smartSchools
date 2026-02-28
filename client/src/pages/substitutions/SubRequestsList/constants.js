export const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' }
];

export const DEFAULT_FILTERS = {
  status: '',
  startDate: '',
  endDate: '',
  absentTeacherId: '',
  substituteTeacherId: ''
};