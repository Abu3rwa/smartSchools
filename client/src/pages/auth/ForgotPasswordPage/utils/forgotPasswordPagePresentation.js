import { MESSAGES } from '../constants';

export const validateForgotPasswordEmail = (email) => {
    if (!email) {
        return MESSAGES.missingEmail;
    }

    return '';
};

export const getSubmitErrorMessage = (error) => {
    return error.response?.data?.message || MESSAGES.submitError;
};
