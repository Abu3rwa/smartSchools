import { HiOutlineExclamation, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';

/**
 * Confirmation modal for bulk-deleting students.
 * Supports three scopes: selected IDs, by class, by academic year.
 * Supports two modes: soft-deactivate or permanent delete (inactive only).
 */
const BulkDeleteModal = ({
    show,
    onClose,
    onConfirm,
    loading,
    // selection
    selectedCount,
    // dropdowns
    classes,
    academicYears,
    // controlled state
    mode,
    setMode,
    deleteClassId,
    setDeleteClassId,
    deleteYear,
    setDeleteYear,
    permanent,
    setPermanent,
}) => {
    if (!show) return null;

    const selectedClass = classes.find((c) => c._id === deleteClassId);

    const scopeLabel = () => {
        if (mode === 'selected') return `${selectedCount} selected student(s)`;
        if (mode === 'class') return selectedClass ? `all students in ${selectedClass.name}` : 'students in selected class';
        if (mode === 'year') return deleteYear ? `all students in ${deleteYear}` : 'all students in selected year';
        return '';
    };

    const canConfirm = !loading
        && (mode === 'selected' ? selectedCount > 0 : true)
        && (mode === 'class' ? Boolean(deleteClassId) : true)
        && (mode === 'year' ? Boolean(deleteYear) : true);

    return (
        <div
            className="modal-overlay"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
        >
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                {/* Header */}
                <div className="modal-header">
                    <h3
                        id="bulk-delete-title"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <HiOutlineExclamation size={20} style={{ color: 'var(--error-500, #ef4444)', flexShrink: 0 }} />
                        Delete Students
                    </h3>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        <HiOutlineX size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

                    {/* Scope */}
                    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Scope</legend>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {selectedCount > 0 && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input
                                        type="radio"
                                        name="bulkDeleteMode"
                                        value="selected"
                                        checked={mode === 'selected'}
                                        onChange={() => setMode('selected')}
                                    />
                                    Selected students ({selectedCount})
                                </label>
                            )}

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="bulkDeleteMode"
                                    value="class"
                                    checked={mode === 'class'}
                                    onChange={() => setMode('class')}
                                />
                                By class
                            </label>
                            {mode === 'class' && (
                                <select
                                    value={deleteClassId}
                                    onChange={(e) => setDeleteClassId(e.target.value)}
                                    style={{ marginLeft: 24 }}
                                    aria-label="Select class to delete"
                                >
                                    <option value="">— Select class —</option>
                                    {classes.map((cls) => (
                                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                                    ))}
                                </select>
                            )}

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem' }}>
                                <input
                                    type="radio"
                                    name="bulkDeleteMode"
                                    value="year"
                                    checked={mode === 'year'}
                                    onChange={() => setMode('year')}
                                />
                                By academic year
                            </label>
                            {mode === 'year' && (
                                <select
                                    value={deleteYear}
                                    onChange={(e) => setDeleteYear(e.target.value)}
                                    style={{ marginLeft: 24 }}
                                    aria-label="Select academic year to delete"
                                >
                                    <option value="">— Select year —</option>
                                    {academicYears.map((y) => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </fieldset>

                    {/* Type */}
                    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Delete type</legend>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="bulkDeleteType"
                                    value="soft"
                                    checked={!permanent}
                                    onChange={() => setPermanent(false)}
                                    style={{ marginTop: 3 }}
                                />
                                <span style={{ fontSize: '0.9rem' }}>
                                    <strong>Deactivate</strong>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'block' }}>
                                        Marks students as inactive. Data is preserved and can be restored.
                                    </span>
                                </span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name="bulkDeleteType"
                                    value="permanent"
                                    checked={permanent}
                                    onChange={() => setPermanent(true)}
                                    style={{ marginTop: 3 }}
                                />
                                <span style={{ fontSize: '0.9rem' }}>
                                    <strong style={{ color: 'var(--error-500, #ef4444)' }}>Permanently delete</strong>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'block' }}>
                                        Only already-inactive students are removed. Active students are skipped.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </fieldset>

                    {/* Warning banner */}
                    {permanent && (
                        <div style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.35)',
                            borderRadius: 8,
                            padding: '0.6rem 0.8rem',
                            fontSize: '0.85rem',
                            color: 'var(--text-secondary)',
                        }}>
                            ⚠ Permanent deletion removes student records and linked user accounts. This cannot be undone.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={onConfirm}
                        disabled={!canConfirm}
                    >
                        <HiOutlineTrash size={16} />
                        {loading
                            ? 'Deleting…'
                            : `${permanent ? 'Permanently Delete' : 'Deactivate'} ${scopeLabel()}`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkDeleteModal;
