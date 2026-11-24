import { useMemo } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const getClassLabels = (availableClasses) => {
    const nameCounts = new Map();
    for (const item of availableClasses) {
        nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1);
    }
    const labels = new Map();
    for (const item of availableClasses) {
        const disambiguate = nameCounts.get(item.name) > 1 && item.academicYear;
        labels.set(item._id, disambiguate
            ? `${item.name} · ${item.academicYear}`
            : item.name);
    }
    return labels;
};

const GradeEntrySelectionForm = ({
    selectedClass,
    onClassChange,
    selectedSubject,
    onSubjectChange,
    selectedDate,
    onDateChange,
    maxMarks,
    onMaxMarksChange,
    availableClasses,
    availableSubjects,
    lessonSlot = null,
    noticeSlot = null,
    disabled = false
}) => {
    const { t } = useTranslation(['grades']);
    const classLabels = useMemo(() => getClassLabels(availableClasses), [availableClasses]);
    const maxMarksInvalid = !Number.isFinite(maxMarks) || maxMarks < 1 || maxMarks > 100;

    return (
        <>
            <div className="grade-setup-fields selection-grid">
                <div className="form-group selection-field selection-field--class">
                    <label htmlFor="grade-class">{t('grades:entry.form.selectClass')}</label>
                    <select id="grade-class" value={selectedClass} onChange={(event) => onClassChange(event.target.value)} required disabled={disabled}>
                        <option value="">{t('grades:entry.form.chooseClass')}</option>
                        {availableClasses.map((item) => (
                            <option key={item._id} value={item._id}>{classLabels.get(item._id) || item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group selection-field selection-field--subject">
                    <label htmlFor="grade-subject">{t('grades:entry.form.selectSubject')}</label>
                    <select
                        id="grade-subject"
                        value={selectedSubject}
                        onChange={(event) => onSubjectChange(event.target.value)}
                        required
                        disabled={!selectedClass || disabled}
                    >
                        <option value="">{t('grades:entry.form.chooseSubject')}</option>
                        {availableSubjects.map((subject) => (
                            <option key={subject._id} value={subject._id}>
                                {subject.name} ({subject.code})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group selection-field selection-field--date">
                    <label htmlFor="grade-date">{t('grades:entry.form.date')}</label>
                    <input
                        id="grade-date"
                        type="date"
                        value={selectedDate}
                        onChange={(event) => onDateChange(event.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        disabled={disabled}
                    />
                </div>

                <div className="form-group selection-field selection-field--max">
                    <label htmlFor="grade-max-marks">{t('grades:entry.form.maxMarks')}</label>
                    <input
                        id="grade-max-marks"
                        type="number"
                        inputMode="decimal"
                        value={maxMarks}
                        onChange={(event) => onMaxMarksChange(Number(event.target.value))}
                        min={1}
                        max={100}
                        aria-invalid={maxMarksInvalid}
                        aria-describedby={maxMarksInvalid ? 'grade-max-marks-error' : undefined}
                        disabled={disabled}
                    />
                    {maxMarksInvalid && (
                        <span id="grade-max-marks-error" className="setup-field-error">
                            {t('grades:entry.validation.maxMarksInvalid')}
                        </span>
                    )}
                </div>
            </div>

            {noticeSlot}

            {lessonSlot && (
                <div className="grade-setup-lesson">{lessonSlot}</div>
            )}
        </>
    );
};

export default GradeEntrySelectionForm;
