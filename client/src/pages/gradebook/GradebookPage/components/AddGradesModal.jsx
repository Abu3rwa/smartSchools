import { format } from 'date-fns';
import { HiOutlineX } from 'react-icons/hi';
import { CATEGORY_FILTER_OPTIONS } from '../constants';

const AddGradesModal = ({
    open,
    formData,
    setFormData,
    students,
    onGradeChange,
    onClose,
    onSubmit
}) => {
    if (!open) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>Add Grades</h3>
                    <button className="modal-close" onClick={onClose}>
                        <HiOutlineX />
                    </button>
                </div>

                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Date *</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                                    max={format(new Date(), 'yyyy-MM-dd')}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Category *</label>
                                <select
                                    value={formData.category}
                                    onChange={(event) => setFormData({ ...formData, category: event.target.value })}
                                    required
                                >
                                    {CATEGORY_FILTER_OPTIONS.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                    <option value="Custom">Custom...</option>
                                </select>

                                {formData.category === 'Custom' && (
                                    <input
                                        type="text"
                                        placeholder="Enter category name"
                                        value={formData.customCategory}
                                        onChange={(event) => setFormData({ ...formData, customCategory: event.target.value })}
                                        className="mt-sm"
                                        required
                                    />
                                )}
                            </div>

                            <div className="form-group">
                                <label>Max Marks</label>
                                <input
                                    type="number"
                                    value={formData.maxMarks}
                                    onChange={(event) => {
                                        setFormData({ ...formData, maxMarks: Number(event.target.value) });
                                    }}
                                    min={1}
                                    max={100}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Title (Optional)</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                                placeholder="e.g., Chapter 5 Quiz"
                            />
                        </div>

                        <div className="grades-table-container">
                            <table className="grades-entry-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Student</th>
                                        <th>Marks (/{formData.maxMarks})</th>
                                        <th>Notes</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {students.map((student, index) => (
                                        <tr key={student._id}>
                                            <td>{index + 1}</td>
                                            <td>
                                                <div className="student-cell">
                                                    <div className="avatar-sm">
                                                        {student.firstName?.charAt(0)}
                                                        {student.lastName?.charAt(0)}
                                                    </div>
                                                    <span>{student.firstName} {student.lastName}</span>
                                                </div>
                                            </td>

                                            <td>
                                                <input
                                                    type="number"
                                                    className="marks-input"
                                                    value={formData.studentGrades[student._id]?.marks || ''}
                                                    onChange={(event) => onGradeChange(student._id, 'marks', event.target.value)}
                                                    min={0}
                                                    max={formData.maxMarks}
                                                    step={0.5}
                                                    placeholder="-"
                                                />
                                            </td>

                                            <td>
                                                <input
                                                    type="text"
                                                    className="notes-input"
                                                    value={formData.studentGrades[student._id]?.notes || ''}
                                                    onChange={(event) => onGradeChange(student._id, 'notes', event.target.value)}
                                                    placeholder="Add note..."
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Save Grades
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddGradesModal;
