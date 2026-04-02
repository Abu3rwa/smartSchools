import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlinePencil,
    HiOutlineCalculator,
    HiOutlineRefresh
} from 'react-icons/hi';
import {
    fetchFormulas,
    createFormula,
    updateFormula,
    deleteFormula,
    calculateFormula,
    fetchPresets,
    selectFormulas,
    selectFormulasLoading,
    selectFormulasSaving,
    selectFormulaPresets
} from '../../../../store/slices/formulaSlice';
import { selectSpreadsheetColumns, selectSpreadsheetStudents } from '../../../../store/slices/spreadsheetSlice';

const FormulaManager = ({ classId, subjectId, academicYear, semester, onFormulaCalculated }) => {
    const dispatch = useDispatch();
    const formulas = useSelector(selectFormulas);
    const loading = useSelector(selectFormulasLoading);
    const saving = useSelector(selectFormulasSaving);
    const presets = useSelector(selectFormulaPresets);
    const columns = useSelector(selectSpreadsheetColumns);
    const students = useSelector(selectSpreadsheetStudents);

    const [showEditor, setShowEditor] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        name: '',
        type: 'weighted_category',
        factors: [],
        outputColumnName: '',
        applyToFinalGrade: false
    });

    useEffect(() => {
        if (classId && subjectId && academicYear) {
            dispatch(fetchFormulas({ classId, subjectId, academicYear, semester }));
            dispatch(fetchPresets());
        }
    }, [dispatch, classId, subjectId, academicYear, semester]);

    const openEditor = useCallback((formula = null) => {
        if (formula) {
            setEditingId(formula._id);
            setForm({
                name: formula.name,
                type: formula.type || 'weighted_category',
                factors: formula.factors || [],
                outputColumnName: formula.outputColumnName || '',
                applyToFinalGrade: formula.applyToFinalGrade || false
            });
        } else {
            setEditingId(null);
            setForm({ name: '', type: 'weighted_category', factors: [], outputColumnName: '', applyToFinalGrade: false });
        }
        setShowEditor(true);
    }, []);

    const applyPreset = useCallback((preset) => {
        setForm(prev => ({
            ...prev,
            name: preset.name,
            type: preset.type,
            factors: preset.factors || []
        }));
    }, []);

    const addFactor = useCallback(() => {
        setForm(prev => ({
            ...prev,
            factors: [...prev.factors, { source: '', sourceId: '', weight: 0 }]
        }));
    }, []);

    const updateFactor = useCallback((idx, field, value) => {
        setForm(prev => ({
            ...prev,
            factors: prev.factors.map((f, i) => i === idx ? { ...f, [field]: value } : f)
        }));
    }, []);

    const removeFactor = useCallback((idx) => {
        setForm(prev => ({ ...prev, factors: prev.factors.filter((_, i) => i !== idx) }));
    }, []);

    const handleSave = useCallback(async () => {
        if (!form.name.trim()) {
            toast.error('Formula name is required');
            return;
        }
        if (form.factors.length === 0) {
            toast.error('Add at least one factor');
            return;
        }
        const totalWeight = form.factors.reduce((sum, f) => sum + (Number(f.weight) || 0), 0);
        if (Math.abs(totalWeight - 100) > 0.01) {
            toast.error(`Weights must sum to 100% (currently ${totalWeight}%)`);
            return;
        }

        const payload = {
            ...form,
            classId,
            subjectId,
            academicYear,
            semester
        };

        try {
            if (editingId) {
                await dispatch(updateFormula({ id: editingId, data: payload })).unwrap();
                toast.success('Formula updated');
            } else {
                await dispatch(createFormula(payload)).unwrap();
                toast.success('Formula created');
            }
            setShowEditor(false);
        } catch (err) {
            toast.error(err || 'Failed to save formula');
        }
    }, [dispatch, form, editingId, classId, subjectId, academicYear, semester]);

    const handleDelete = useCallback(async (id, name) => {
        if (!window.confirm(`Delete formula "${name}"?`)) return;
        try {
            await dispatch(deleteFormula(id)).unwrap();
            toast.success('Formula deleted');
        } catch (err) {
            toast.error(err || 'Failed to delete');
        }
    }, [dispatch]);

    const handleCalculate = useCallback(async (formulaId) => {
        const studentIds = students.map(s => s._id);
        try {
            const result = await dispatch(calculateFormula({ id: formulaId, studentIds })).unwrap();
            toast.success(`Calculated for ${studentIds.length} students`);
            onFormulaCalculated?.();
        } catch (err) {
            toast.error(err || 'Calculation failed');
        }
    }, [dispatch, students, onFormulaCalculated]);

    // Categories from columns
    const categorySet = [...new Set(columns.map(c => c.category))];

    if (loading) {
        return <div style={{ padding: 16 }}><p className="text-muted">Loading formulas...</p></div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Formulas</h4>
                <button className="btn btn-outline-primary btn-sm" onClick={() => openEditor()}>
                    <HiOutlinePlus size={14} style={{ marginRight: 4 }} />Add Formula
                </button>
            </div>

            {/* Formula List */}
            {formulas.length === 0 && (
                <p className="text-muted" style={{ fontSize: 13 }}>
                    No formulas configured. Create a formula to auto-calculate weighted grades.
                </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {formulas.map(f => (
                    <div key={f._id} style={{
                        border: '1px solid #e5e7eb', borderRadius: 8, padding: 12,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontWeight: 600 }}>{f.name}</div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                {f.type} — {f.factors?.length || 0} factors
                                {f.applyToFinalGrade && <span style={{ color: '#059669', marginLeft: 8 }}>★ Final Grade</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-outline-primary btn-sm" onClick={() => handleCalculate(f._id)}
                                title="Calculate for all students">
                                <HiOutlineCalculator size={14} />
                            </button>
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => openEditor(f)}>
                                <HiOutlinePencil size={14} />
                            </button>
                            <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(f._id, f.name)}>
                                <HiOutlineTrash size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Formula Editor Modal */}
            {showEditor && (
                <div className="modal-overlay" onClick={() => setShowEditor(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Formula' : 'New Formula'}</h3>
                            <button className="modal-close-btn" onClick={() => setShowEditor(false)}>&times;</button>
                        </div>

                        {/* Presets */}
                        {!editingId && presets.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: 12, color: '#6b7280' }}>Quick presets:</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                    {presets.map((p, i) => (
                                        <button key={i} className="btn btn-outline-secondary btn-sm"
                                            onClick={() => applyPreset(p)} style={{ fontSize: 11 }}>
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="form-group">
                            <label>Formula Name</label>
                            <input type="text" value={form.name}
                                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                placeholder="e.g., Final Grade Calculation" />
                        </div>

                        <div className="form-group">
                            <label>Type</label>
                            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                                <option value="weighted_category">Weighted by Category</option>
                                <option value="weighted_column">Weighted by Column</option>
                                <option value="simple_average">Simple Average</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>

                        {/* Factors */}
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <label style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>Factors</label>
                                <button className="btn btn-outline-primary btn-sm" onClick={addFactor} style={{ fontSize: 11 }}>
                                    <HiOutlinePlus size={12} /> Add Factor
                                </button>
                            </div>
                            {form.factors.map((factor, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                                    <select value={factor.source || ''}
                                        onChange={e => updateFactor(idx, 'source', e.target.value)}
                                        style={{ fontSize: 12 }}>
                                        <option value="">Select source</option>
                                        {form.type === 'weighted_category' && categorySet.map(cat => (
                                            <option key={cat} value={`category:${cat}`}>Cat: {cat}</option>
                                        ))}
                                        {form.type === 'weighted_column' && columns.map(col => (
                                            <option key={col._id} value={`column:${col._id}`}>{col.name}</option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input type="number" min={0} max={100} value={factor.weight}
                                            onChange={e => updateFactor(idx, 'weight', Number(e.target.value))}
                                            style={{ width: 70, fontSize: 12 }} />
                                        <span style={{ fontSize: 12 }}>%</span>
                                    </div>
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>#{idx + 1}</span>
                                    <button className="btn btn-outline-danger btn-sm" onClick={() => removeFactor(idx)}
                                        style={{ padding: '2px 6px' }}>
                                        <HiOutlineTrash size={12} />
                                    </button>
                                </div>
                            ))}
                            {form.factors.length > 0 && (
                                <div style={{ fontSize: 12, color: form.factors.reduce((s, f) => s + (f.weight || 0), 0) === 100 ? '#059669' : '#dc2626' }}>
                                    Total: {form.factors.reduce((s, f) => s + (f.weight || 0), 0)}%
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Output Column Name (optional)</label>
                            <input type="text" value={form.outputColumnName}
                                onChange={e => setForm(p => ({ ...p, outputColumnName: e.target.value }))}
                                placeholder="e.g., Final Grade" />
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 16 }}>
                            <input type="checkbox" checked={form.applyToFinalGrade}
                                onChange={e => setForm(p => ({ ...p, applyToFinalGrade: e.target.checked }))} />
                            Use as Final Grade calculation
                        </label>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline-secondary" onClick={() => setShowEditor(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FormulaManager;
