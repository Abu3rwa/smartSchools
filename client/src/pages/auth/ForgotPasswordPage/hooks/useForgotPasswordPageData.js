import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import { ENDPOINTS, MESSAGES } from '../constants';
import {
    getSubmitErrorMessage,
    validateForgotPasswordEmail
} from '../utils/forgotPasswordPagePresentation';

const useForgotPasswordPageData = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();

        const validationError = validateForgotPasswordEmail(email);
        if (validationError) {
            toast.error(validationError);
            return;
        }

        setLoading(true);
        try {
            const response = await api.post(ENDPOINTS.forgotPassword, { email });

            if (response.data.success) {
                setSubmitted(true);
                toast.success(MESSAGES.success);
            }
        } catch (error) {
            toast.error(getSubmitErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const handleSendAnotherLink = () => {
        setSubmitted(false);
        setEmail('');
    };

    return {
        email,
        setEmail,
        loading,
        submitted,
        handleSubmit,
        handleSendAnotherLink
    };
};

export default useForgotPasswordPageData;
