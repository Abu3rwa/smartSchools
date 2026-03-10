import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { GRADE_CATEGORY_OPTIONS } from '../constants';

const GradeEntrySelectionForm = ({
    selectedClass,
    onClassChange,
    selectedSubject,
    onSubjectChange,
    selectedCategory,
    onCategoryChange,
    customCategory,
    onCustomCategoryChange,
    selectedDate,
    onDateChange,
    maxMarks,
    onMaxMarksChange,
    availableClasses,
    availableSubjects
}) => {
    const { t } = useTranslation(['grades']);

    return (
        <div className="card selection-card">
            <div className="selection-grid">
                <div className="form-group">
                    <label>{t('grades:entry.form.selectClass')}</label>
                    <select value={selectedClass} onChange={(event) => onClassChange(event.target.value)} required>
                        <option value="">{t('grades:entry.form.chooseClass')}</option>
                        {availableClasses.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('grades:entry.form.selectSubject')}</label>
                    <select
                        value={selectedSubject}
                        onChange={(event) => onSubjectChange(event.target.value)}
                        required
                        disabled={!selectedClass}
                    >
                        <option value="">{t('grades:entry.form.chooseSubject')}</option>
                        {availableSubjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name} ({subject.code})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('grades:entry.form.category')}</label>
                    <div className="category-selection">
                        <select value={selectedCategory} onChange={(event) => onCategoryChange(event.target.value)} required>
                            {GRADE_CATEGORY_OPTIONS.map((category) => (
                                <option key={category} value={category}>
                                    {t(`grades:categories.${category}`, { defaultValue: category })}
                                </option>
                            ))}
                            <option value="Custom">{t('grades:entry.form.customCategory')}</option>
                        </select>

                        {selectedCategory === 'Custom' && (
                            <input
                                type="text"
                                placeholder={t('grades:entry.form.customCategoryPlaceholder')}
                                value={customCategory}
                                onChange={(event) => onCustomCategoryChange(event.target.value)}
                                className="mt-sm"
                                required
                            />
                        )}
                    </div>
                </div>

                <div className="form-group">
                    <label>{t('grades:entry.form.date')}</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => onDateChange(event.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                    />
                </div>

                <div className="form-group">
                    <label>{t('grades:entry.form.maxMarks')}</label>
                    <input
                        type="number"
                        value={maxMarks}
                        onChange={(event) => onMaxMarksChange(Number(event.target.value))}
                        min={1}
                        max={100}
                    />
                </div>
            </div>
        </div>
    );
};

export default GradeEntrySelectionForm;
