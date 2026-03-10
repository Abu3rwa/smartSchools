import React from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation(['interventions']);
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
                    message={t('interventions:page.disabled')} 
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
