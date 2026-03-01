export const formatDuration = (seconds = 0) => {
    const total = Number(seconds) || 0;
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}m ${secs}s`;
};

export const formatRatePercentage = (value) => {
    return `${Number(value || 0).toFixed(2)}%`;
};

export const getBehaviorDashboardErrorMessage = (requestError) => {
    return requestError.response?.data?.message || 'Failed to load behavior dashboard';
};

export const getInsightChipColor = (level) => {
    if (level === 'high') return 'error';
    if (level === 'medium') return 'warning';
    return 'default';
};
