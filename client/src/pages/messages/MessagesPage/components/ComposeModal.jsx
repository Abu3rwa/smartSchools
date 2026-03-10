import { HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation(['messages']);
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
                    <h2 id="messages-compose-title">{t('messages:compose.newMessage')}</h2>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('messages:compose.closeAria')}>
                        <HiOutlineX size={18} />
                    </button>
                </div>
                <form className="modal-body" onSubmit={onSubmit}>
                    <div className="compose-field">
                        <label>{t('messages:compose.toClasses')}</label>
                        <div className="class-selection">
                            {loadingClasses && <div className="loading-more">{t('messages:compose.loadingClasses')}</div>}
                            {!loadingClasses && classOptions.length === 0 && (
                                <div className="empty-row">{t('messages:compose.noClasses')}</div>
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
                                                    {formatClassLabel(classOption, t)}
                                                </span>
                                                <span className="class-option-meta">
                                                    {t('messages:compose.classMeta', {
                                                        students: classOption.studentCount || 0,
                                                        parents: classOption.parentCount || 0
                                                    })}
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
                                <span>{t('messages:compose.toParents')}</span>
                            </label>
                            <label className="audience-toggle">
                                <input
                                    type="checkbox"
                                    checked={includeClassStudents}
                                    onChange={onToggleClassStudents}
                                />
                                <span>{t('messages:compose.toStudents')}</span>
                            </label>
                        </div>
                        {selectedClassIds.length > 0 && (
                            <div className="compose-class-preview text-muted">
                                {t('messages:compose.selectedClassesSummary', {
                                    count: selectedClassIds.length,
                                    parents: classAudiencePreview.parents,
                                    students: classAudiencePreview.students
                                })}
                            </div>
                        )}
                    </div>

                    <div className="compose-field">
                        <label>{t('messages:compose.extraParentsLabel')}</label>
                        <input
                            type="text"
                            placeholder={t('messages:compose.searchParentsPlaceholder')}
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
                            {selectedParents.length === 0 && <span className="text-muted">{t('messages:compose.noExtraParent')}</span>}
                        </div>
                        <div className="compose-results">
                            {loadingParents && <div className="loading-more">{t('messages:compose.loadingParents')}</div>}
                            {!loadingParents && parentOptions.length === 0 && (
                                <div className="empty-row">{t('messages:compose.noParentsFound')}</div>
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
                        <label>{t('messages:compose.subject')}</label>
                        <input
                            type="text"
                            value={composeSubject}
                            onChange={onSubjectChange}
                            maxLength={200}
                            placeholder={t('messages:compose.subject')}
                        />
                    </div>
                    <div className="compose-field">
                        <label>{t('messages:compose.message')}</label>
                        <textarea
                            value={composeBody}
                            onChange={onBodyChange}
                            rows={5}
                            maxLength={5000}
                            placeholder={t('messages:compose.messagePlaceholder')}
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('messages:compose.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={composeLoading}>
                            {composeLoading ? t('messages:compose.sending') : t('messages:compose.sendMessage')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ComposeModal;
