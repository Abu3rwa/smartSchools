import { lazy, Suspense } from 'react';
import StandardsPageHeader from './components/StandardsPageHeader';
import StandardsTabs from './components/StandardsTabs';
import StandardsFiltersBar from './components/StandardsFiltersBar';
import StandardsList from './components/StandardsList';
import StandardModal from './components/StandardModal';
import StandardsImportTab from './components/StandardsImportTab';
import useStandardsPageData from './hooks/useStandardsPageData';
import { STANDARDS_PAGE_TABS } from './constants';
import './StandardsPage.css';

const StandardAssignPage = lazy(() => import('../StandardAssignPage/StandardAssignPage'));
const StandardsGradebookPage = lazy(() => import('../StandardsGradebookPage/StandardsGradebookPage'));
const AssessmentPoolPage = lazy(() => import('../AssessmentPoolPage/AssessmentPoolPage'));
const AssessmentSettingsPage = lazy(() => import('../AssessmentSettingsPage/AssessmentSettingsPage'));

const TabFallback = () => <div className="tab-loading">Loading...</div>;

const StandardsPage = () => {
    const {
        activeTab,
        setActiveTab,
        searchTerm,
        setSearchTerm,
        filterClass,
        setFilterClass,
        filterSubject,
        setFilterSubject,
        filterGrade,
        setFilterGrade,
        showModal,
        editingId,
        submitting,
        importText,
        setImportText,
        importSubjectId,
        setImportSubjectId,
        importDuplicatePolicy,
        setImportDuplicatePolicy,
        importFileName,
        formData,
        setFormData,
        loading,
        importResult,
        templateMeta,
        subjects,
        classes,
        isAdmin,
        filteredStandards,
        selectedStandardIds,
        setSelectedStandardIds,
        bulkDeleting,
        handleOpenCreateModal,
        handleCloseModal,
        handleEdit,
        handleDelete,
        handleBulkDelete,
        handleSubmit,
        handleImport,
        handleCopyAiPrompt,
        handleImportFile,
        handleDownloadTemplate
    } = useStandardsPageData();

    return (
        <div className="standards-page">
            <StandardsPageHeader
                showAddStandard={isAdmin && activeTab === STANDARDS_PAGE_TABS.list}
                onAddStandard={handleOpenCreateModal}
            />

            <StandardsTabs activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

            {activeTab === STANDARDS_PAGE_TABS.list && (
                <>
                    <StandardsFiltersBar
                        searchTerm={searchTerm}
                        onSearchTermChange={setSearchTerm}
                        filterClass={filterClass}
                        onFilterClassChange={setFilterClass}
                        filterSubject={filterSubject}
                        onFilterSubjectChange={setFilterSubject}
                        filterGrade={filterGrade}
                        onFilterGradeChange={setFilterGrade}
                        classes={classes}
                        subjects={subjects}
                    />
                    <StandardsList
                        loading={loading}
                        filteredStandards={filteredStandards}
                        isAdmin={isAdmin}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        selectedStandardIds={selectedStandardIds}
                        onSelectedStandardIdsChange={setSelectedStandardIds}
                        onBulkDelete={handleBulkDelete}
                        bulkDeleting={bulkDeleting}
                    />
                </>
            )}

            {activeTab === STANDARDS_PAGE_TABS.import && isAdmin && (
                <StandardsImportTab
                    subjects={subjects}
                    importSubjectId={importSubjectId}
                    onImportSubjectChange={setImportSubjectId}
                    importDuplicatePolicy={importDuplicatePolicy}
                    onImportDuplicatePolicyChange={setImportDuplicatePolicy}
                    importFileName={importFileName}
                    importText={importText}
                    onImportTextChange={setImportText}
                    loading={loading}
                    onImport={handleImport}
                    onCopyAiPrompt={handleCopyAiPrompt}
                    onImportFile={handleImportFile}
                    importResult={importResult}
                    templateMeta={templateMeta}
                    onDownloadTemplate={handleDownloadTemplate}
                />
            )}

            {activeTab === STANDARDS_PAGE_TABS.assign && (
                <Suspense fallback={<TabFallback />}><StandardAssignPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.gradebook && (
                <Suspense fallback={<TabFallback />}><StandardsGradebookPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.pool && (
                <Suspense fallback={<TabFallback />}><AssessmentPoolPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.settings && isAdmin && (
                <Suspense fallback={<TabFallback />}><AssessmentSettingsPage embedded /></Suspense>
            )}

            <StandardModal
                showModal={showModal}
                editingId={editingId}
                formData={formData}
                onFormDataChange={setFormData}
                subjects={subjects}
                submitting={submitting}
                onSubmit={handleSubmit}
                onClose={handleCloseModal}
            />
        </div>
    );
};

export default StandardsPage;
