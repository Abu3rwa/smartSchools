import { lazy, Suspense, useCallback, useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import StandardsPageHeader from './components/StandardsPageHeader';
import StandardsTabs from './components/StandardsTabs';
import StandardsFiltersBar from './components/StandardsFiltersBar';
import StandardsList from './components/StandardsList';
import LoadingState from './components/LoadingState';
import StandardModal from './components/StandardModal';
import StandardsImportTab from './components/StandardsImportTab';
import useStandardsPageData from './hooks/useStandardsPageData';
import { STANDARDS_PAGE_TABS } from './constants';
import '../standardsWorkspace.css';
import './StandardsPage.css';

const StandardAssignPage = lazy(() => import('../StandardAssignPage/StandardAssignPage'));
const StandardsGradebookPage = lazy(() => import('../StandardsGradebookPage/StandardsGradebookPage'));
const AssessmentPoolPage = lazy(() => import('../AssessmentPoolPage/AssessmentPoolPage'));
const AssessmentSettingsPage = lazy(() => import('../AssessmentSettingsPage/AssessmentSettingsPage'));

const StandardsPage = () => {
    const { t } = useTranslation(['standards', 'standardAssign', 'standardsGradebook']);
    const [tabAction, setTabAction] = useState(null);
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
        totalStandards,
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

    const hasActiveFilters = Boolean(searchTerm || filterClass || filterSubject || filterGrade);

    const tabSubtitles = {
        [STANDARDS_PAGE_TABS.list]: t('standards:header.subtitle'),
        [STANDARDS_PAGE_TABS.import]: t('standards:header.subtitles.import'),
        [STANDARDS_PAGE_TABS.assign]: t('standardAssign:header.subtitle'),
        [STANDARDS_PAGE_TABS.gradebook]: t('standardsGradebook:header.subtitle'),
        [STANDARDS_PAGE_TABS.pool]: t('standards:header.subtitles.pool'),
        [STANDARDS_PAGE_TABS.settings]: t('standards:header.subtitles.settings')
    };

    const registerHeaderAction = useCallback((action) => setTabAction(action), []);

    const handleTabChange = (tab) => {
        setTabAction(null);
        setActiveTab(tab);
    };

    const primaryAction = activeTab === STANDARDS_PAGE_TABS.list
        ? (isAdmin ? { label: t('standards:header.add'), onClick: handleOpenCreateModal } : null)
        : tabAction;

    const handleClearFilters = () => {
        setSearchTerm('');
        setFilterClass('');
        setFilterSubject('');
        setFilterGrade('');
    };

    return (
        <div className="standards-page">
            <StandardsPageHeader
                title={t('standards:header.title')}
                subtitle={tabSubtitles[activeTab]}
                action={primaryAction ? (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={primaryAction.onClick}
                        disabled={Boolean(primaryAction.disabled)}
                    >
                        <HiOutlinePlus size={18} aria-hidden="true" />
                        {primaryAction.label}
                    </button>
                ) : null}
            >
                <StandardsTabs activeTab={activeTab} onTabChange={handleTabChange} isAdmin={isAdmin} />
            </StandardsPageHeader>

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
                        hasActiveFilters={hasActiveFilters}
                        onClearFilters={handleClearFilters}
                        shownCount={filteredStandards.length}
                        totalCount={totalStandards}
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
                        hasActiveFilters={hasActiveFilters}
                        onClearFilters={handleClearFilters}
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
                <Suspense fallback={<LoadingState />}>
                    <StandardAssignPage embedded registerHeaderAction={registerHeaderAction} />
                </Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.gradebook && (
                <Suspense fallback={<LoadingState />}>
                    <StandardsGradebookPage embedded registerHeaderAction={registerHeaderAction} />
                </Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.pool && (
                <Suspense fallback={<LoadingState />}><AssessmentPoolPage embedded /></Suspense>
            )}

            {activeTab === STANDARDS_PAGE_TABS.settings && isAdmin && (
                <Suspense fallback={<LoadingState />}><AssessmentSettingsPage embedded /></Suspense>
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
