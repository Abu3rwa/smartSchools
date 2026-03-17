import { STATUS_OPTIONS } from '../constants';
import { useTranslation } from 'react-i18next';

const AssignmentsFilters = ({
    selectedClass,
    onClassChange,
    selectedSubject,
    onSubjectChange,
    selectedStatus,
    onStatusChange,
    availableClasses,
    availableSubjects
}) => {
    const { t } = useTranslation(['assignments']);

    const uniqueClasses = Array.from(
        new Map((availableClasses || []).map((item) => [String(item?._id || ''), item])).values()
    ).filter((item) => item?._id);

    const uniqueSubjects = Array.from(
        new Map((availableSubjects || []).map((item) => [String(item?._id || ''), item])).values()
    ).filter((item) => item?._id);

    return (
        <div className="filters card">
            <div className="filters-grid">
                <div className="form-group">
                    <label>{t('assignments:filters.class')}</label>
                    <select value={selectedClass} onChange={(event) => onClassChange(event.target.value)}>
                        <option value="">{t('assignments:filters.selectClass')}</option>
                        {uniqueClasses.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('assignments:filters.subject')}</label>
                    <select value={selectedSubject} onChange={(event) => onSubjectChange(event.target.value)}>
                        <option value="">{t('assignments:filters.allSubjects')}</option>
                        {uniqueSubjects.map((item) => (
                            <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('assignments:filters.status')}</label>
                    <select value={selectedStatus} onChange={(event) => onStatusChange(event.target.value)}>
                        {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                                {t(`assignments:status.${status}`, { defaultValue: status })}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default AssignmentsFilters;
