import React from 'react';
import {
    HiOutlineUpload,
    HiOutlineDownload,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '../../../../components/ui';

const ImportStudentsModal = ({
    showImportModal,
    resetImportModal,
    importClassId,
    setImportClassId,
    classes,
    handleFileSelect,
    downloadTemplate,
    importTemplateMeta,
    csvErrors,
    csvData,
    importResult,
    handleImport,
    importing
}) => {
    const { t } = useTranslation(['students']);
    if (!showImportModal) return null;

    let currentStep = 0;
    if (csvData.length > 0) currentStep = 1;
    if (importing)          currentStep = 2;
    if (importResult)       currentStep = 3;

    return (
        <div className="modal-overlay" onClick={resetImportModal}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t('students:import.title')}</h3>
                    <button className="modal-close" onClick={resetImportModal}>&times;</button>
                </div>
                
                <div style={{ padding: '1.25rem 1.5rem 0' }}>
                    <ProgressBar 
                        steps={['Upload CSV', 'Preview', 'Importing', 'Done']} 
                        currentStep={currentStep} 
                    />
                </div>

                <div className="modal-body">
                    {/* Step 1: Select class */}
                    <div className="form-group">
                        <label>{t('students:import.assignToClass')}</label>
                        <select
                            value={importClassId}
                            onChange={(e) => setImportClassId(e.target.value)}
                            required
                        >
                            <option value="">{t('students:form.selectClass')}</option>
                            {classes.map(cls => (
                                <option key={cls._id} value={cls._id}>{cls.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2: Upload CSV */}
                    <div className="form-group">
                        <label>{t('students:import.csvFile')}</label>
                        <div className="csv-upload-area">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                id="csv-file-input"
                                className="csv-file-input"
                            />
                            <label htmlFor="csv-file-input" className="csv-upload-label">
                                <HiOutlineUpload size={24} />
                                <span>{t('students:import.selectCsvFile')}</span>
                            </label>
                        </div>
                        <button type="button" className="btn btn-sm btn-ghost mt-sm" onClick={downloadTemplate}>
                            <HiOutlineDownload size={16} />
                            {t('students:import.downloadTemplate')}
                        </button>
                        <p className="text-muted text-sm mt-sm">
                            {importTemplateMeta?.hasActiveTemplate
                                ? `Version ${importTemplateMeta?.activeTemplate?.version || 'v1'} - Updated ${importTemplateMeta?.activeTemplate?.updatedAt ? new Date(importTemplateMeta.activeTemplate.updatedAt).toLocaleDateString() : 'N/A'}`
                                : 'Using fallback template generated from import schema'}
                        </p>
                    </div>

                    {/* Parse errors */}
                    {csvErrors.length > 0 && (
                        <div className="import-errors">
                            <h4><HiOutlineExclamationCircle /> {t('students:import.parseErrors')}</h4>
                            <ul>
                                {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Preview */}
                    {csvData.length > 0 && !importResult && (
                        <div className="csv-preview">
                            <h4>{t('students:import.readyToImport', { count: csvData.length })}</h4>
                            <div className="table-container" style={{ maxHeight: '250px', overflow: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>{t('students:table.columns.firstName')}</th>
                                            <th>{t('students:table.columns.lastName')}</th>
                                            <th>{t('students:table.columns.dob')}</th>
                                            <th>{t('students:table.columns.gender')}</th>
                                            <th>{t('students:table.columns.email')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvData.slice(0, 50).map((row, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td>{row.firstName}</td>
                                                <td>{row.lastName}</td>
                                                <td>{row.dateOfBirth}</td>
                                                <td>{row.gender}</td>
                                                <td>{row.email || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {csvData.length > 50 && (
                                    <p className="text-muted text-sm mt-sm">{t('students:import.showingFirstRows', { shown: 50, total: csvData.length })}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Import result */}
                    {importResult && (
                        <div className="import-result">
                            <div className={`import-result-summary ${importResult.data.failed === 0 ? 'success' : 'partial'}`}>
                                <HiOutlineCheckCircle size={20} />
                                <span>{importResult.message}</span>
                            </div>
                            {importResult.data.errors && (
                                <div className="import-errors mt-sm">
                                    <h4>{t('students:import.failedRows')}</h4>
                                    <ul>
                                        {importResult.data.errors.map((err, i) => (
                                            <li key={i}>{t('students:import.rowError', { row: err.row, message: err.message })}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={resetImportModal} disabled={importing}>
                        {importResult ? t('common:actions.close') : t('common:actions.cancel')}
                    </button>
                    {!importResult && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleImport}
                            disabled={importing || csvData.length === 0 || !importClassId}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {importing && <span className="inline-spinner inline-spinner--sm" />}
                            {importing ? t('students:actions.importing') : t('students:actions.importStudents', { count: csvData.length })}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportStudentsModal;
