import { Link } from 'react-router-dom';
import {
    HiOutlineArrowLeft,
    HiOutlineDownload,
    HiOutlineMail
} from 'react-icons/hi';

const GradeReportHeader = ({
    studentId,
    student,
    academicYear,
    sending,
    onSendReport
}) => {
    return (
        <>
            <Link to={`/portal/students/${studentId}`} className="back-link">
                <HiOutlineArrowLeft />
                Back to Student
            </Link>

            <div className="report-header">
                <div className="student-info">
                    <div className="avatar-lg">
                        {student?.firstName?.charAt(0)}
                        {student?.lastName?.charAt(0)}
                    </div>
                    <div>
                        <h1>Grade Report</h1>
                        <p className="student-name">{student?.firstName} {student?.lastName}</p>
                        <p className="meta-info">
                            {student?.studentId} • {student?.currentClass?.name} • {academicYear}
                        </p>
                    </div>
                </div>

                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={onSendReport} disabled={sending}>
                        <HiOutlineMail />
                        {sending ? 'Sending...' : 'Send to Parent'}
                    </button>
                    <button className="btn btn-primary">
                        <HiOutlineDownload />
                        Download PDF
                    </button>
                </div>
            </div>
        </>
    );
};

export default GradeReportHeader;
