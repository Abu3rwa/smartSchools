import React from 'react';
import useBehaviorManagementData from './hooks/useBehaviorManagementData';
import BehaviorPageHeader from './components/BehaviorPageHeader';
import BehaviorFiltersBar from './components/BehaviorFiltersBar';
import BehaviorIncidentsList from './components/BehaviorIncidentsList';
import BehaviorIncidentModal from './components/BehaviorIncidentModal';
import BehaviorEmptyState from './components/BehaviorEmptyState';
import LoadingState from './components/LoadingState';
import './BehaviorManagementPage.css';

const BehaviorManagementPage = () => {
    const {
        user,
        incidents,
        loading,
        showModal,
        setShowModal,
        selectedIncident,
        viewMode,
        filters,
        setFilters,
        students,
        classes,
        formData,
        setFormData,
        selectedStudentProfile,
        handleStudentChange,
        handleCreateIncident,
        handleViewIncident,
        handleEditIncident,
        handleSubmit,
        handleResolve,
        handleDelete
    } = useBehaviorManagementData();

    return (
        <div className="behavior-management-page">
            <BehaviorPageHeader onCreateIncident={handleCreateIncident} />

            <BehaviorFiltersBar 
                filters={filters} 
                onFilterChange={setFilters} 
            />

            {loading ? (
                <LoadingState />
            ) : incidents.length === 0 ? (
                <BehaviorEmptyState />
            ) : (
                <BehaviorIncidentsList 
                    incidents={incidents}
                    userRole={user?.role}
                    onViewIncident={handleViewIncident}
                    onEditIncident={handleEditIncident}
                    onResolveIncident={handleResolve}
                    onDeleteIncident={handleDelete}
                />
            )}

            <BehaviorIncidentModal 
                show={showModal}
                onClose={() => setShowModal(false)}
                viewMode={viewMode}
                selectedIncident={selectedIncident}
                formData={formData}
                onFormDataChange={setFormData}
                onStudentChange={handleStudentChange}
                onSubmit={handleSubmit}
                students={students}
                classes={classes}
                selectedStudentProfile={selectedStudentProfile}
            />
        </div>
    );
};

export default BehaviorManagementPage;
