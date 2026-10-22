import { format } from 'date-fns';

export const canCreateAssignmentsForUser = (user) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'teacher') return true;
    return Array.isArray(user.permissions) && user.permissions.includes('create_assignments');
};

const toClassDoc = (item) => (item && item.class ? item.class : item);

const dedupeById = (items) => {
    const seen = new Set();
    return items.filter((item) => {
        const id = item?._id ? String(item._id) : '';
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};

// A class is stored once per academic year under the same generated name
// ("Grade 5-T"), so shared selects must stay inside the year the page shows.
// Rows whose year is unknown are kept, and a year that matches nothing falls
// back to the unscoped list so the select never empties.
const scopeToAcademicYear = (items, academicYear) => {
    if (!academicYear) return items;
    const scoped = items.filter((item) => !item?.academicYear
        || String(item.academicYear) === String(academicYear));
    return scoped.length > 0 ? scoped : items;
};

// Two years can still collide when no year is selected, so a repeated name is
// labelled with its year instead of being shown twice as the same option.
const labelRepeatedNames = (items) => {
    const counts = new Map();
    items.forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
    return items.map((item) => (counts.get(item.name) > 1
        ? { ...item, optionLabel: `${item.name} (${item.academicYear || '-'})` }
        : item));
};

export const getAvailableClasses = ({ userRole, myClasses, classes, academicYear }) => {
    if (userRole === 'teacher' && Array.isArray(myClasses) && myClasses.length > 0) {
        return labelRepeatedNames(scopeToAcademicYear(
            dedupeById(myClasses.map(toClassDoc).filter(Boolean)),
            academicYear
        ));
    }
    return labelRepeatedNames(scopeToAcademicYear(dedupeById(classes || []), academicYear));
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

export const sortGradeStudentsByName = (students = []) => {
    return [...students].sort((a, b) => {
        const firstNameOrder = (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' });
        if (firstNameOrder !== 0) return firstNameOrder;
        return (a.lastName || '').localeCompare(b.lastName || '', undefined, { sensitivity: 'base' });
    });
};

export const normalizeGradeStudentsFromClassStudents = (classStudents = []) => {
    return sortGradeStudentsByName(classStudents.map((student) => ({
        id: student._id,
        studentId: student.studentId || '',
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim()
    })));
};

export const formatAssignmentDueDate = (dueDate) => {
    return dueDate ? format(new Date(dueDate), 'yyyy-MM-dd') : '-';
};
