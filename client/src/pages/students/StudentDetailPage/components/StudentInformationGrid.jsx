import { format } from 'date-fns';
import { HiOutlineMail, HiOutlinePhone } from 'react-icons/hi';

const formatDateValue = (value, dateFormat = 'MMMM d, yyyy') => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return format(parsed, dateFormat);
};

const buildAddressText = (address) => {
    if (!address) return 'N/A';
    const parts = [
        address.street,
        address.city,
        address.state,
        address.zipCode,
        address.country
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'N/A';
};

const ParentCard = ({ label, name, phone, email }) => (
    <div className="parent-card">
        <h4>{label}</h4>
        <p className="parent-name">{name || 'N/A'}</p>
        {phone && (
            <div className="contact-item">
                <HiOutlinePhone />
                <span>{phone}</span>
            </div>
        )}
        {email && (
            <div className="contact-item">
                <HiOutlineMail />
                <span>{email}</span>
            </div>
        )}
        {!phone && !email && <p className="text-muted mb-0">No contact details.</p>}
    </div>
);

const StudentInformationGrid = ({ student }) => {
    if (!student) return null;

    const hasEnrollmentHistory = Array.isArray(student.classEnrollmentHistory)
        && student.classEnrollmentHistory.length > 0;

    const hasParentInfo = Boolean(
        student.parentInfo?.fatherName ||
        student.parentInfo?.motherName ||
        student.parentInfo?.fatherPhone ||
        student.parentInfo?.motherPhone ||
        student.parentInfo?.fatherEmail ||
        student.parentInfo?.motherEmail
    );

    return (
        <div className="detail-grid">
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Personal Information</h3>
                </div>
                <div className="info-list">
                    <div className="info-item">
                        <span className="info-label">Date of Birth</span>
                        <span className="info-value">{formatDateValue(student.dateOfBirth)}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Age</span>
                        <span className="info-value">
                            {student.age ? `${student.age} years` : 'N/A'}
                        </span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Gender</span>
                        <span className="info-value text-capitalize">
                            {student.gender || 'N/A'}
                        </span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Class</span>
                        <span className="info-value">{student.currentClass?.name || 'Unassigned'}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Academic Year</span>
                        <span className="info-value">{student.academicYear || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Enrollment Date</span>
                        <span className="info-value">{formatDateValue(student.enrollmentDate)}</span>
                    </div>
                </div>
            </div>

            {hasEnrollmentHistory && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Enrollment History</h3>
                    </div>
                    <div className="enrollment-history-table-wrap">
                        <table className="enrollment-history-table">
                            <thead>
                                <tr>
                                    <th>Academic Year</th>
                                    <th>Class</th>
                                    <th>Left</th>
                                </tr>
                            </thead>
                            <tbody>
                                {student.classEnrollmentHistory.map((entry, index) => (
                                    <tr key={`${entry.academicYear || 'year'}-${index}`}>
                                        <td>{entry.academicYear || '—'}</td>
                                        <td>{entry.class?.name || '—'}</td>
                                        <td>{formatDateValue(entry.leftAt, 'MMM d, yyyy')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Parent/Guardian Information</h3>
                </div>
                {hasParentInfo ? (
                    <div className="parent-cards">
                        <ParentCard
                            label="Father"
                            name={student.parentInfo?.fatherName}
                            phone={student.parentInfo?.fatherPhone}
                            email={student.parentInfo?.fatherEmail}
                        />
                        <ParentCard
                            label="Mother"
                            name={student.parentInfo?.motherName}
                            phone={student.parentInfo?.motherPhone}
                            email={student.parentInfo?.motherEmail}
                        />
                    </div>
                ) : (
                    <p className="text-muted mb-0">No parent or guardian details have been added.</p>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Address</h3>
                </div>
                <p className="address-text">{buildAddressText(student.address)}</p>
            </div>
        </div>
    );
};

export default StudentInformationGrid;
