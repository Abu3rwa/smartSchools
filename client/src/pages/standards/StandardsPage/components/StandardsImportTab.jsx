import { IMPORT_TEXT_PLACEHOLDER } from '../constants';
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
    importResult
}) => {
    return (
        <div className="import-section">
            <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                <label>Subject for Import *</label>
                <select
                    value={importSubjectId}
                    onChange={(event) => onImportSubjectChange(event.target.value)}
                    style={{ maxWidth: 300 }}
                >
                    <option value="">Select Subject</option>
                    {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                            {subject.name} ({subject.code})
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                <label>Upload CSV File (optional)</label>
                <input
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    onChange={(event) => onImportFile(event.target.files?.[0])}
                />
                {importFileName && (
                    <p className="import-help" style={{ marginTop: 6 }}>
                        Loaded: <strong>{importFileName}</strong> (you can still edit the text below)
                    </p>
                )}
            </div>
            <div className="form-group">
                <label>Paste Standards Data (CSV or Tab-separated)</label>
                <textarea
                    className="import-textarea"
                    value={importText}
                    onChange={(event) => onImportTextChange(event.target.value)}
                    placeholder={IMPORT_TEXT_PLACEHOLDER}
                />
                <p className="import-help">
                    Supports CSV/TSV with or without a header row. Minimum columns: Code, Name,
                    Description. Optional: Grade, Category, MasteryThreshold, MasteryMinQuestions.
                </p>
            </div>
            <button
                className="btn btn-primary"
                onClick={onImport}
                disabled={loading || !importText.trim() || !importSubjectId}
            >
                {loading ? 'Importing...' : 'Import Standards'}
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
