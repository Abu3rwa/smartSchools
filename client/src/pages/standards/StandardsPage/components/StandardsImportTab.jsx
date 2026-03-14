import { IMPORT_TEXT_PLACEHOLDER } from '../constants';
import { useTranslation } from 'react-i18next';
import ErrorState from './ErrorState';

const StandardsImportTab = ({
    subjects,
    importSubjectId,
    onImportSubjectChange,
    importFileName,
    importText,
    onImportTextChange,
    loading,
    onImport,
    onImportFile,
    importResult,
    templateMeta,
    onDownloadTemplate
}) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="import-section">
            <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                <label>{t('standards:import.subjectForImport')}</label>
                <select
                    value={importSubjectId}
                    onChange={(event) => onImportSubjectChange(event.target.value)}
                    style={{ maxWidth: 300 }}
                >
                    <option value="">{t('standards:form.selectSubject')}</option>
                    {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                            {subject.name} ({subject.code})
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                <label>{t('standards:import.uploadFile')}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={onDownloadTemplate}>
                        Download Sample CSV
                    </button>
                    <span className="import-help" style={{ margin: 0 }}>
                        {templateMeta?.hasActiveTemplate
                            ? `Version ${templateMeta.activeTemplate?.version || 'v1'} - Updated ${templateMeta.activeTemplate?.updatedAt ? new Date(templateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
                            : 'Using fallback template generated from import schema'}
                    </span>
                </div>
                <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    onChange={(event) => onImportFile(event.target.files?.[0])}
                />
                {importFileName && (
                    <p className="import-help" style={{ marginTop: 6 }}>
                        {t('standards:import.loadedFile', { fileName: importFileName })}
                    </p>
                )}
            </div>
            <div className="form-group">
                <label>{t('standards:import.pasteData')}</label>
                <textarea
                    className="import-textarea"
                    value={importText}
                    onChange={(event) => onImportTextChange(event.target.value)}
                    placeholder={IMPORT_TEXT_PLACEHOLDER}
                />
                <p className="import-help">
                    {t('standards:import.help')}
                </p>
            </div>
            <button
                className="btn btn-primary"
                onClick={onImport}
                disabled={loading || !importText.trim() || !importSubjectId}
            >
                {loading ? t('standards:import.importing') : t('standards:import.importButton')}
            </button>

            {importResult?.success ? (
                <div className="import-result success">
                    <p>
                        <strong>{importResult.message}</strong>
                    </p>
                    {importResult.data?.validationErrors?.length > 0 && (
                        <ul style={{ fontSize: '0.82rem', marginTop: 8 }}>
                            {importResult.data.validationErrors.map((error, index) => (
                                <li key={index}>{error}</li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : (
                <ErrorState
                    message={importResult?.message}
                    validationErrors={importResult?.data?.validationErrors || []}
                    className="import-result error"
                />
            )}
        </div>
    );
};

export default StandardsImportTab;
