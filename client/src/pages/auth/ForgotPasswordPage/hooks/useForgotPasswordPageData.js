import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import { ENDPOINTS } from '../constants';
import {
    getSubmitErrorMessage,
    validateForgotPasswordEmail
} from '../utils/forgotPasswordPagePresentation';

const useForgotPasswordPageData = () => {
    const { t } = useTranslation(['auth']);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();

        const validationError = validateForgotPasswordEmail(email, {
            missingEmail: t('auth:forgotPassword.messages.missingEmail')
        });
        if (validationError) {
            toast.error(validationError);
            return;
        }

        setLoading(true);
        try {
            const response = await api.post(ENDPOINTS.forgotPassword, { email });

            if (response.data.success) {
                setSubmitted(true);
                toast.success(t('auth:forgotPassword.messages.success'));
            }
        } catch (error) {
            toast.error(getSubmitErrorMessage(error, {
                submitError: t('auth:forgotPassword.messages.submitError')
            }));
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
