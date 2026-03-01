import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';

const CreateAssignmentForm = ({
    open,
    submitting,
    form,
    setForm,
    assignmentTypes,
    onSubmit
}) => {
    if (!open) return null;

    return (
        <form className="create-form card" onSubmit={onSubmit}>
            <div className="card-header">
                <h3 className="card-title">
                    <HiOutlinePlus />
                    Create Assignment
                </h3>
            </div>

            <div className="create-grid">
                <div className="form-group">
                    <label>Type</label>
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
                    <label>Title</label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="Assignment title"
                    />
                </div>
                <div className="form-group">
                    <label>Due Date</label>
                    <input
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    />
                </div>
                <div className="form-group">
                    <label>Max Marks</label>
                    <input
                        type="number"
                        min={1}
                        max={1000}
                        value={form.maxMarks}
                        onChange={(event) => setForm((prev) => ({ ...prev, maxMarks: event.target.value }))}
                    />
                </div>
                <div className="form-group full">
                    <label>Instructions</label>
                    <textarea
                        rows={3}
                        value={form.instructions}
                        onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
                        placeholder="Assignment instructions"
                    />
                </div>
            </div>

            <div className="create-options">
                <label><input type="checkbox" checked={form.publishNow} onChange={(event) => setForm((prev) => ({ ...prev, publishNow: event.target.checked }))} /> Publish now</label>
                <label><input type="checkbox" checked={form.notifyOnAssign} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnAssign: event.target.checked }))} /> Notify on assign</label>
                <label><input type="checkbox" checked={form.notifyOnGrade} onChange={(event) => setForm((prev) => ({ ...prev, notifyOnGrade: event.target.checked }))} /> Notify on grade</label>
            </div>

            <div className="card-footer">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    <HiOutlineUpload />
                    {submitting ? 'Saving...' : 'Create Assignment'}
                </button>
            </div>
        </form>
    );
};

export default CreateAssignmentForm;
