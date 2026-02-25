import { HiOutlineExclamation } from 'react-icons/hi';
import AttendanceDetailsModal from './components/AttendanceDetailsModal';
import AttendanceList from './components/AttendanceList';
import AttendancePageHeader from './components/AttendancePageHeader';
import AttendanceStatsGrid from './components/AttendanceStatsGrid';
import AttendanceStatusChartCard from './components/AttendanceStatusChartCard';
import AttendanceViewControls from './components/AttendanceViewControls';
import useAdminAttendanceController from './hooks/useAdminAttendanceController';
import './AdminAttendancePage.css';

const AdminAttendancePage = () => {
    const {
        attendanceData,
        classes,
        clearFilters,
        closeDetailsModal,
        dateRangeText,
        error,
        fetchAttendanceData,
        filters,
        formatDateTime,
        formatTime,
        handleExport,
        handleViewDetails,
        hasActiveFilters,
        loading,
        navigateDate,
        selectedAttendance,
        setFilters,
        setViewMode,
        showDetailsModal,
        stats,
        statusChartData,
        subjects,
        teachers,
        viewMode
    } = useAdminAttendanceController();

    if (loading) {
        return (
            <div className="attendance-loading">
                <div className="spinner"></div>
                <p>Loading attendance data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="attendance-error">
                <HiOutlineExclamation size={48} />
                <h3>Error loading attendance</h3>
                <p>{error}</p>
                <button onClick={fetchAttendanceData} className="btn btn-primary">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="admin-attendance-page">
            <AttendancePageHeader onExport={handleExport} onRefresh={fetchAttendanceData} />

            <AttendanceStatsGrid stats={stats} />

            <AttendanceStatusChartCard statusChartData={statusChartData} />

            <AttendanceViewControls
                classes={classes}
                dateRangeText={dateRangeText}
                filters={filters}
                navigateDate={navigateDate}
                setFilters={setFilters}
                setViewMode={setViewMode}
                subjects={subjects}
                teachers={teachers}
                viewMode={viewMode}
            />

            <AttendanceList
                attendanceData={attendanceData}
                clearFilters={clearFilters}
                formatDateTime={formatDateTime}
                formatTime={formatTime}
                hasActiveFilters={hasActiveFilters}
                onViewDetails={handleViewDetails}
            />

            <AttendanceDetailsModal
                formatDateTime={formatDateTime}
                onClose={closeDetailsModal}
                selectedAttendance={selectedAttendance}
                show={showDetailsModal}
            />
        </div>
    );
};

export default AdminAttendancePage;
