import { useTranslation } from 'react-i18next';

const GradebookFilters = ({
    selectedSubject,
    onSubjectChange,
    selectedMonth,
    onMonthChange,
    subjects,
    months
}) => {
    const { t } = useTranslation(['gradebook']);

    return (
        <div className="gradebook-filters">
            <div className="form-group">
                <label>{t('gradebook:filters.subject')}</label>
                <select value={selectedSubject} onChange={(event) => onSubjectChange(event.target.value)}>
                    <option value="">{t('gradebook:filters.selectSubject')}</option>
                    {subjects.map((subject) => (
                        <option key={subject._id} value={subject._id}>
                            {subject.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>{t('gradebook:filters.month')}</label>
                <select value={selectedMonth} onChange={(event) => onMonthChange(Number(event.target.value))}>
                    {months.map((month) => (
                        <option key={month.value} value={month.value}>
                            {t(`gradebook:months.${month.value}`, { defaultValue: month.label })}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default GradebookFilters;
