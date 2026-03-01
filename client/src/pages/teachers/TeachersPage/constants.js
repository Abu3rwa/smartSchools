export const DEFAULT_TEACHER_PASSWORD = 'Teacher@123';

export const createDefaultTeacherFormData = () => ({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: DEFAULT_TEACHER_PASSWORD,
    department: '',
    qualification: '',
    subjects: []
});

export const createDefaultAssignmentRow = () => ({
    classId: '',
    subjectId: '',
    isClassTeacher: false
});

export const createDefaultAssignments = () => [createDefaultAssignmentRow()];
