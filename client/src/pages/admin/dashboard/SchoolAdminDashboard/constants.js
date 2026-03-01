/**
 * Shared layout and chart style constants for School Admin Dashboard.
 * CSS class names are kept compatible with SchoolAdminDashboard.css.
 */

export const CARD_SX = {
    background: 'var(--card, white)',
    borderRadius: '12px',
    p: '1.5rem',
    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1))',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-color, rgba(0, 0, 0, 0.05))',
};

export const CARD_HEADER_SX = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    mb: '1.5rem',
};

export const CARD_TITLE_SX = {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: 'var(--text-primary, #1e293b)',
};

export const CHART_STYLES = {
    grid: 'var(--border-color, rgba(0, 0, 0, 0.08))',
    axis: 'var(--text-secondary, #64748b)',
    tooltipBg: 'var(--bg-card, #ffffff)',
    tooltipBorder: 'var(--border-color, rgba(0, 0, 0, 0.1))',
    tooltipText: 'var(--text-primary, #1e293b)',
};

export const QUICK_ACTIONS = [
    { label: 'View Classes', path: '/portal/classes' },
    { label: 'View Attendance', path: '/portal/attendance/admin' },
    { label: 'View Students', path: '/portal/students' },
    { label: 'View Analytics', path: '/portal/students' },
];
