export const DEFAULT_PERIOD = 'month';
export const DEFAULT_TAB = 'overview';

export const PERIOD_OPTIONS = [
    { value: 'week' },
    { value: 'month' },
    { value: 'quarter' },
    { value: 'year' }
];

export const EVENT_TYPE_OPTIONS = [
    { value: '' },
    { value: 'login' },
    { value: 'grade_created' },
    { value: 'page_view' },
    { value: 'feature_used' }
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
    { key: 'gradeManagement', value: '1,234' },
    { key: 'studentManagement', value: '856' },
    { key: 'reportGeneration', value: '432' }
];

export const DEVICE_DISTRIBUTION_ITEMS = [
    { key: 'desktop', value: '65%' },
    { key: 'mobile', value: '25%' },
    { key: 'tablet', value: '10%' }
];
