import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { googleLoginCallback } from '../../../../store/slices/authSlice';
import { AUTH_CALLBACK_ROUTES } from '../constants';
import {
    getAuthCallbackParams,
    getLoginErrorRedirectPath
} from '../utils/authCallbackPagePresentation';

const useAuthCallbackPageData = () => {
    const { t } = useTranslation(['auth']);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const { token, isNew, error } = getAuthCallbackParams(searchParams);
        void isNew;
        const authFailedMessage = t('auth:authCallback.messages.authenticationFailed');

        if (error) {
            navigate(getLoginErrorRedirectPath(error, authFailedMessage));
            return;
        }

        if (!token) {
            navigate(AUTH_CALLBACK_ROUTES.login);
            return;
        }

        dispatch(googleLoginCallback(token))
            .unwrap()
            .then((data) => {
                const role = data?.user?.role;
                navigate(
                    role === 'super_admin'
                        ? AUTH_CALLBACK_ROUTES.admin
                        : AUTH_CALLBACK_ROUTES.portal
                );
            })
            .catch((authError) => {
                navigate(getLoginErrorRedirectPath(authError, authFailedMessage));
            });
    }, [dispatch, navigate, searchParams, t]);
};

export default useAuthCallbackPageData;
