import StandardsPageHeader from './components/StandardsPageHeader';
import StandardsTabs from './components/StandardsTabs';
import StandardsFiltersBar from './components/StandardsFiltersBar';
import StandardsList from './components/StandardsList';
import StandardModal from './components/StandardModal';
import StandardsImportTab from './components/StandardsImportTab';
import useStandardsPageData from './hooks/useStandardsPageData';
import { STANDARDS_PAGE_TABS } from './constants';
import './StandardsPage.css';

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
            <StandardsPageHeader isAdmin={isAdmin} onAddStandard={handleOpenCreateModal} />

            {isAdmin && <StandardsTabs activeTab={activeTab} onTabChange={setActiveTab} />}

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
