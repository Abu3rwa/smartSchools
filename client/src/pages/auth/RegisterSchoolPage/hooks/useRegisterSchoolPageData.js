import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    registerSchool,
    selectSchoolLoading,
    selectSchoolError,
    clearSchoolError
} from '../../../../store/slices/schoolSlice';
import { REDIRECT_DELAY_MS, createInitialFormData } from '../constants';
import {
    buildLoginRedirectPath,
    mapFormDataToRegisterPayload,
    validateRegisterForm
} from '../utils/registerSchoolPagePresentation';

const useRegisterSchoolPageData = () => {
    const { t } = useTranslation(['auth']);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const loading = useSelector(selectSchoolLoading);
    const serverError = useSelector(selectSchoolError);

    const [formData, setFormData] = useState(createInitialFormData);
    const [localError, setLocalError] = useState('');
    const [success, setSuccess] = useState(false);

    const error = localError || serverError;

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((prev) => ({ ...prev, [name]: value }));
        if (error) {
            setLocalError('');
            dispatch(clearSchoolError());
        }
    };

    const handleBack = () => {
        navigate('/');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const validationError = validateRegisterForm(formData, {
            passwordsDoNotMatch: t('auth:register.validation.passwordsDoNotMatch')
        });
        if (validationError) {
            setLocalError(validationError);
            return;
        }

        const result = await dispatch(registerSchool(mapFormDataToRegisterPayload(formData)));

        if (registerSchool.fulfilled.match(result)) {
            setSuccess(true);
            toast.success(t('auth:register.toast.schoolRegistered'));
            setTimeout(() => {
                navigate(buildLoginRedirectPath(result.payload.slug));
            }, REDIRECT_DELAY_MS);
        }
    };

    return {
        formData,
        error,
        loading,
        success,
        handleChange,
        handleSubmit,
        handleBack
    };
};

export default useRegisterSchoolPageData;
