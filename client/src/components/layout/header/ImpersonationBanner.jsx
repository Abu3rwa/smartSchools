import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineEye, HiOutlineX } from 'react-icons/hi';
import {
    selectUser,
    selectIsImpersonating,
    stopImpersonation,
} from '../../../store/slices/authSlice';

const ImpersonationBanner = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('layout.header');
    const user = useSelector(selectUser);
    const isImpersonating = useSelector(selectIsImpersonating);

    if (!isImpersonating) return null;

    return (
        <div className="impersonation-banner">
            <div className="impersonation-banner-content">
                <HiOutlineEye size={18} />
                <span>
                    {t('impersonation.viewing', {
                        name: user?.fullName || `${user?.firstName} ${user?.lastName}`,
                        role: user?.role,
                    })}
                </span>
            </div>
            <button
                className="impersonation-stop-btn"
                onClick={() => dispatch(stopImpersonation())}
            >
                <HiOutlineX size={14} />
                {t('impersonation.stop')}
            </button>
        </div>
    );
};

export default ImpersonationBanner;
