export const ESTIMATED_STUDENTS_OPTIONS = [
    { value: '25', label: 'Up to 25' },
    { value: '50', label: 'Up to 50' },
    { value: '100', label: 'Up to 100' },
    { value: '200', label: 'Up to 200' },
    { value: '500', label: 'Up to 500' },
    { value: '1000', label: '500+' }
];

export const REDIRECT_DELAY_MS = 2000;

export const createInitialFormData = () => ({
    schoolName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    estimatedStudents: '50'
});
