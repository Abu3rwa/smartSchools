import { useSelector } from 'react-redux';
import { REPORT_LANGUAGES, REPORT_TYPES } from './constants';
import TemplatesHeader from './components/TemplatesHeader';
import TemplatesFilters from './components/TemplatesFilters';
import TemplateCard from './components/TemplateCard';
import TemplateModal from './components/TemplateModal';
import useReportTemplates from './hooks/useReportTemplates';
import './ReportTemplates.css';

const ReportTemplates = () => {
  const { token } = useSelector((state) => state.auth);
  const {
    filteredTemplates,
    loading,
    showModal,
    editingTemplate,
    formData,
    filters,
    message,
    saving,
    setFilters,
    handleInputChange,
    handleSave,
    handleDelete,
    openCreate,
    openEdit,
    closeModal
  } = useReportTemplates({ token });

  return (
    <div className="templates-container">
      <TemplatesHeader onCreate={openCreate} />

      {message && (
        <div className={message.type === 'success' ? 'success-toast' : 'error-toast'}>
          {message.text}
        </div>
      )}

      <TemplatesFilters
        filters={filters}
        reportTypes={REPORT_TYPES}
        languages={REPORT_LANGUAGES}
        onTypeChange={(event) =>
          setFilters((prev) => ({ ...prev, type: event.target.value }))
        }
        onLanguageChange={(event) =>
          setFilters((prev) => ({ ...prev, language: event.target.value }))
        }
      />

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading templates...</span>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="empty-state">
          <h3>No templates found</h3>
          <p>Create your first template to get started</p>
        </div>
      ) : (
        <div className="templates-grid">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template._id}
              template={template}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <TemplateModal
        isOpen={showModal}
        editingTemplate={editingTemplate}
        formData={formData}
        reportTypes={REPORT_TYPES}
        languages={REPORT_LANGUAGES}
        onClose={closeModal}
        onInputChange={handleInputChange}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
};

export default ReportTemplates;