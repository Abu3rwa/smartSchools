import { Link } from 'react-router-dom';
import {
    HiOutlineArrowLeft,
    HiOutlinePrinter
} from 'react-icons/hi';
import {
    formatDateInputValue,
    formatWeekRangeLabel
} from '../utils/weeklyReportPresentation';

const WeeklyReportHeader = ({
    classId,
    className,
    academicYear,
    selectedWeek,
    onWeekChange,
    weekStart,
    weekEnd,
    onPrint
}) => {
    return (
        <>
            <Link to={`/portal/classes/${classId}`} className="back-link">
                <HiOutlineArrowLeft /> Back to Class
            </Link>

            <div className="report-header">
                <div>
                    <h1>Weekly Class Report</h1>
                    <p className="subtitle">{className} • {academicYear}</p>
                    <p className="text-muted">{formatWeekRangeLabel({ weekStart, weekEnd })}</p>
                </div>
                <div className="header-actions">
                    <input
                        type="date"
                        value={formatDateInputValue(selectedWeek)}
                        onChange={(event) => onWeekChange(new Date(event.target.value))}
                        className="date-picker"
                    />
                    <button className="btn btn-primary" onClick={onPrint}>
                        <HiOutlinePrinter /> Print Report
                    </button>
                </div>
            </div>
        </>
    );
};

export default WeeklyReportHeader;
