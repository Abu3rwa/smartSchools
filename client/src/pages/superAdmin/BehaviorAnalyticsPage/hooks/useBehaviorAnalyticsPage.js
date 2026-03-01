import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PERIOD, DEFAULT_TAB } from '../constants';

const getAuthHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
});

const useBehaviorAnalyticsPage = () => {
    const [analyticsData, setAnalyticsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState(DEFAULT_PERIOD);
    const [selectedSchool, setSelectedSchool] = useState('');
    const [selectedEventType, setSelectedEventType] = useState('');
    const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
    const [showFilters, setShowFilters] = useState(false);

    const buildParams = useCallback((format) => {
        return new URLSearchParams({
            ...(format ? { format } : {}),
            period: selectedPeriod,
            ...(selectedSchool && { school: selectedSchool }),
            ...(selectedEventType && { eventType: selectedEventType })
        });
    }, [selectedEventType, selectedPeriod, selectedSchool]);

    const fetchAnalytics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = buildParams();
            const response = await fetch(`/api/behavior/analytics?${params}`, {
                headers: getAuthHeader()
            });

            if (!response.ok) {
                throw new Error('Failed to fetch analytics data');
            }

            const data = await response.json();
            setAnalyticsData(data.data);
        } catch (err) {
            setError(err.message || 'Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    const handleExport = useCallback(async (format = 'json') => {
        try {
            const params = buildParams(format);
            const response = await fetch(`/api/behavior/export?${params}`, {
                headers: getAuthHeader()
            });

            if (format === 'csv') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `behavior_data_${selectedPeriod}.csv`;
                anchor.click();
                window.URL.revokeObjectURL(url);
                return;
            }

            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `behavior_data_${selectedPeriod}.json`;
            anchor.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
        }
    }, [buildParams, selectedPeriod]);

    return {
        analyticsData,
        loading,
        error,
        selectedPeriod,
        setSelectedPeriod,
        selectedSchool,
        setSelectedSchool,
        selectedEventType,
        setSelectedEventType,
        activeTab,
        setActiveTab,
        showFilters,
        setShowFilters,
        fetchAnalytics,
        handleExport
    };
};

export default useBehaviorAnalyticsPage;
