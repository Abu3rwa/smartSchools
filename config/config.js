export default {
    // Academic year settings
    academicYear: {
        current: '2025-2026',
        startMonth: 8, // September (0-indexed would be 8)
        endMonth: 5    // June
    },

    // Grade calculation settings
    grades: {
        passingPercentage: 40,
        gradeScale: [
            { min: 90, max: 100, grade: 'A+', gpa: 4.0 },
            { min: 80, max: 89, grade: 'A', gpa: 3.7 },
            { min: 70, max: 79, grade: 'B+', gpa: 3.3 },
            { min: 60, max: 69, grade: 'B', gpa: 3.0 },
            { min: 50, max: 59, grade: 'C+', gpa: 2.7 },
            { min: 40, max: 49, grade: 'C', gpa: 2.0 },
            { min: 0, max: 39, grade: 'F', gpa: 0.0 }
        ]
    },

    // Semester configuration
    semesters: {
        first: { startMonth: 8, endMonth: 12, name: 'First Semester' },
        second: { startMonth: 1, endMonth: 5, name: 'Second Semester' }
    },

    // User roles
    roles: {
        ADMIN: 'admin',
        TEACHER: 'teacher',
        PARENT: 'parent',
        STUDENT: 'student'
    },

    // Grade types
    gradeTypes: {
        DAILY: 'daily',
        WEEKLY: 'weekly',
        MONTHLY_TEST: 'monthly_test',
        SEMESTER_EXAM: 'semester_exam'
    }
};
