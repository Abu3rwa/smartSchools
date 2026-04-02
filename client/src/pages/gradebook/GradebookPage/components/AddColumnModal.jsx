import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { createColumn } from '../../../../store/slices/gradebookColumnsSlice';

const CATEGORIES = [
    { key: 'classwork', label: 'Classwork' },
    { key: 'homework', label: 'Homework' },
    { key: 'quiz', label: 'Quiz' },
    { key: 'test', label: 'Test' },
    { key: 'project', label: 'Project' },
    { key: 'participation', label: 'Participation' },
    { key: 'oral', label: 'Oral' },
    { key: 'practical', label: 'Practical' },
    { key: 'midterm_exam', label: 'Midterm Exam' },
    { key: 'final_exam', label: 'Final Exam' }
];

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
    maxWidth: 440,
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

const AddColumnModal = ({ classId, subjectId, academicYear, semester, onClose, onCreated }) => {
    const dispatch = useDispatch();
    const [form, setForm] = useState({
        name: '',
        category: 'classwork',
        date: new Date().toISOString().split('T')[0],
        maxMarks: 100,
        examPeriod: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            toast.error('Column name is required');
            return;
        }
        setSubmitting(true);
        try {
            await dispatch(createColumn({
                classId,
                subjectId,
                academicYear,
                semester,
                name: form.name.trim(),
                category: form.category,
                date: form.date,
                maxMarks: Number(form.maxMarks) || 100,
                examPeriod: form.examPeriod || null
            })).unwrap();
            toast.success('Column added');
            onCreated();
        } catch (err) {
            toast.error(err || 'Failed to add column');
        } finally {
            setSubmitting(false);
        }
    }, [dispatch, form, classId, subjectId, academicYear, semester, onCreated]);

    return (
        <div className="modal-overlay" onClick={onClose} style={modalOverlayStyle}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={modalContentStyle}>
                <div className="modal-header" style={modalHeaderStyle}>
                    <h3>Add Column</h3>
                    <button className="modal-close-btn" style={modalCloseButtonStyle} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Column Name</label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g., HW #1, Quiz 3, Midterm" autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                            <label>Date</label>
                            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label>Total Marks</label>
                            <input type="number" min={1} value={form.maxMarks}
                                onChange={e => setForm(p => ({ ...p, maxMarks: e.target.value }))} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Exam Period (optional)</label>
                        <select value={form.examPeriod} onChange={e => setForm(p => ({ ...p, examPeriod: e.target.value }))}>
                            <option value="">None</option>
                            <option value="midterm">Midterm</option>
                            <option value="final">Final</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Adding...' : 'Add Column'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddColumnModal;
