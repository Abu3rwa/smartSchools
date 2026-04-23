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
const AssessmentProgressPage = lazy(() => import('../AssessmentProgressPage/AssessmentProgressPage'));
const AssessmentNarrativePage = lazy(() => import('../AssessmentNarrativePage/AssessmentNarrativePage'));
const AssessmentLiveEditPage = lazy(() => import('../AssessmentLiveEditPage/AssessmentLiveEditPage'));
const AssessmentAuditPage = lazy(() => import('../AssessmentAuditPage/AssessmentAuditPage'));

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
        handleOpenCreateModal,
        handleCloseModal,
        handleEdit,
        handleDelete,
        handleSubmit,
        handleImport,
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
                    />
                </>
            )}

            {activeTab === STANDARDS_PAGE_TABS.import && isAdmin && (
                <StandardsImportTab
                    subjects={subjects}
                    importSubjectId={importSubjectId}
                    onImportSubjectChange={setImportSubjectId}
                    importFileName={importFileName}
                    importText={importText}
                    onImportTextChange={setImportText}
                    loading={loading}
                    onImport={handleImport}
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

            {activeTab === STANDARDS_PAGE_TABS.progress && (
                <Suspense fallback={<TabFallback />}><AssessmentProgressPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.narrative && (
                <Suspense fallback={<TabFallback />}><AssessmentNarrativePage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.liveEdit && (
                <Suspense fallback={<TabFallback />}><AssessmentLiveEditPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.audit && isAdmin && (
                <Suspense fallback={<TabFallback />}><AssessmentAuditPage embedded /></Suspense>
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
