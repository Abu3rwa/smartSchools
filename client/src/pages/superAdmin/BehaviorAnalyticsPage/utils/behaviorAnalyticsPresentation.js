import { EVENT_TYPE_COLORS } from '../constants';

export const formatNumber = (num) => {
    const value = Number(num || 0);
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
};

export const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
};

export const getEventTypeColor = (eventType) => {
    return EVENT_TYPE_COLORS[eventType] || 'gray';
};

export const getRiskColor = (riskScore) => {
    if (riskScore >= 3) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
};

export const getMaxEventCount = (distribution = []) => {
    if (!distribution.length) return 1;
    return Math.max(...distribution.map((item) => item.count || 0), 1);
};

export const getMaxDailyEvents = (trends = []) => {
    if (!trends.length) return 1;
    return Math.max(...trends.map((item) => item.totalEvents || 0), 1);
};

export const getTotalEvents = (eventStats = []) => {
    return eventStats.reduce((sum, stat) => sum + (stat.totalCount || 0), 0);
};
