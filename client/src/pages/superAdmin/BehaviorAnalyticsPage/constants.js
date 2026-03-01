export const DEFAULT_PERIOD = 'month';
export const DEFAULT_TAB = 'overview';

export const PERIOD_OPTIONS = [
    { value: 'week', label: 'Last Week' },
    { value: 'month', label: 'Last Month' },
    { value: 'quarter', label: 'Last Quarter' },
    { value: 'year', label: 'Last Year' }
];

export const EVENT_TYPE_OPTIONS = [
    { value: '', label: 'All Events' },
    { value: 'login', label: 'Login' },
    { value: 'grade_created', label: 'Grade Created' },
    { value: 'page_view', label: 'Page View' },
    { value: 'feature_used', label: 'Feature Used' }
];

export const EVENT_TYPE_COLORS = {
    login: 'blue',
    logout: 'gray',
    grade_created: 'green',
    grade_updated: 'yellow',
    grade_deleted: 'red',
    login_failed: 'red',
    permission_denied: 'orange',
    page_view: 'purple',
    feature_used: 'indigo'
};

export const USAGE_FEATURE_ITEMS = [
    { label: 'Grade Management', value: '1,234 uses' },
    { label: 'Student Management', value: '856 uses' },
    { label: 'Report Generation', value: '432 uses' }
];

export const DEVICE_DISTRIBUTION_ITEMS = [
    { label: 'Desktop', value: '65%' },
    { label: 'Mobile', value: '25%' },
    { label: 'Tablet', value: '10%' }
];
