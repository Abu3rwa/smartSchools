import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchStandards, createStandard, updateStandard, deleteStandard, importStandards,
    selectStandards, selectStandardsLoading, selectImportResult, clearImportResult
} from '../store/slices/standardSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { selectUser } from '../store/slices/authSlice';
import {
    HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash,
    HiOutlineUpload, HiOutlineClipboardList
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import './StandardsPage.css';

const StandardsPage = () => {
    const dispatch = useDispatch();
    const standards = useSelector(selectStandards);
    const loading = useSelector(selectStandardsLoading);
    const importResult = useSelector(selectImportResult);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const [activeTab, setActiveTab] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [importText, setImportText] = useState('');
    const [importSubjectId, setImportSubjectId] = useState('');
    const [importFileName, setImportFileName] = useState('');

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        description: '',
        subject: '',
        gradeLevel: '',
        category: '',
        masteryThreshold: 80,
        masteryMinQuestions: 5
    });

    useEffect(() => {
        dispatch(fetchStandards());
        dispatch(fetchSubjects());
    }, [dispatch]);

    const filteredStandards = standards.filter(s => {
        const matchSearch = !searchTerm ||
            s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchSubject = !filterSubject || (s.subject?._id || s.subject) === filterSubject;
        const matchGrade = !filterGrade || s.gradeLevel === parseInt(filterGrade);
        return matchSearch && matchSubject && matchGrade;
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            let result;
            if (editingId) {
                result = await dispatch(updateStandard({ id: editingId, data: formData }));
            } else {
                result = await dispatch(createStandard(formData));
            }
            if (createStandard.fulfilled.match(result) || updateStandard.fulfilled.match(result)) {
                toast.success(`Standard ${editingId ? 'updated' : 'created'} successfully!`);
                handleCloseModal();
                dispatch(fetchStandards());
            } else {
                toast.error(result.payload || 'Failed to save standard');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (standard) => {
        setEditingId(standard._id);
        setFormData({
            code: standard.code,
            name: standard.name,
            description: standard.description || '',
            subject: standard.subject?._id || standard.subject || '',
            gradeLevel: standard.gradeLevel || '',
            category: standard.category || '',
            masteryThreshold: standard.masteryThreshold || 80,
            masteryMinQuestions: standard.masteryMinQuestions || 5
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this standard?')) {
            const result = await dispatch(deleteStandard(id));
            if (deleteStandard.fulfilled.match(result)) {
                toast.success('Standard deleted successfully');
            } else {
                toast.error(result.payload || 'Failed to delete');
            }
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData({
            code: '', name: '', description: '', subject: '',
            gradeLevel: '', category: '', masteryThreshold: 80, masteryMinQuestions: 5
        });
    };

    const handleImport = async () => {
        if (!importSubjectId) {
            toast.error('Please select a subject for the import');
            return;
        }
        if (!importText.trim()) {
            toast.error('Please paste standard data to import');
            return;
        }

        const parseCsvLine = (line) => {
            // Minimal CSV parser (supports quotes + commas). Also works for TSV.
            const delimiter = line.includes('\t') ? '\t' : ',';
            const out = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    // Escaped quote
                    if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
                    inQuotes = !inQuotes;
                    continue;
                }
                if (!inQuotes && ch === delimiter) {
                    out.push(cur);
                    cur = '';
                    continue;
                }
                cur += ch;
            }
            out.push(cur);
            return out.map(v => v.trim());
        };

        const parseImportText = (text) => {
            const lines = text
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);

            if (lines.length === 0) return [];

            const firstRow = parseCsvLine(lines[0]).map(h => h.toLowerCase());
            const hasHeader = firstRow.includes('code') && firstRow.includes('name') && firstRow.includes('description');

            let headerMap = null;
            let dataLines = lines;
            if (hasHeader) {
                headerMap = {};
                firstRow.forEach((h, idx) => { headerMap[h] = idx; });
                dataLines = lines.slice(1);
            }

            return dataLines.map(line => {
                const parts = parseCsvLine(line);
                if (parts.length < 3) return null;

                const get = (key, fallbackIdx) => {
                    const idx = headerMap?.[key];
                    const v = (idx !== undefined ? parts[idx] : parts[fallbackIdx]) ?? '';
                    return String(v).trim();
                };

                const gradeStr = get('grade', 3) || get('gradelevel', 3) || get('grade_level', 3);
                const masteryThresholdStr = get('masterythreshold', 5) || get('mastery_threshold', 5);
                const masteryMinQuestionsStr = get('masteryminquestions', 6) || get('mastery_min_questions', 6);

                return {
                    code: get('code', 0),
                    name: get('name', 1),
                    description: get('description', 2),
                    gradeLevel: gradeStr ? parseInt(gradeStr) : (parseInt(filterGrade) || 1),
                    category: get('category', 4) || '',
                    masteryThreshold: masteryThresholdStr ? parseInt(masteryThresholdStr) : undefined,
                    masteryMinQuestions: masteryMinQuestionsStr ? parseInt(masteryMinQuestionsStr) : undefined,
                    subject: importSubjectId
                };
            }).filter(Boolean);
        };

        try {
            const parsed = parseImportText(importText.trim());

            if (parsed.length === 0) {
                toast.error('No valid rows found. Format: Code, Name, Description, Grade, Category');
                return;
            }

            const result = await dispatch(importStandards(parsed));
            if (importStandards.fulfilled.match(result)) {
                toast.success(result.payload.message);
                dispatch(fetchStandards());
                setImportText('');
                setImportFileName('');
            } else {
                toast.error(result.payload || 'Import failed');
            }
        } catch (err) {
            toast.error('Failed to parse import data');
        }
    };

    const handleImportFile = (file) => {
        if (!file) return;
        setImportFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => {
            setImportText(String(reader.result || ''));
        };
        reader.onerror = () => {
            toast.error('Failed to read file');
        };
        reader.readAsText(file);
    };

    return (
        <div className="standards-page">
            <div className="page-header">
                <div>
                    <h1>Standards</h1>
                    <p className="text-muted">Manage educational standards for student practice</p>
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <HiOutlinePlus size={20} />
                            Add Standard
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            {isAdmin && (
                <div className="tabs">
                    <button
                        className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
                        onClick={() => setActiveTab('list')}
                    >
                        <HiOutlineClipboardList style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Standards List
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
                        onClick={() => setActiveTab('import')}
                    >
                        <HiOutlineUpload style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Import
                    </button>
                </div>
            )}

            {activeTab === 'list' && (
                <>
                    {/* Filters */}
                    <div className="filters-bar">
                        <div className="search-bar">
                            <HiOutlineSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search standards..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
                            <option value="">All Subjects</option>
                            {subjects.map(s => (
                                <option key={s._id} value={s._id}>{s.name}</option>
                            ))}
                        </select>
                        <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
                            <option value="">All Grades</option>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                                <option key={g} value={g}>Grade {g}</option>
                            ))}
                        </select>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    ) : filteredStandards.length === 0 ? (
                        <div className="standards-empty">
                            <HiOutlineClipboardList size={48} />
                            <p>No standards found</p>
                            {isAdmin && <p style={{ fontSize: '0.85rem' }}>Click "Add Standard" or use Import to get started.</p>}
                        </div>
                    ) : (
                        <div className="standards-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Name</th>
                                        <th>Description</th>
                                        <th>Subject</th>
                                        <th>Grade</th>
                                        <th>Category</th>
                                        <th>Mastery</th>
                                        {isAdmin && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStandards.map(standard => (
                                        <tr key={standard._id}>
                                            <td className="standard-code">{standard.code}</td>
                                            <td>{standard.name}</td>
                                            <td className="standard-description" title={standard.description}>
                                                {standard.description}
                                            </td>
                                            <td>{standard.subject?.name || '-'}</td>
                                            <td>{standard.gradeLevel}</td>
                                            <td>{standard.category || '-'}</td>
                                            <td>{standard.masteryThreshold}% / {standard.masteryMinQuestions}q</td>
                                            {isAdmin && (
                                                <td>
                                                    <div className="standard-actions">
                                                        <button className="btn-icon" onClick={() => handleEdit(standard)} title="Edit">
                                                            <HiOutlinePencil />
                                                        </button>
                                                        <button className="btn-icon text-danger" onClick={() => handleDelete(standard._id)} title="Delete">
                                                            <HiOutlineTrash />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'import' && isAdmin && (
                <div className="import-section">
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <label>Subject for Import *</label>
                        <select
                            value={importSubjectId}
                            onChange={(e) => setImportSubjectId(e.target.value)}
                            style={{ maxWidth: 300 }}
                        >
                            <option value="">Select Subject</option>
                            {subjects.map(s => (
                                <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <label>Upload CSV File (optional)</label>
                        <input
                            type="file"
                            accept=".csv,.tsv,text/csv,text/tab-separated-values"
                            onChange={(e) => handleImportFile(e.target.files?.[0])}
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
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder={`Code\tName\tDescription\tGrade\tCategory\nCCSS.MATH.4.OA.1\tMultiplication Equations\tInterpret a multiplication equation as a comparison\t4\tOperations`}
                        />
                        <p className="import-help">
                            Supports CSV/TSV with or without a header row.
                            Minimum columns: Code, Name, Description. Optional: Grade, Category, MasteryThreshold, MasteryMinQuestions.
                        </p>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={loading || !importText.trim() || !importSubjectId}
                    >
                        {loading ? 'Importing...' : 'Import Standards'}
                    </button>

                    {importResult && (
                        <div className={`import-result ${importResult.success ? 'success' : 'error'}`}>
                            <p><strong>{importResult.message}</strong></p>
                            {importResult.data?.validationErrors?.length > 0 && (
                                <ul style={{ fontSize: '0.82rem', marginTop: 8 }}>
                                    {importResult.data.validationErrors.map((e, i) => (
                                        <li key={i}>{e}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Standard' : 'Add New Standard'}</h3>
                            <button className="modal-close" onClick={handleCloseModal}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Code *</label>
                                        <input
                                            type="text"
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            required
                                            placeholder="e.g., CCSS.MATH.4.OA.1"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Name *</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            placeholder="e.g., Multiplication Equations"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Description *</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        required
                                        rows={3}
                                        placeholder="Full description of the standard..."
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Subject *</label>
                                        <select
                                            value={formData.subject}
                                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Subject</option>
                                            {subjects.map(s => (
                                                <option key={s._id} value={s._id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Grade Level *</label>
                                        <select
                                            value={formData.gradeLevel}
                                            onChange={(e) => setFormData({ ...formData, gradeLevel: parseInt(e.target.value) })}
                                            required
                                        >
                                            <option value="">Select Grade</option>
                                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
                                                <option key={g} value={g}>Grade {g}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Category / Domain</label>
                                    <input
                                        type="text"
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        placeholder="e.g., Operations & Algebraic Thinking"
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Mastery Threshold (%)</label>
                                        <input
                                            type="number"
                                            value={formData.masteryThreshold}
                                            onChange={(e) => setFormData({ ...formData, masteryThreshold: parseInt(e.target.value) || 80 })}
                                            min={1}
                                            max={100}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Minimum Questions</label>
                                        <input
                                            type="number"
                                            value={formData.masteryMinQuestions}
                                            onChange={(e) => setFormData({ ...formData, masteryMinQuestions: parseInt(e.target.value) || 5 })}
                                            min={1}
                                            max={50}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : (editingId ? 'Update Standard' : 'Add Standard')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StandardsPage;
