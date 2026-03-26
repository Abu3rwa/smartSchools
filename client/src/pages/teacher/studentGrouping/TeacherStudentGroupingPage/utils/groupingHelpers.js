export const LEVEL_COLORS = {
    below: 'error',
    approaching: 'warning',
    proficient: 'info',
    advanced: 'success'
};

export const LEVEL_LABELS = {
    below: 'Below Grade Level',
    approaching: 'Approaching',
    proficient: 'Proficient',
    advanced: 'Advanced'
};

export const LEVELS_ORDERED = ['below', 'approaching', 'proficient', 'advanced'];

export const TREND_ICONS = {
    improving: '↑',
    stable: '→',
    declining: '↓'
};

export const TREND_COLORS = {
    improving: 'success.main',
    stable: 'text.secondary',
    declining: 'error.main'
};

export function getLevelColor(level) {
    return LEVEL_COLORS[level] || 'default';
}

export function getLevelLabel(level) {
    return LEVEL_LABELS[level] || level;
}

export function getTrendIcon(trend) {
    return TREND_ICONS[trend] || '→';
}

export function getTrendColor(trend) {
    return TREND_COLORS[trend] || 'text.secondary';
}
