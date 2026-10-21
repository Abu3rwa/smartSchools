import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    HiOutlineDownload,
    HiOutlineInformationCircle,
    HiOutlinePlus,
    HiOutlineUpload,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import LessonPlanLinkSelector from '../../../../components/grades/LessonPlanLinkSelector';
import LinkEditor from './LinkEditor';
import AttachmentEditor from './AttachmentEditor';
import GoogleFormQuestionEditor from './GoogleFormQuestionEditor';
import { buildAssignmentCsvTemplate, parseAssignmentCsv } from '../utils/assignmentCsvImport';

const uniqueById = (items = []) => (
    Array.from(new Map((items || [])
        .filter((item) => item?._id)
        .map((item) => [String(item._id), item])).values())
);

const CreateAssignmentForm = ({
    open,
    submitting,
    form,
    setForm,
    assignmentTypes,
    classStudents = [],
    selectedClass,
    selectedSubject,
    availableClasses = [],
    availableSubjects = [],
    onClassChange,
    onSubjectChange,
    isEditing,
    onCancelEdit,
    onClose,
    onSubmit,
    classroom,
    existingClassroomLink,
    googleFormPublished,
    startWithImport = false
}) => {
    const { t } = useTranslation(['assignments']);
    const csvInputRef = useRef(null);
    const titleInputRef = useRef(null);
    const bodyRef = useRef(null);
    const googleFormRef = useRef(null);
    const publishingRef = useRef(null);
    const resourcesRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const [importingCsv, setImportingCsv] = useState(false);
    const [csvOpen, setCsvOpen] = useState(false);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const focusTimer = window.setTimeout(() => {
            titleInputRef.current?.focus();
        }, 80);
        return () => window.clearTimeout(focusTimer);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !submitting) onCloseRef.current?.();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, submitting]);

    useEffect(() => {
        if (open) setCsvOpen(startWithImport);
    }, [open, startWithImport]);

    if (!open) return null;

    const isGoogleForm = Boolean(form.createGoogleForm || googleFormPublished);
    const classes = uniqueById(availableClasses);
    const subjects = uniqueById(availableSubjects);

    const handleCsvImport = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!selectedClass || !selectedSubject) {
            toast.error(t('assignments:import.selectClassSubject'));
            return;
        }
        if (!/\.csv$/i.test(file.name)) {
            toast.error(t('assignments:import.invalidFile'));
            return;
        }
        if (file.size > 900 * 1024) {
            toast.error(t('assignments:import.fileTooLarge'));
            return;
        }

        setImportingCsv(true);
        try {
            const imported = parseAssignmentCsv(await file.text());
            const importedType = imported.assignmentType
                ? assignmentTypes.find((item) => (
                    String(item.id) === imported.assignmentType
                    || String(item.name || '').trim().toLowerCase() === imported.assignmentType.trim().toLowerCase()
                ))
                : null;
            if (imported.assignmentType && !importedType) {
                throw new Error(t('assignments:import.assignmentTypeNotFound'));
            }
            const fields = Object.fromEntries(
                Object.entries(imported).filter(([key]) => key !== 'assignmentType')
            );
            setForm((current) => ({
                ...current,
                ...fields,
                ...(importedType ? { assignmentTypeId: importedType.id } : {})
            }));
            toast.success(t('assignments:import.formLoaded', { name: file.name }));
        } catch (error) {
            toast.error(error.message || t('assignments:import.failed'));
        } finally {
            setImportingCsv(false);
        }
    };

    const downloadTemplate = () => {
        const blob = new Blob([buildAssignmentCsvTemplate()], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'assignment-import-template.csv';
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    const closeIfAllowed = () => {
        if (!submitting) onClose();
    };

    const scrollToSection = (sectionRef) => {
        const body = bodyRef.current;
        if (!body) return;
        if (!sectionRef) {
            body.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        const target = sectionRef.current;
        if (!target) return;
        const bodyBox = body.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        body.scrollTo({
            top: body.scrollTop + targetBox.top - bodyBox.top - 8,
            behavior: 'smooth'
        });
    };

    return (
        <>
            <div
                className="assignments-drawer-overlay"
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeIfAllowed();
                }}
                aria-hidden="true"
            />
            <aside
                className="assignments-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="assignment-drawer-title"
            >
                <form className="assignments-drawer__form" onSubmit={onSubmit}>
                    <header className="assignments-drawer__head">
                        <div>
                            <div className="assignments-drawer__eyebrow">
                                {isEditing
                                    ? t('assignments:drawer.editEyebrow')
                                    : t('assignments:drawer.newEyebrow')}
                            </div>
                            <h2 id="assignment-drawer-title">
                                {isEditing
                                    ? t('assignments:form.editTitle')
                                    : t('assignments:form.createTitle')}
                            </h2>
                        </div>
                        <button
                            type="button"
                            className="assignments-icon-btn assignments-drawer__close"
                            onClick={closeIfAllowed}
                            disabled={submitting}
                            aria-label={t('assignments:drawer.close')}
                        >
                            <HiOutlineX />
                        </button>
                    </header>

                    <nav className="assignments-drawer__nav" aria-label={t('assignments:drawer.sections')}>
                        <button type="button" onClick={() => scrollToSection(null)}>
                            {t('assignments:drawer.detailsSection')}
                        </button>
                        <button type="button" onClick={() => scrollToSection(googleFormRef)}>
                            {t('assignments:drawer.googleFormSection')}
                        </button>
                        <button type="button" onClick={() => scrollToSection(publishingRef)}>
                            {t('assignments:drawer.publishingOptions')}
                        </button>
                        <button type="button" onClick={() => scrollToSection(resourcesRef)}>
                            {t('assignments:drawer.resourcesNav')}
                        </button>
                    </nav>

                    <div className="assignments-drawer__body" ref={bodyRef}>
                        <div className="assignments-drawer__grid">
                            <label className="assignments-field">
                                <span>{t('assignments:drawer.class')}</span>
                                <select
                                    value={selectedClass}
                                    onChange={(event) => onClassChange?.(event.target.value)}
                                    disabled={submitting || isEditing}
                                >
                                    <option value="">{t('assignments:filters.selectClass')}</option>
                                    {classes.map((item) => (
                                        <option key={item._id} value={item._id}>{item.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="assignments-field">
                                <span>{t('assignments:drawer.subject')}</span>
                                <select
                                    value={selectedSubject}
                                    onChange={(event) => onSubjectChange?.(event.target.value)}
                                    disabled={submitting || isEditing}
                                >
                                    <option value="">{t('assignments:filters.allSubjects')}</option>
                                    {subjects.map((item) => (
                                        <option key={item._id} value={item._id}>{item.name}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        {(!selectedClass || !selectedSubject) && !isEditing && (
                            <p className="assignments-drawer__notice">
                                {t('assignments:drawer.classSubjectRequired')}
                            </p>
                        )}

                        {!isEditing && (
                            <details
                                className="assignment-csv-import"
                                open={csvOpen}
                                onToggle={(event) => setCsvOpen(event.currentTarget.open)}
                            >
                                <summary>{t('assignments:import.title')}</summary>
                                <div className="assignment-csv-import__content">
                                    <div>
                                        <p>{t('assignments:import.description')}</p>
                                        <p>{t('assignments:import.templateHelp')}</p>
                                    </div>
                                    <div className="assignment-csv-import__actions">
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={downloadTemplate}
                                            disabled={submitting || importingCsv}
                                        >
                                            <HiOutlineDownload />
                                            {t('assignments:import.downloadTemplate')}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => csvInputRef.current?.click()}
                                            disabled={!selectedClass || !selectedSubject || submitting || importingCsv}
                                        >
                                            <HiOutlineUpload />
                                            {importingCsv
                                                ? t('assignments:import.importing')
                                                : t('assignments:import.chooseFile')}
                                        </button>
                                        <input
                                            ref={csvInputRef}
                                            type="file"
                                            accept=".csv,text/csv"
                                            hidden
                                            aria-label={t('assignments:import.chooseFile')}
                                            onChange={handleCsvImport}
                                        />
                                    </div>
                                </div>
                            </details>
                        )}

                        <div className="assignments-form-grid">
                            <div className="assignments-field">
                                <label>{t('assignments:form.type')}</label>
                                <select
                                    value={form.assignmentTypeId}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        assignmentTypeId: event.target.value
                                    }))}
                                    disabled={submitting}
                                >
                                    {assignmentTypes.map((item) => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="assignments-field">
                                <label>{t('assignments:form.maxMarks')}</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={form.maxMarks}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        maxMarks: event.target.value
                                    }))}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="assignments-field assignments-form-grid__full">
                                <label>{t('assignments:form.title')}</label>
                                <input
                                    ref={titleInputRef}
                                    type="text"
                                    value={form.title}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        title: event.target.value
                                    }))}
                                    placeholder={t('assignments:form.titlePlaceholder')}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="assignments-field assignments-form-grid__full">
                                <label>{t('assignments:form.dueDate')}</label>
                                <input
                                    type="date"
                                    value={form.dueDate}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        dueDate: event.target.value
                                    }))}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="assignments-field assignments-form-grid__full">
                                <label>{t('assignments:form.instructions')}</label>
                                <textarea
                                    rows={4}
                                    value={form.instructions}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        instructions: event.target.value
                                    }))}
                                    placeholder={t('assignments:form.instructionsPlaceholder')}
                                    disabled={submitting}
                                />
                            </div>
                        </div>

                        <div className="assignments-drawer__section-label" ref={googleFormRef}>
                            {t('assignments:drawer.googleFormSection')}
                        </div>
                        <div className="assignments-option-card">
                            <div className="assignments-option-row">
                                <div className="assignments-option-row__copy">
                                    <strong>{t('assignments:googleForms.createForm')}</strong>
                                    <span>{t('assignments:googleForms.createFormHelp')}</span>
                                </div>
                                <label className="assignments-switch">
                                    <input
                                        type="checkbox"
                                        checked={isGoogleForm}
                                        disabled={submitting || googleFormPublished}
                                        onChange={(event) => setForm((prev) => ({
                                            ...prev,
                                            createGoogleForm: event.target.checked,
                                            ...(event.target.checked
                                                ? {}
                                                : { googleFormQuestions: [], scope: 'class', studentIds: [] })
                                        }))}
                                    />
                                    <span className="assignments-switch__track" aria-hidden="true" />
                                </label>
                            </div>
                        </div>

                        {isGoogleForm && (
                            <>
                                <div className="google-form-assignment-scope">
                                    <h4>{t('assignments:googleForms.assignmentScope')}</h4>
                                    <label>
                                        <input
                                            type="radio"
                                            name="google-form-scope"
                                            value="class"
                                            checked={form.scope !== 'selected_students'}
                                            disabled={submitting || googleFormPublished}
                                            onChange={() => setForm((prev) => ({
                                                ...prev,
                                                scope: 'class',
                                                studentIds: []
                                            }))}
                                        />
                                        {t('assignments:googleForms.assignToClass')}
                                    </label>
                                    <label>
                                        <input
                                            type="radio"
                                            name="google-form-scope"
                                            value="selected_students"
                                            checked={form.scope === 'selected_students'}
                                            disabled={submitting || googleFormPublished}
                                            onChange={() => setForm((prev) => ({
                                                ...prev,
                                                scope: 'selected_students'
                                            }))}
                                        />
                                        {t('assignments:googleForms.assignToSelected')}
                                    </label>
                                    {form.scope === 'selected_students' && (
                                        <div className="google-form-assignment-scope__students">
                                            {classStudents
                                                .filter((student) => String(student.currentClass || '') === String(selectedClass))
                                                .map((student) => {
                                                    const id = String(student._id || student.id);
                                                    const checked = (form.studentIds || []).some((value) => String(value) === id);
                                                    return (
                                                        <label key={id}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={submitting || googleFormPublished}
                                                                onChange={(event) => setForm((prev) => ({
                                                                    ...prev,
                                                                    studentIds: event.target.checked
                                                                        ? [...new Set([...(prev.studentIds || []).map(String), id])]
                                                                        : (prev.studentIds || []).filter((value) => String(value) !== id)
                                                                }))}
                                                            />
                                                            {student.firstName} {student.lastName} ({student.studentId})
                                                        </label>
                                                    );
                                                })}
                                            {classStudents.length === 0 && (
                                                <p className="text-muted">{t('assignments:googleForms.noStudents')}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <GoogleFormQuestionEditor
                                    questions={form.googleFormQuestions || []}
                                    onChange={(googleFormQuestions) => setForm((prev) => ({
                                        ...prev,
                                        googleFormQuestions
                                    }))}
                                    disabled={submitting || googleFormPublished}
                                />
                            </>
                        )}

                        <div className="assignments-drawer__section-label" ref={publishingRef}>
                            {t('assignments:drawer.publishingOptions')}
                        </div>
                        <div className="assignments-option-card">
                            <div className="assignments-option-row">
                                <div className="assignments-option-row__copy">
                                    <strong>{t('assignments:drawer.notifyFamilies')}</strong>
                                    <span>{t('assignments:drawer.notifyFamiliesHelp')}</span>
                                </div>
                                <label className="assignments-switch">
                                    <input
                                        type="checkbox"
                                        checked={form.notifyOnAssign}
                                        disabled={submitting}
                                        onChange={(event) => setForm((prev) => ({
                                            ...prev,
                                            notifyOnAssign: event.target.checked
                                        }))}
                                    />
                                    <span className="assignments-switch__track" aria-hidden="true" />
                                </label>
                            </div>
                            {form.notifyOnAssign && (
                                <div className="assignments-option-row assignments-option-row--stack">
                                    <label htmlFor="assignment-notify-audience">
                                        {t('assignments:form.notifyAudience')}
                                    </label>
                                    <select
                                        id="assignment-notify-audience"
                                        value={form.notifyAudience || 'both'}
                                        onChange={(event) => setForm((prev) => ({
                                            ...prev,
                                            notifyAudience: event.target.value
                                        }))}
                                        disabled={submitting}
                                    >
                                        <option value="both">{t('assignments:audience.both')}</option>
                                        <option value="students">{t('assignments:audience.students')}</option>
                                        <option value="parents">{t('assignments:audience.parents')}</option>
                                    </select>
                                </div>
                            )}
                            <div className="assignments-option-row">
                                <div className="assignments-option-row__copy">
                                    <strong>{t('assignments:drawer.notifyOnGrade')}</strong>
                                    <span>{t('assignments:drawer.notifyOnGradeHelp')}</span>
                                </div>
                                <label className="assignments-switch">
                                    <input
                                        type="checkbox"
                                        checked={form.notifyOnGrade}
                                        disabled={submitting}
                                        onChange={(event) => setForm((prev) => ({
                                            ...prev,
                                            notifyOnGrade: event.target.checked
                                        }))}
                                    />
                                    <span className="assignments-switch__track" aria-hidden="true" />
                                </label>
                            </div>
                            {classroom?.canUse && (
                                existingClassroomLink ? (
                                    <div className="assignments-option-row">
                                        <div className="assignments-option-row__copy">
                                            <strong>{t('assignments:classroom.form.postToClassroom')}</strong>
                                            <span>
                                                {t('assignments:classroom.form.alreadyPosted', {
                                                    state: t(`assignments:classroom.states.${existingClassroomLink.syncState}`, {
                                                        defaultValue: existingClassroomLink.syncState
                                                    })
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="assignments-option-row">
                                        <div className="assignments-option-row__copy">
                                            <strong>{t('assignments:classroom.form.postToClassroom')}</strong>
                                            <span>
                                                {classroom.ready
                                                    ? t('assignments:classroom.form.willPostTo', {
                                                        course: classroom.mapping?.courseName || ''
                                                    })
                                                    : !classroom.connection.connected
                                                        ? t('assignments:classroom.form.connectFirst')
                                                        : t('assignments:classroom.form.mapFirst')}
                                            </span>
                                        </div>
                                        <label className="assignments-switch">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(form.classroomPublish) && classroom.ready}
                                                disabled={submitting || !classroom.ready}
                                                onChange={(event) => setForm((prev) => ({
                                                    ...prev,
                                                    classroomPublish: event.target.checked
                                                }))}
                                            />
                                            <span className="assignments-switch__track" aria-hidden="true" />
                                        </label>
                                    </div>
                                )
                            )}
                        </div>

                        <div className="assignments-drawer__section-label" ref={resourcesRef}>
                            {t('assignments:drawer.resourcesSection')}
                        </div>
                        <div className="assignments-form-grid">
                            <div className="assignments-field assignments-form-grid__full">
                                <LessonPlanLinkSelector
                                    classId={selectedClass}
                                    subjectId={selectedSubject}
                                    selectedLessonPlanIds={form.lessonPlanIds || []}
                                    onChange={(lessonPlanIds) => setForm((prev) => ({ ...prev, lessonPlanIds }))}
                                    disabled={submitting}
                                />
                            </div>
                            <div className="assignments-field assignments-form-grid__full">
                                <LinkEditor
                                    links={form.links || []}
                                    onChange={(links) => setForm((prev) => ({ ...prev, links }))}
                                    disabled={submitting}
                                    classId={selectedClass}
                                    subjectId={selectedSubject}
                                />
                            </div>
                            <div className="assignments-field assignments-form-grid__full">
                                <AttachmentEditor
                                    attachmentFiles={form.attachmentFiles || []}
                                    existingAttachments={form.existingAttachments || []}
                                    onFilesChange={(attachmentFiles) => setForm((prev) => ({
                                        ...prev,
                                        attachmentFiles
                                    }))}
                                    onRemoveExisting={(id) => setForm((prev) => ({
                                        ...prev,
                                        existingAttachments: (prev.existingAttachments || []).filter((att) => att._id !== id),
                                        removeAttachmentIds: [...(prev.removeAttachmentIds || []), id]
                                    }))}
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    </div>

                    <footer className="assignments-drawer__foot">
                        <p className="assignments-drawer__hint">
                            <HiOutlineInformationCircle aria-hidden="true" />
                            <span>
                                {isEditing
                                    ? t('assignments:drawer.editHint')
                                    : t('assignments:drawer.publishHint')}
                            </span>
                        </p>
                        <div className="assignments-drawer__buttons">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={closeIfAllowed}
                                disabled={submitting}
                            >
                                {isEditing
                                    ? t('assignments:actions.cancelEdit')
                                    : t('assignments:actions.cancelCreate')}
                            </button>
                            <div className="assignments-drawer__buttons-right">
                                {!isEditing && (
                                    <button
                                        type="submit"
                                        name="submitAction"
                                        value="draft"
                                        className="btn btn-secondary"
                                        disabled={submitting}
                                    >
                                        {t('assignments:drawer.saveDraft')}
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    name="submitAction"
                                    value={isEditing ? 'save' : 'publish'}
                                    className="btn btn-primary"
                                    disabled={submitting}
                                >
                                    <HiOutlineUpload />
                                    {submitting
                                        ? t('assignments:common.saving')
                                        : isEditing
                                            ? t('assignments:actions.saveChanges')
                                            : t('assignments:drawer.publishAssignment')}
                                </button>
                            </div>
                        </div>
                    </footer>
                </form>
            </aside>
        </>
    );
};

export default CreateAssignmentForm;
