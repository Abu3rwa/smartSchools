import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { HiOutlineEye, HiOutlineX } from 'react-icons/hi';
import {
    selectUser,
    selectIsImpersonating,
    selectIsReadOnlySupportPreview,
    stopImpersonation,
} from '../../../store/slices/authSlice';

const ImpersonationBanner = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('layout.header');
    const user = useSelector(selectUser);
    const isImpersonating = useSelector(selectIsImpersonating);
    const isReadOnlyPreview = useSelector(selectIsReadOnlySupportPreview);

    if (!isImpersonating) return null;

    const handleStopPreview = async () => {
        try {
            await dispatch(stopImpersonation()).unwrap();
            if (isReadOnlyPreview) toast.success('Support preview ended.');
        } catch (error) {
            toast.error(typeof error === 'string' ? error : 'Could not end the preview cleanly.');
        }
    };

    return (
        <div className="impersonation-banner">
            <div className="impersonation-banner-content">
                <HiOutlineEye size={18} />
                <span>
                    {isReadOnlyPreview
                        ? `READ-ONLY SUPPORT PREVIEW — viewing ${user?.fullName || `${user?.firstName} ${user?.lastName}`} as ${user?.role}. Changes are blocked and this session is audited.`
                        : t('impersonation.viewing', {
                            name: user?.fullName || `${user?.firstName} ${user?.lastName}`,
                            role: user?.role,
                        })}
                </span>
            </div>
            <button
                className="impersonation-stop-btn"
                onClick={handleStopPreview}
            >
                <HiOutlineX size={14} />
                {isReadOnlyPreview ? 'Exit preview' : t('impersonation.stop')}
            </button>
        </div>
    );
};

export default ImpersonationBanner;
