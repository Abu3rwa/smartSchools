import { format } from 'date-fns';

export const canCreateAssignmentsForUser = (user) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'teacher') return true;
    return Array.isArray(user.permissions) && user.permissions.includes('create_assignments');
};

export const getAvailableClasses = ({ userRole, myClasses, classes }) => {
    if (userRole === 'teacher' && Array.isArray(myClasses) && myClasses.length > 0) {
        const seen = new Set();
        return myClasses
            .map((item) => item.class)
            .filter((classItem) => classItem && !seen.has(classItem._id) && (seen.add(classItem._id), true));
    }
    return classes;
};

export const getAvailableSubjects = ({ userRole, selectedClass, myClasses, classes, subjects }) => {
    if (userRole === 'teacher' && selectedClass && Array.isArray(myClasses) && myClasses.length > 0) {
        const seen = new Set();
        return myClasses
            .filter((item) => (item.class?._id || item.class)?.toString() === selectedClass)
            .map((item) => item.subject)
            .filter((subject) => subject && !seen.has(subject._id) && (seen.add(subject._id), true));
    }
    if (userRole === 'teacher' && !selectedClass) return [];
    if (!selectedClass) return subjects;

    const classDoc = classes.find((item) => item._id === selectedClass);
    if (!classDoc?.subjects) return subjects;
    return classDoc.subjects.map((item) => item.subject).filter(Boolean);
};

export const normalizeGradeStudentsFromClassStudents = (classStudents = []) => {
    return classStudents.map((student) => ({
        id: student._id,
        studentId: student.studentId || '',
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim()
    }));
};

export const formatAssignmentDueDate = (dueDate) => {
    return dueDate ? format(new Date(dueDate), 'yyyy-MM-dd') : '-';
};
