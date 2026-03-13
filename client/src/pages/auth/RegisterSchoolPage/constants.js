export const ESTIMATED_STUDENTS_OPTIONS = [
    { value: '25', labelKey: 'auth:register.form.estimatedOptions.25' },
    { value: '50', labelKey: 'auth:register.form.estimatedOptions.50' },
    { value: '100', labelKey: 'auth:register.form.estimatedOptions.100' },
    { value: '200', labelKey: 'auth:register.form.estimatedOptions.200' },
    { value: '500', labelKey: 'auth:register.form.estimatedOptions.500' },
    { value: '1000', labelKey: 'auth:register.form.estimatedOptions.1000' }
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
