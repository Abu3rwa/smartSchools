import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { importGrades, selectImportResult, clearImportResult } from '../../../../store/slices/spreadsheetSlice';

const modalOverlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.48)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1300
};

const modalContentStyle = {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.22)',
    padding: 16
};

const modalHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
};

const modalCloseButtonStyle = {
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    lineHeight: 1,
    cursor: 'pointer',
    color: '#64748b'
};

const ImportModal = ({ classId, subjectId, academicYear, semester, onClose, onImported }) => {
    const dispatch = useDispatch();
    const importResult = useSelector(selectImportResult);
    const [csvText, setCsvText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleFileUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setCsvText(ev.target.result);
        reader.readAsText(file);
    }, []);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!csvText.trim()) {
            toast.error('Please upload or paste CSV data');
            return;
        }

        // Parse CSV
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            toast.error('CSV must have a header row and at least one data row');
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const studentNameIdx = headers.findIndex(h => /student|name/i.test(h));
        if (studentNameIdx === -1) {
            toast.error('CSV must have a "Student" or "Name" column');
            return;
        }

        // Each remaining header is a column name
        const columnNames = headers.filter((_, i) => i !== studentNameIdx);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(c => c.trim());
            const studentName = cells[studentNameIdx];
            if (!studentName) continue;
            const grades = {};
            let colIdx = 0;
            for (let j = 0; j < cells.length; j++) {
                if (j === studentNameIdx) continue;
                const val = parseFloat(cells[j]);
                if (!isNaN(val)) {
                    grades[columnNames[colIdx]] = val;
                }
                colIdx++;
            }
            rows.push({ studentName, grades });
        }

        setSubmitting(true);
        try {
            await dispatch(importGrades({
                classId,
                subjectId,
                academicYear,
                semester,
                columns: columnNames,
                rows
            })).unwrap();
            toast.success('Import completed');
        } catch (err) {
            toast.error(err || 'Import failed');
        } finally {
            setSubmitting(false);
        }
    }, [dispatch, csvText, classId, subjectId, academicYear, semester]);

    return (
        <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={modalContentStyle}>
                <div className="modal-header" style={modalHeaderStyle}>
                    <h3>Import Grades</h3>
                    <button className="modal-close-btn" style={modalCloseButtonStyle} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Upload CSV File</label>
                        <input type="file" accept=".csv" onChange={handleFileUpload} />
                    </div>
                    <div className="form-group">
                        <label>Or Paste CSV Data</label>
                        <textarea
                            rows={8}
                            value={csvText}
                            onChange={e => setCsvText(e.target.value)}
                            placeholder="Student,HW #1,Quiz 1,Test 1&#10;John Doe,85,90,78&#10;Jane Smith,92,88,95"
                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                        />
                    </div>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                        First row = headers. First column should be student name. Other columns are grade columns (auto-created if they don't exist).
                    </p>

                    {importResult && (
                        <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                            <strong>Import Results:</strong>
                            <div>
                                Imported: {importResult.imported || 0}
                                {' | '}Columns Created: {importResult.columnsCreated || 0}
                                {' | '}Skipped: {importResult.skipped || 0}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => { dispatch(clearImportResult()); onClose(); }}>
                            {importResult ? 'Close' : 'Cancel'}
                        </button>
                        {importResult ? (
                            <button type="button" className="btn btn-primary" onClick={() => { dispatch(clearImportResult()); onImported(); }}>
                                Done
                            </button>
                        ) : (
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Importing...' : 'Import'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ImportModal;
