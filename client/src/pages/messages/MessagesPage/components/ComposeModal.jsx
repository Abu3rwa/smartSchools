import { HiOutlineX } from 'react-icons/hi';
import { formatClassLabel, formatStudentNames } from '../utils/messagePresentation';

const ComposeModal = ({
    isOpen,
    onClose,
    onSubmit,
    classOptions,
    selectedClassIds,
    includeClassParents,
    includeClassStudents,
    onToggleClass,
    onToggleClassParents,
    onToggleClassStudents,
    classAudiencePreview,
    loadingClasses,
    composeSearch,
    onSearchChange,
    selectedParents,
    onRemoveParent,
    parentOptions,
    onSelectParent,
    loadingParents,
    composeSubject,
    onSubjectChange,
    composeBody,
    onBodyChange,
    composeLoading
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal messages-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="messages-compose-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="messages-compose-title">New Message</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close compose message modal">
                        <HiOutlineX size={18} />
                    </button>
                </div>
                <form className="modal-body" onSubmit={onSubmit}>
                    <div className="compose-field">
                        <label>To classes</label>
                        <div className="class-selection">
                            {loadingClasses && <div className="loading-more">Loading classes...</div>}
                            {!loadingClasses && classOptions.length === 0 && (
                                <div className="empty-row">No available classes</div>
                            )}
                            {!loadingClasses && classOptions.length > 0 && (
                                <div className="class-options">
                                    {classOptions.map((classOption) => {
                                        const isSelected = selectedClassIds.includes(classOption.id);
                                        return (
                                            <label
                                                key={classOption.id}
                                                className={`class-option ${isSelected ? 'selected' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => onToggleClass(classOption.id)}
                                                />
                                                <span className="class-option-main">
                                                    {formatClassLabel(classOption)}
                                                </span>
                                                <span className="class-option-meta">
                                                    {classOption.studentCount || 0} students · {classOption.parentCount || 0} parents
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="compose-audience-row">
                            <label className="audience-toggle">
                                <input
                                    type="checkbox"
                                    checked={includeClassParents}
                                    onChange={onToggleClassParents}
                                />
                                <span>To parents</span>
                            </label>
                            <label className="audience-toggle">
                                <input
                                    type="checkbox"
                                    checked={includeClassStudents}
                                    onChange={onToggleClassStudents}
                                />
                                <span>To students</span>
                            </label>
                        </div>
                        {selectedClassIds.length > 0 && (
                            <div className="compose-class-preview text-muted">
                                Selected {selectedClassIds.length} class{selectedClassIds.length === 1 ? '' : 'es'} ·
                                approx. {classAudiencePreview.parents} parents · {classAudiencePreview.students} students
                            </div>
                        )}
                    </div>

                    <div className="compose-field">
                        <label>Also send to specific parents (optional)</label>
                        <input
                            type="text"
                            placeholder="Search parents or child names"
                            value={composeSearch}
                            onChange={onSearchChange}
                        />
                        <div className="compose-selection">
                            {selectedParents.map((parent) => (
                                <span key={parent.id} className="compose-chip">
                                    <span>{parent.displayName}</span>
                                    {formatStudentNames(parent.studentNames) && (
                                        <span className="compose-students">
                                            ({formatStudentNames(parent.studentNames)})
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="chip-remove"
                                        onClick={() => onRemoveParent(parent.id)}
                                    >
                                        <HiOutlineX size={12} />
                                    </button>
                                </span>
                            ))}
                            {selectedParents.length === 0 && <span className="text-muted">No extra parent selected</span>}
                        </div>
                        <div className="compose-results">
                            {loadingParents && <div className="loading-more">Loading parents...</div>}
                            {!loadingParents && parentOptions.length === 0 && (
                                <div className="empty-row">No parents found</div>
                            )}
                            {parentOptions.map((parent) => (
                                <button
                                    key={parent.id}
                                    type="button"
                                    className="compose-result"
                                    onClick={() => onSelectParent(parent)}
                                >
                                    <span>{parent.displayName}</span>
                                    {formatStudentNames(parent.studentNames) ? (
                                        <span className="compose-students">{formatStudentNames(parent.studentNames)}</span>
                                    ) : (
                                        <span className="text-muted">{parent.email}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="compose-field">
                        <label>Subject</label>
                        <input
                            type="text"
                            value={composeSubject}
                            onChange={onSubjectChange}
                            maxLength={200}
                            placeholder="Subject"
                        />
                    </div>
                    <div className="compose-field">
                        <label>Message</label>
                        <textarea
                            value={composeBody}
                            onChange={onBodyChange}
                            rows={5}
                            maxLength={5000}
                            placeholder="Write your message..."
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={composeLoading}>
                            {composeLoading ? 'Sending...' : 'Send Message'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ComposeModal;
