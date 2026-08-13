import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    fetchUnits, createUnit, updateUnit, deleteUnit,
    selectUnits, selectUnitsLoading,
} from '../../../store/slices/socialStudiesSlice';
import { selectCurrentAcademicYear, selectSelectedSemester } from '../../../store/slices/uiSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

const defaultForm = () => ({ title: '', description: '', gradeLevel: '', semester: '' });

export default function SocialStudiesCurriculumPage() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const units = useSelector(selectUnits);
    const loading = useSelector(selectUnitsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const semester = useSelector(selectSelectedSemester);

    const [showModal, setShowModal] = useState(false);
    const [editUnit, setEditUnit] = useState(null);
    const [form, setForm] = useState(defaultForm());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        dispatch(fetchUnits({ academicYear, semester }));
    }, [dispatch, academicYear, semester]);

    const openCreate = () => { setEditUnit(null); setForm(defaultForm()); setShowModal(true); };
    const openEdit = (unit) => {
        setEditUnit(unit);
        setForm({ title: unit.title, description: unit.description || '', gradeLevel: unit.gradeLevel ?? '', semester: unit.semester ?? '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.title.trim()) return toast.error('Unit title is required');
        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim(),
                gradeLevel: form.gradeLevel !== '' ? Number(form.gradeLevel) : null,
                semester: form.semester !== '' ? Number(form.semester) : null,
                academicYear,
            };
            if (editUnit) {
                await dispatch(updateUnit({ id: editUnit._id, data: payload })).unwrap();
                toast.success('Unit updated');
            } else {
                await dispatch(createUnit(payload)).unwrap();
                toast.success('Unit created');
            }
            setShowModal(false);
        } catch (err) {
            toast.error(err || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (unit) => {
        if (!window.confirm(`Delete unit "${unit.title}"?`)) return;
        try {
            await dispatch(deleteUnit(unit._id)).unwrap();
            toast.success('Unit deleted');
        } catch (err) {
            toast.error(err || 'Delete failed');
        }
    };

    return (
        <div className="ss-page" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Social Studies</h1>
                        <p style={{ margin: '4px 0 0', color: '#666' }}>Manage units, lessons and assignments</p>
                    </div>
                    <button onClick={openCreate} className="btn btn-primary">+ New Unit</button>
                </div>

                {loading ? (
                    <p>Loading units…</p>
                ) : units.length === 0 ? (
                    <div style={emptyStyle}>
                        <p style={{ fontSize: 18, fontWeight: 600 }}>No units yet</p>
                        <p style={{ color: '#888' }}>Create your first Social Studies unit to get started.</p>
                        <button onClick={openCreate} className="btn btn-primary">Create First Unit</button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                        {units.map(unit => (
                            <div key={unit._id} style={cardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{unit.title}</h3>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                            {unit.gradeLevel != null && (
                                                <span style={badgeStyle}>Grade {unit.gradeLevel}</span>
                                            )}
                                            {unit.semester && (
                                                <span style={{ ...badgeStyle, background: '#f0fdf4', color: '#166534' }}>Sem {unit.semester}</span>
                                            )}
                                        </div>
                                    </div>
                                    <span style={{ ...statusBadge, background: unit.isPublished ? '#dcfce7' : '#fef9c3', color: unit.isPublished ? '#166534' : '#854d0e' }}>
                                        {unit.isPublished ? 'Published' : 'Draft'}
                                    </span>
                                </div>
                                {unit.description && <p style={{ margin: '8px 0 0', color: '#555', fontSize: 14 }}>{unit.description}</p>}
                                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                                    <button onClick={() => navigate(`/portal/social-studies/units/${unit._id}`)} className="btn btn-primary" style={{ flex: 1 }}>
                                        Open Unit
                                    </button>
                                    <button onClick={() => openEdit(unit)} className="btn btn-secondary">Edit</button>
                                    <button onClick={() => handleDelete(unit)} className="btn btn-danger">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showModal && (
                    <div style={modalOverlay}>
                        <div style={modalBox}>
                            <h2 style={{ marginTop: 0 }}>{editUnit ? 'Edit Unit' : 'New Unit'}</h2>
                            <label style={labelStyle}>Title *</label>
                            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Ancient Civilizations" />
                            <label style={labelStyle}>Description</label>
                            <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief overview of this unit" />
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Grade Level</label>
                                    <input type="number" style={inputStyle} value={form.gradeLevel} onChange={e => setForm(f => ({ ...f, gradeLevel: e.target.value }))} placeholder="e.g. 5" min={0} max={12} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>Semester</label>
                                    <select style={inputStyle} value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}>
                                        <option value="">Any</option>
                                        <option value="1">Semester 1</option>
                                        <option value="2">Semester 2</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={saving}>Cancel</button>
                                <button onClick={handleSave} className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Unit'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
    );
}

const emptyStyle = { textAlign: 'center', padding: '64px 24px', background: '#f9fafb', borderRadius: 12, border: '2px dashed #e5e7eb' };
const cardStyle = { background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
const badgeStyle = { display: 'inline-block', marginTop: 4, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 99, fontSize: 12 };
const statusBadge = { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 99 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, marginTop: 12, color: '#374151' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
