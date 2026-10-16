import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineDownload, HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import LessonPlanLinkSelector from '../../../../components/grades/LessonPlanLinkSelector';
import LinkEditor from './LinkEditor';
import AttachmentEditor from './AttachmentEditor';
import GoogleFormQuestionEditor from './GoogleFormQuestionEditor';
import { buildAssignmentCsvTemplate, parseAssignmentCsv } from '../utils/assignmentCsvImport';

const CreateAssignmentForm = ({
    open,
    submitting,
    form,
    setForm,
    assignmentTypes,
    classStudents = [],
    selectedClass,
    selectedSubject,
    isEditing,
    onCancelEdit,
    onClose,
    onSubmit,
    classroom,
    existingClassroomLink,
    googleFormPublished
}) => {
    const { t } = useTranslation(['assignments']);
    const csvInputRef = useRef(null);
    const [importingCsv, setImportingCsv] = useState(false);
    if (!open) return null;
    const selectedType = assignmentTypes.find((item) => String(item.id) === String(form.assignmentTypeId));
    const isGoogleForm = selectedType?.key === 'google_form';

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
            const selectedType = imported.assignmentType
                ? assignmentTypes.find((item) => (
                    String(item.id) === imported.assignmentType
                    || String(item.name || '').trim().toLowerCase() === imported.assignmentType.trim().toLowerCase()
                ))
                : null;
            if (imported.assignmentType && !selectedType) {
                throw new Error(t('assignments:import.assignmentTypeNotFound'));
            }
            const fields = Object.fromEntries(
                Object.entries(imported).filter(([key]) => key !== 'assignmentType')
            );
            setForm((current) => ({
                ...current,
                ...fields,
                ...(selectedType ? { assignmentTypeId: selectedType.id } : {})
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

    return (
        <form className="create-form card" onSubmit={onSubmit}>
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlinePlus />
                    {isEditing ? t('assignments:form.editTitle') : t('assignments:form.createTitle')}
                </h3>
                {!isEditing && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={submitting}>
                        {t('assignments:actions.cancelCreate')}
                    </button>
                )}
            </div>

            {!isEditing && (
                <details className="assignment-csv-import">
                    <summary>{t('assignments:import.title')}</summary>
                    <div className="assignment-csv-import__content">
                        <div>
                            <p>{t('assignments:import.description')}</p>
                            <p>{t('assignments:import.templateHelp')}</p>
                        </div>
                        <div className="assignment-csv-import__actions">
                            <button type="button" className="btn btn-outline" onClick={downloadTemplate} disabled={submitting || importingCsv}>
                                <HiOutlineDownload />
                                {t('assignments:import.downloadTemplate')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => csvInputRef.current?.click()}
                                disabled={!selectedClass || !selectedSubject || submitting || importingCsv}
                            >
                                <HiOutlineUpload />
                                {importingCsv ? t('assignments:import.importing') : t('assignments:import.chooseFile')}
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

            <div className="create-grid">
                <div className="form-group">
                    <label>{t('assignments:form.type')}</label>
                    <select
                        value={form.assignmentTypeId}
                        onChange={(event) => setForm((prev) => ({ ...prev, assignmentTypeId: event.target.value }))}
                    >
                        {assignmentTypes.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>{t('assignments:form.title')}</label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder={t('assignments:form.titlePlaceholder')}
                    />
                </div>
                <div className="form-group">
                    <label>{t('assignments:form.dueDate')}</label>
                    <input
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    />
                </div>
                <div className="form-group">
                    <label>{t('assignments:form.maxMarks')}</label>
                    <input
                        type="number"
                        min={1}
                        max={1000}
                        value={form.maxMarks}
                        onChange={(event) => setForm((prev) => ({ ...prev, maxMarks: event.target.value }))}
                    />
                </div>
                <div className="form-group full">
                    <label>{t('assignments:form.instructions')}</label>
                    <textarea
                        rows={3}
                        value={form.instructions}
                        onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
                        placeholder={t('assignments:form.instructionsPlaceholder')}
                    />
                </div>
                <div className="form-group full">
                    <LessonPlanLinkSelector
                        classId={selectedClass}
                        subjectId={selectedSubject}
                        selectedLessonPlanIds={form.lessonPlanIds || []}
                        onChange={(lessonPlanIds) => setForm((prev) => ({ ...prev, lessonPlanIds }))}
                        disabled={submitting}
                    />
                </div>
                <div className="form-group full">
                    <LinkEditor
                        links={form.links || []}
                        onChange={(links) => setForm((prev) => ({ ...prev, links }))}
                        disabled={submitting}
                        classId={selectedClass}
                        subjectId={selectedSubject}
                    />
                </div>
                <div className="form-group full">
                    <AttachmentEditor
                        attachmentFiles={form.attachmentFiles || []}
                        existingAttachments={form.existingAttachments || []}
                        onFilesChange={(attachmentFiles) => setForm((prev) => ({ ...prev, attachmentFiles }))}
                        onRemoveExisting={(id) => setForm((prev) => ({
                            ...prev,
                            existingAttachments: (prev.existingAttachments || []).filter((att) => att._id !== id),
                            removeAttachmentIds: [...(prev.removeAttachmentIds || []), id]
                        }))}
                        disabled={submitting}
                    />
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
                                onChange={() => setForm((prev) => ({ ...prev, scope: 'class', studentIds: [] }))}
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
                                onChange={() => setForm((prev) => ({ ...prev, scope: 'selected_students' }))}
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
                                {classStudents.length === 0 && <p className="text-muted">{t('assignments:googleForms.noStudents')}</p>}
                            </div>
                        )}
                    </div>
                    <GoogleFormQuestionEditor
                        questions={form.googleFormQuestions || []}
                        onChange={(googleFormQuestions) => setForm((prev) => ({ ...prev, googleFormQuestions }))}
                        disabled={submitting || googleFormPublished}
                    />
                </>
            )}

            <div className="create-options">
                <label><input type="checkbox" checked={form.publishNow} onChange={(event) => setForm((prev) => ({ ...prev, publishNow: event.target.checked }))} /> {t('assignments:form.publishNow')}</label>
                <label><input type="checkbox" checked={form.notifyOnAssign} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnAssign: event.target.checked }))} /> {t('assignments:form.notifyOnAssign')}</label>
                <label className="notify-audience-field">
                    <span>{t('assignments:form.notifyAudience')}</span>
                    <select
                        value={form.notifyAudience || 'both'}
                        onChange={(event) => setForm((prev) => ({ ...prev, notifyAudience: event.target.value }))}
                        disabled={submitting || !form.notifyOnAssign}
                    >
                        <option value="both">{t('assignments:audience.both')}</option>
                        <option value="students">{t('assignments:audience.students')}</option>
                        <option value="parents">{t('assignments:audience.parents')}</option>
                    </select>
                </label>
                <label><input type="checkbox" checked={form.notifyOnGrade} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnGrade: event.target.checked }))} /> {t('assignments:form.notifyOnGrade')}</label>
                {classroom?.canUse && (
                    existingClassroomLink ? (
                        <p className="classroom-option classroom-option--status">
                            {t('assignments:classroom.form.alreadyPosted', {
                                state: t(`assignments:classroom.states.${existingClassroomLink.syncState}`, {
                                    defaultValue: existingClassroomLink.syncState
                                })
                            })}
                        </p>
                    ) : (
                        <label className="classroom-option">
                            <input
                                type="checkbox"
                                checked={Boolean(form.classroomPublish) && classroom.ready}
                                disabled={submitting || !classroom.ready}
                                onChange={(event) => setForm((prev) => ({ ...prev, classroomPublish: event.target.checked }))}
                            />
                            {' '}
                            {t('assignments:classroom.form.postToClassroom')}
                            <small className="text-muted">
                                {' '}
                                {classroom.ready
                                    ? t('assignments:classroom.form.willPostTo', { course: classroom.mapping?.courseName || '' })
                                    : !classroom.connection.connected
                                        ? t('assignments:classroom.form.connectFirst')
                                        : t('assignments:classroom.form.mapFirst')}
                            </small>
                        </label>
                    )
                )}
            </div>

            <div className="card-footer">
                {isEditing && (
                    <button type="button" className="btn btn-outline" onClick={onCancelEdit} disabled={submitting}>
                        {t('assignments:actions.cancelEdit')}
                    </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    <HiOutlineUpload />
                    {submitting
                        ? t('assignments:common.saving')
                        : (isEditing ? t('assignments:actions.saveChanges') : t('assignments:actions.createAssignment'))}
                </button>
            </div>
        </form>
    );
};

export default CreateAssignmentForm;
