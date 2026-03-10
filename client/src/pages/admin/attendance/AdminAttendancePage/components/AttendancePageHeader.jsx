import { HiOutlineDownload, HiOutlineRefresh } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AttendancePageHeader = ({ onExport, onRefresh }) => {
    const { t } = useTranslation(['adminAttendance']);

    return (
        <div className="page-header">
            <div className="header-content">
                <h1>{t('adminAttendance:header.title')}</h1>
                <p>{t('adminAttendance:header.subtitle')}</p>
            </div>
            <div className="header-actions">
                <button className="btn btn-secondary" onClick={onRefresh}>
                    <HiOutlineRefresh size={20} />
                    {t('adminAttendance:actions.refresh')}
                </button>
                <button className="btn btn-secondary" onClick={onExport}>
                    <HiOutlineDownload size={20} />
                    {t('adminAttendance:actions.exportReport')}
                </button>
            </div>
        </div>
    );
};

export default AttendancePageHeader;
