import { format } from 'date-fns';
import { HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation(['gradebook']);
    if (!open) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{t('gradebook:addModal.title')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        <HiOutlineX />
                    </button>
                </div>

                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('gradebook:addModal.date')}</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                                    max={format(new Date(), 'yyyy-MM-dd')}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>{t('gradebook:addModal.category')}</label>
                                <select
                                    value={formData.category}
                                    onChange={(event) => setFormData({ ...formData, category: event.target.value })}
                                    required
                                >
                                    {CATEGORY_FILTER_OPTIONS.map((category) => (
                                        <option key={category} value={category}>
                                            {t(`gradebook:categories.${category}`, { defaultValue: category })}
                                        </option>
                                    ))}
                                    <option value="Custom">{t('gradebook:addModal.customCategory')}</option>
                                </select>

                                {formData.category === 'Custom' && (
                                    <input
                                        type="text"
                                        placeholder={t('gradebook:addModal.customCategoryPlaceholder')}
                                        value={formData.customCategory}
                                        onChange={(event) => setFormData({ ...formData, customCategory: event.target.value })}
                                        className="mt-sm"
                                        required
                                    />
                                )}
                            </div>

                            <div className="form-group">
                                <label>{t('gradebook:addModal.maxMarks')}</label>
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
                            <label>{t('gradebook:addModal.titleOptional')}</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                                placeholder={t('gradebook:addModal.titlePlaceholder')}
                            />
                        </div>

                        <div className="grades-table-container">
                            <table className="grades-entry-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>{t('gradebook:addModal.columns.student')}</th>
                                        <th>{t('gradebook:addModal.columns.marks', { maxMarks: formData.maxMarks })}</th>
                                        <th>{t('gradebook:addModal.columns.notes')}</th>
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
                                                    placeholder={t('gradebook:common.emptySymbol')}
                                                />
                                            </td>

                                            <td>
                                                <input
                                                    type="text"
                                                    className="notes-input"
                                                    value={formData.studentGrades[student._id]?.notes || ''}
                                                    onChange={(event) => onGradeChange(student._id, 'notes', event.target.value)}
                                                    placeholder={t('gradebook:addModal.notePlaceholder')}
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
                            {t('gradebook:common.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {t('gradebook:addModal.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddGradesModal;
