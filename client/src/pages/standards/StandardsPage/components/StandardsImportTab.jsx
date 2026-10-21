import { IMPORT_TEXT_PLACEHOLDER } from '../constants';
import { useTranslation } from 'react-i18next';
import ErrorState from './ErrorState';

const StandardsImportTab = ({
    subjects,
    importSubjectId,
    onImportSubjectChange,
    importDuplicatePolicy,
    onImportDuplicatePolicyChange,
    importFileName,
    importText,
    onImportTextChange,
    loading,
    onImport,
    onCopyAiPrompt,
    onImportFile,
    importResult,
    templateMeta,
    onDownloadTemplate
}) => {
    const { t } = useTranslation(['standards']);
    const importSummary = importResult?.summary;
    const onlySkipped = importSummary?.importedRows === 0 && importSummary?.skippedRows > 0;
    const formatIssue = (issue) => {
        if (typeof issue === 'string') return issue;
        const row = issue?.row ? `Row ${issue.row}: ` : '';
        const field = issue?.field ? `${issue.field} — ` : '';
        const code = issue?.data?.code ? `${issue.data.code}: ` : '';
        return `${row}${code}${field}${issue?.message || JSON.stringify(issue)}`;
    };

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
                    <button type="button" className="btn btn-secondary" onClick={onCopyAiPrompt}>
                        {t('standards:import.copyAiPrompt')}
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
                <label htmlFor="standards-duplicate-policy">{t('standards:import.duplicatePolicy')}</label>
                <select
                    id="standards-duplicate-policy"
                    value={importDuplicatePolicy}
                    onChange={(event) => onImportDuplicatePolicyChange(event.target.value)}
                    style={{ maxWidth: 360 }}
                >
                    <option value="skip">{t('standards:import.skipExisting')}</option>
                    <option value="update">{t('standards:import.updateExisting')}</option>
                    <option value="error">{t('standards:import.errorOnExisting')}</option>
                </select>
                <p className="import-help">{t('standards:import.duplicatePolicyHelp')}</p>
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
                <div className={`import-result ${onlySkipped ? 'warning' : 'success'}`}>
                    <p>
                        <strong>{importResult.message}</strong>
                    </p>
                    {importResult.summary && (
                        <p className="import-help">
                            {t('standards:import.resultSummary', {
                                imported: importResult.summary.importedRows,
                                created: importResult.summary.createdRows,
                                updated: importResult.summary.updatedRows,
                                skipped: importResult.summary.skippedRows,
                                failed: importResult.summary.failedRows
                            })}
                        </p>
                    )}
                    {importResult.data?.validationErrors?.length > 0 && (
                        <ul style={{ fontSize: '0.82rem', marginTop: 8 }}>
                            {importResult.data.validationErrors.map((error, index) => (
                                <li key={index}>{formatIssue(error)}</li>
                            ))}
                        </ul>
                    )}
                    {importResult.warnings?.length > 0 && (
                        <ul style={{ fontSize: '0.82rem', marginTop: 8 }}>
                            {importResult.warnings.slice(0, 20).map((warning, index) => (
                                <li key={`${warning.row || 'warning'}-${index}`}>
                                    {formatIssue(warning)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {importResult.warnings?.length > 20 && (
                        <p className="import-help">
                            {t('standards:import.moreWarnings', {
                                count: importResult.warnings.length - 20
                            })}
                        </p>
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
