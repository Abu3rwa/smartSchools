import { useState, useEffect, useMemo } from 'react';
import api from '../../../../config/api';
import { RISK_ORDER } from '../constants';

const useInterventionQueueData = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [featureEnabled, setFeatureEnabled] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ status: 'open', riskLevel: '' });

    const loadQueue = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { status: filters.status, limit: 50 };
            if (filters.riskLevel) params.riskLevel = filters.riskLevel;
            const response = await api.get('/interventions/queue', { params });
            setItems(response.data?.data?.items || []);
            setFeatureEnabled(Boolean(response.data?.data?.featureEnabled));
        } catch (err) {
            setItems([]);
            setError(err.response?.data?.message || 'Failed to load intervention queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
    }, [filters.status, filters.riskLevel]);

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const diff = (RISK_ORDER[b.riskLevel] || 0) - (RISK_ORDER[a.riskLevel] || 0);
            if (diff !== 0) return diff;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    }, [items]);

    const runAction = async (caseId, actionType) => {
        setActionLoading(true);
        try {
            if (actionType === 'acknowledge') {
                await api.post(`/interventions/${caseId}/acknowledge`);
            } else if (actionType === 'resolve') {
                const note = window.prompt('Resolution note (optional):', '') || '';
                await api.post(`/interventions/${caseId}/resolve`, { note });
            } else if (actionType === 'dismiss') {
                const note = window.prompt('Dismiss note (optional):', '') || '';
                await api.post(`/interventions/${caseId}/dismiss`, { note });
            }
            await loadQueue();
        } catch (err) {
            setError(err.response?.data?.message || 'Action failed, please try again');
        } finally {
            setActionLoading(false);
        }
    };

    const openCount = sortedItems.filter((item) => ['open', 'acknowledged', 'in_progress'].includes(item.status)).length;
    const highRiskCount = sortedItems.filter((item) => item.riskLevel === 'high').length;

    return {
        loading,
        actionLoading,
        featureEnabled,
        error,
        filters,
        setFilters,
        sortedItems,
        loadQueue,
        runAction,
        stats: {
            openCount,
            highRiskCount
        }
    };
};

export default useInterventionQueueData;
