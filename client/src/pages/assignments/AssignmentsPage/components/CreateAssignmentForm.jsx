import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const CreateAssignmentForm = ({
    open,
    submitting,
    form,
    setForm,
    assignmentTypes,
    isEditing,
    onCancelEdit,
    onSubmit
}) => {
    const { t } = useTranslation(['assignments']);
    if (!open) return null;

    return (
        <form className="create-form card" onSubmit={onSubmit}>
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlinePlus />
                    {isEditing ? t('assignments:form.editTitle') : t('assignments:form.createTitle')}
                </h3>
            </div>

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
            </div>

            <div className="create-options">
                <label><input type="checkbox" checked={form.publishNow} onChange={(event) => setForm((prev) => ({ ...prev, publishNow: event.target.checked }))} /> {t('assignments:form.publishNow')}</label>
                <label><input type="checkbox" checked={form.notifyOnAssign} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnAssign: event.target.checked }))} /> {t('assignments:form.notifyOnAssign')}</label>
                <label><input type="checkbox" checked={form.notifyOnGrade} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnGrade: event.target.checked }))} /> {t('assignments:form.notifyOnGrade')}</label>
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
