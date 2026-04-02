import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { autoFillColumn } from '../../../../store/slices/spreadsheetSlice';

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
    maxWidth: 400,
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

const AutoFillModal = ({ columns, classId, subjectId, academicYear, semester, onClose, onFilled }) => {
    const dispatch = useDispatch();
    const [form, setForm] = useState({ columnId: '', value: '', onlyEmpty: true });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!form.columnId || form.value === '') {
            toast.error('Select a column and enter a value');
            return;
        }
        setSubmitting(true);
        try {
            await dispatch(autoFillColumn({
                columnId: form.columnId,
                value: Number(form.value),
                onlyEmpty: form.onlyEmpty,
                classId,
                subjectId,
                academicYear,
                semester
            })).unwrap();
            toast.success('Column auto-filled');
            onFilled();
        } catch (err) {
            toast.error(err || 'Auto-fill failed');
        } finally {
            setSubmitting(false);
        }
    }, [dispatch, form, classId, subjectId, academicYear, semester, onFilled]);

    const unlockedColumns = columns.filter(c => !c.isLocked);

    return (
        <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={modalContentStyle}>
                <div className="modal-header" style={modalHeaderStyle}>
                    <h3>Auto-Fill Column</h3>
                    <button className="modal-close-btn" style={modalCloseButtonStyle} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Column</label>
                        <select value={form.columnId} onChange={e => setForm(p => ({ ...p, columnId: e.target.value }))}>
                            <option value="">Select column...</option>
                            {unlockedColumns.map(col => (
                                <option key={col._id} value={col._id}>{col.name} ({col.category})</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Value</label>
                        <input type="number" min={0} step="any" value={form.value}
                            onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                            placeholder="e.g., 90" />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
                        <input type="checkbox" checked={form.onlyEmpty}
                            onChange={e => setForm(p => ({ ...p, onlyEmpty: e.target.checked }))} />
                        Only fill empty cells (don't overwrite existing grades)
                    </label>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Filling...' : 'Auto-Fill'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AutoFillModal;
