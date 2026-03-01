export const validateRegisterForm = (formData) => {
    if (formData.adminPassword !== formData.confirmPassword) {
        return 'Passwords do not match';
    }

    return '';
};

export const mapFormDataToRegisterPayload = (formData) => ({
    schoolName: formData.schoolName,
    adminName: formData.adminName,
    adminEmail: formData.adminEmail,
    adminPassword: formData.adminPassword,
    estimatedStudents: Number.parseInt(formData.estimatedStudents, 10)
});

export const buildLoginRedirectPath = (slug) => `/login/${slug}`;
