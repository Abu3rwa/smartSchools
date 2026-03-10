import { HiOutlineCheck, HiOutlineExclamation, HiOutlineX } from 'react-icons/hi';

export const getSeverityBadge = (severity) => {
    const colors = {
        low: 'badge-success',
        medium: 'badge-warning',
        high: 'badge-danger',
        critical: 'badge-critical'
    };
    return colors[severity] || 'badge-secondary';
};

export const getStatusBadge = (status) => {
    const colors = {
        open: 'badge-danger',
        in_progress: 'badge-warning',
        resolved: 'badge-success',
        closed: 'badge-secondary'
    };
    return colors[status] || 'badge-secondary';
};

export const getIncidentTypeIcon = (type) => {
    if (type === 'positive') return <HiOutlineCheck className="text-success" />;
    if (type === 'major_infraction') return <HiOutlineExclamation className="text-danger" />;
    return <HiOutlineX className="text-warning" />;
};

export const formatTokenLabel = (value = '') =>
    String(value || '')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

export const getTranslatedValue = (t, keyPrefix, value) =>
    t(`${keyPrefix}.${value}`, {
        defaultValue: formatTokenLabel(value)
    });

export const formatStudentClassLabel = (student, t) => {
    const studentClass = student?.currentClass;
    if (!studentClass || typeof studentClass !== 'object') {
        return t('behaviorManagement:common.notAssigned');
    }
    const parts = [
        studentClass.name,
        studentClass.grade
            ? t('behaviorManagement:common.gradeValue', { grade: studentClass.grade })
            : null,
        studentClass.section
            ? t('behaviorManagement:common.sectionValue', { section: studentClass.section })
            : null
    ].filter(Boolean);
    return parts.join(' • ');
};

export const getStudentClassId = (student) => {
    if (!student?.currentClass) return '';
    return typeof student.currentClass === 'object'
        ? student.currentClass._id
        : student.currentClass;
};
