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

export const formatStudentClassLabel = (student) => {
    const studentClass = student?.currentClass;
    if (!studentClass || typeof studentClass !== 'object') return 'Not assigned';
    const parts = [
        studentClass.name,
        studentClass.grade ? `Grade ${studentClass.grade}` : null,
        studentClass.section ? `Section ${studentClass.section}` : null
    ].filter(Boolean);
    return parts.join(' • ');
};

export const getStudentClassId = (student) => {
    if (!student?.currentClass) return '';
    return typeof student.currentClass === 'object'
        ? student.currentClass._id
        : student.currentClass;
};
