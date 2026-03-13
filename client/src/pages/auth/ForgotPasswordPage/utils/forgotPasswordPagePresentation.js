export const validateForgotPasswordEmail = (email, messages = {}) => {
    if (!email) {
        return messages.missingEmail || 'Please enter your email address';
    }

    return '';
};

export const getSubmitErrorMessage = (error, messages = {}) => {
    return error.response?.data?.message || messages.submitError || 'Failed to send reset link';
};
