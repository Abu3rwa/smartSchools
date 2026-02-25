import { HiOutlineDownload, HiOutlineRefresh } from 'react-icons/hi';

const AttendancePageHeader = ({ onExport, onRefresh }) => {
    return (
        <div className="page-header">
            <div className="header-content">
                <h1>Attendance Management</h1>
                <p>Monitor and manage attendance across all classes</p>
            </div>
            <div className="header-actions">
                <button className="btn btn-secondary" onClick={onRefresh}>
                    <HiOutlineRefresh size={20} />
                    Refresh
                </button>
                <button className="btn btn-secondary" onClick={onExport}>
                    <HiOutlineDownload size={20} />
                    Export Report
                </button>
            </div>
        </div>
    );
};

export default AttendancePageHeader;
