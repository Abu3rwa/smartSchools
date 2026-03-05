import React from 'react';
import {
    HiOutlineUpload,
    HiOutlineDownload,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle
} from 'react-icons/hi';

const ImportStudentsModal = ({
    showImportModal,
    resetImportModal,
    importClassId,
    setImportClassId,
    classes,
    handleFileSelect,
    downloadTemplate,
    csvErrors,
    csvData,
    importResult,
    handleImport,
    importing
}) => {
    if (!showImportModal) return null;

    return (
        <div className="modal-overlay" onClick={resetImportModal}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Import Students from CSV</h3>
                    <button className="modal-close" onClick={resetImportModal}>&times;</button>
                </div>
                <div className="modal-body">
                    {/* Step 1: Select class */}
                    <div className="form-group">
                        <label>Assign to Class *</label>
                        <select
                            value={importClassId}
                            onChange={(e) => setImportClassId(e.target.value)}
                            required
                        >
                            <option value="">Select Class</option>
                            {classes.map(cls => (
                                <option key={cls._id} value={cls._id}>{cls.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2: Upload CSV */}
                    <div className="form-group">
                        <label>CSV File *</label>
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
                                <span>Click to select CSV file</span>
                            </label>
                        </div>
                        <button type="button" className="btn btn-sm btn-ghost mt-sm" onClick={downloadTemplate}>
                            <HiOutlineDownload size={16} />
                            Download Template
                        </button>
                    </div>

                    {/* Parse errors */}
                    {csvErrors.length > 0 && (
                        <div className="import-errors">
                            <h4><HiOutlineExclamationCircle /> Parse Errors</h4>
                            <ul>
                                {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Preview */}
                    {csvData.length > 0 && !importResult && (
                        <div className="csv-preview">
                            <h4>{csvData.length} student{csvData.length !== 1 ? 's' : ''} ready to import</h4>
                            <div className="table-container" style={{ maxHeight: '250px', overflow: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>First Name</th>
                                            <th>Last Name</th>
                                            <th>DOB</th>
                                            <th>Gender</th>
                                            <th>Email</th>
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
                                    <p className="text-muted text-sm mt-sm">Showing first 50 of {csvData.length} rows</p>
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
                                    <h4>Failed Rows</h4>
                                    <ul>
                                        {importResult.data.errors.map((err, i) => (
                                            <li key={i}>Row {err.row}: {err.message}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={resetImportModal}>
                        {importResult ? 'Close' : 'Cancel'}
                    </button>
                    {!importResult && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleImport}
                            disabled={importing || csvData.length === 0 || !importClassId}
                        >
                            {importing ? 'Importing...' : `Import ${csvData.length} Student${csvData.length !== 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportStudentsModal;
