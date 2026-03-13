export const validateRegisterForm = (formData, messages = {}) => {
    if (formData.adminPassword !== formData.confirmPassword) {
        return messages.passwordsDoNotMatch || 'Passwords do not match';
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
