export const buildStudentAccountRemovalUpdate = () => ({
    $set: {
        user: null,
        firstName: 'Former',
        lastName: 'Student',
        dateOfBirth: new Date('1970-01-01T00:00:00.000Z'),
        gender: 'other',
        status: 'inactive',
        parentInfo: {},
        address: {},
        medicalInfo: {},
        previousSchool: {},
        currentClass: null,
        enrolledClasses: [],
        notes: '',
        photoUrl: null,
    },
    $unset: {
        email: 1,
        studentEmail: 1,
    },
});

export const buildTeacherAccountRemovalUpdate = (teacherId) => ({
    $set: {
        employeeId: `FORMER-${teacherId}`,
        isActive: false,
        assignedClasses: [],
        address: {},
        emergencyContact: {},
        qualification: '',
        specialization: '',
        departmentName: '',
    },
});
