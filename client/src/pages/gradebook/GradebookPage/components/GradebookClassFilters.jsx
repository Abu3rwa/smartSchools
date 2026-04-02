import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const GradebookClassFilters = ({
    classes,
    selectedClassId,
    onClassChange,
    selectedGrade,
    onGradeChange,
    selectedSubjectFilter,
    onSubjectFilterChange
}) => {
    const { t } = useTranslation(['gradebook']);

    const uniqueGrades = useMemo(() => {
        const grades = [...new Set(classes.map((c) => c.grade))].filter(Boolean);
        grades.sort((a, b) => a - b);
        return grades;
    }, [classes]);

    const uniqueSubjects = useMemo(() => {
        const seen = new Map();
        for (const cls of classes) {
            for (const s of cls.subjects || []) {
                const sub = s.subject;
                if (sub && !seen.has(sub._id)) {
                    seen.set(sub._id, sub);
                }
            }
        }
        return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [classes]);

    const filteredClasses = useMemo(() => {
        let result = classes;
        if (selectedGrade) {
            result = result.filter((c) => c.grade === Number(selectedGrade));
        }
        if (selectedSubjectFilter) {
            result = result.filter((c) =>
                (c.subjects || []).some((s) => s.subject?._id === selectedSubjectFilter)
            );
        }
        return result;
    }, [classes, selectedGrade, selectedSubjectFilter]);

    return (
        <div className="gradebook-class-filters">
            <div className="form-group">
                <label>{t('gradebook:classFilters.grade', { defaultValue: 'Grade' })}</label>
                <select value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)}>
                    <option value="">{t('gradebook:classFilters.allGrades', { defaultValue: 'All Grades' })}</option>
                    {uniqueGrades.map((g) => (
                        <option key={g} value={g}>
                            {t('gradebook:classFilters.gradeN', { defaultValue: `Grade ${g}`, n: g })}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>{t('gradebook:classFilters.subject', { defaultValue: 'Subject' })}</label>
                <select value={selectedSubjectFilter} onChange={(e) => onSubjectFilterChange(e.target.value)}>
                    <option value="">{t('gradebook:classFilters.allSubjects', { defaultValue: 'All Subjects' })}</option>
                    {uniqueSubjects.map((s) => (
                        <option key={s._id} value={s._id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>{t('gradebook:classFilters.class', { defaultValue: 'Class' })}</label>
                <select value={selectedClassId} onChange={(e) => onClassChange(e.target.value)}>
                    {filteredClasses.length === 0 && (
                        <option value="">{t('gradebook:classFilters.noClasses', { defaultValue: 'No classes match' })}</option>
                    )}
                    {filteredClasses.map((c) => (
                        <option key={c._id} value={c._id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default GradebookClassFilters;
