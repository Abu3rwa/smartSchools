import React from 'react';
import useInterventionQueueData from './hooks/useInterventionQueueData';
import InterventionQueueHeader from './components/InterventionQueueHeader';
import InterventionQueueStats from './components/InterventionQueueStats';
import InterventionQueueFilters from './components/InterventionQueueFilters';
import InterventionQueueList from './components/InterventionQueueList';
import InterventionQueueEmptyState from './components/InterventionQueueEmptyState';
import InterventionQueueLoadingState from './components/InterventionQueueLoadingState';
import InterventionQueueErrorState from './components/InterventionQueueErrorState';
import './InterventionQueuePage.css';

const InterventionQueuePage = () => {
    const {
        loading,
        actionLoading,
        featureEnabled,
        error,
        filters,
        setFilters,
        sortedItems,
        loadQueue,
        runAction,
        stats
    } = useInterventionQueueData();

    return (
        <div className="intervention-queue-page">
            <InterventionQueueHeader 
                onRefresh={loadQueue} 
                isLoading={loading || actionLoading} 
            />

            {!featureEnabled ? (
                <InterventionQueueEmptyState 
                    message="Intervention queue is currently disabled by feature flag." 
                    icon={null} 
                />
            ) : (
                <>
                    <InterventionQueueStats 
                        openCount={stats.openCount} 
                        highRiskCount={stats.highRiskCount} 
                    />

                    <InterventionQueueFilters 
                        filters={filters} 
                        onFilterChange={setFilters} 
                    />

                    {loading ? (
                        <InterventionQueueLoadingState />
                    ) : error ? (
                        <InterventionQueueErrorState error={error} />
                    ) : (
                        <InterventionQueueList 
                            items={sortedItems} 
                            onAction={runAction} 
                            actionLoading={actionLoading} 
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default InterventionQueuePage;
