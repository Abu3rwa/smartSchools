import { format } from 'date-fns';
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
    return (
        <div className="card selection-card">
            <div className="selection-grid">
                <div className="form-group">
                    <label>Select Class *</label>
                    <select value={selectedClass} onChange={(event) => onClassChange(event.target.value)} required>
                        <option value="">Choose a class</option>
                        {availableClasses.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Select Subject *</label>
                    <select
                        value={selectedSubject}
                        onChange={(event) => onSubjectChange(event.target.value)}
                        required
                        disabled={!selectedClass}
                    >
                        <option value="">Choose a subject</option>
                        {availableSubjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name} ({subject.code})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Category *</label>
                    <div className="category-selection">
                        <select value={selectedCategory} onChange={(event) => onCategoryChange(event.target.value)} required>
                            {GRADE_CATEGORY_OPTIONS.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                            <option value="Custom">Custom...</option>
                        </select>

                        {selectedCategory === 'Custom' && (
                            <input
                                type="text"
                                placeholder="Enter category name"
                                value={customCategory}
                                onChange={(event) => onCustomCategoryChange(event.target.value)}
                                className="mt-sm"
                                required
                            />
                        )}
                    </div>
                </div>

                <div className="form-group">
                    <label>Date</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => onDateChange(event.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                    />
                </div>

                <div className="form-group">
                    <label>Max Marks</label>
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
