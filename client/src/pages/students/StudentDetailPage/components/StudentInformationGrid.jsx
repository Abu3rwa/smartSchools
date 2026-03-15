import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { HiOutlineMail, HiOutlinePhone } from 'react-icons/hi';

const formatDateValue = (value, locale, dateFormat = 'MMMM d, yyyy', fallback = 'N/A') => {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    if (locale) {
        try {
            return new Intl.DateTimeFormat(locale, {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            }).format(parsed);
        } catch (error) {
            // Fallback to date-fns formatter if locale formatting fails.
        }
    }
    return format(parsed, dateFormat);
};

const buildAddressText = (address, fallback = 'N/A') => {
    if (!address) return fallback;
    const parts = [
        address.street,
        address.city,
        address.state,
        address.zipCode,
        address.country
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : fallback;
};

const ParentCard = ({ label, name, phone, email, emptyLabel, noContactLabel }) => (
    <div className="parent-card">
        <h4>{label}</h4>
        <p className="parent-name">{name || emptyLabel}</p>
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
        {!phone && !email && <p className="text-muted mb-0">{noContactLabel}</p>}
    </div>
);

const StudentInformationGrid = ({ student }) => {
    const { t, i18n } = useTranslation(['students']);
    if (!student) return null;
    const na = t('detail.common.na');

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
                    <h3 className="card-title">{t('detail.info.personalInformation')}</h3>
                </div>
                <div className="info-list">
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.dateOfBirth')}</span>
                        <span className="info-value">{formatDateValue(student.dateOfBirth, i18n.language, 'MMMM d, yyyy', na)}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.age')}</span>
                        <span className="info-value">
                            {student.age ? t('detail.info.ageYears', { count: student.age }) : na}
                        </span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.gender')}</span>
                        <span className="info-value text-capitalize">
                            {student.gender ? t(`genders.${String(student.gender).toLowerCase()}`, { defaultValue: student.gender }) : na}
                        </span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.class')}</span>
                        <span className="info-value">{student.currentClass?.name || t('detail.info.unassigned')}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.academicYear')}</span>
                        <span className="info-value">{student.academicYear || na}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.enrollmentDate')}</span>
                        <span className="info-value">{formatDateValue(student.enrollmentDate, i18n.language, 'MMMM d, yyyy', na)}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">{t('detail.info.email', { defaultValue: 'Email' })}</span>
                        <span className="info-value">{student.email || student.studentEmail || na}</span>
                    </div>
                </div>
            </div>

            {hasEnrollmentHistory && (
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">{t('detail.info.enrollmentHistory')}</h3>
                    </div>
                    <div className="enrollment-history-table-wrap">
                        <table className="enrollment-history-table">
                            <thead>
                                <tr>
                                    <th>{t('detail.info.academicYear')}</th>
                                    <th>{t('detail.info.class')}</th>
                                    <th>{t('detail.info.left')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {student.classEnrollmentHistory.map((entry, index) => (
                                    <tr key={`${entry.academicYear || 'year'}-${index}`}>
                                        <td>{entry.academicYear || t('detail.common.dash')}</td>
                                        <td>{entry.class?.name || t('detail.common.dash')}</td>
                                        <td>{formatDateValue(entry.leftAt, i18n.language, 'MMM d, yyyy', t('detail.common.dash'))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">{t('detail.info.parentGuardianInformation')}</h3>
                </div>
                {hasParentInfo ? (
                    <div className="parent-cards">
                        <ParentCard
                            label={t('detail.info.father')}
                            name={student.parentInfo?.fatherName}
                            phone={student.parentInfo?.fatherPhone}
                            email={student.parentInfo?.fatherEmail}
                            emptyLabel={na}
                            noContactLabel={t('detail.info.noContactDetails')}
                        />
                        <ParentCard
                            label={t('detail.info.mother')}
                            name={student.parentInfo?.motherName}
                            phone={student.parentInfo?.motherPhone}
                            email={student.parentInfo?.motherEmail}
                            emptyLabel={na}
                            noContactLabel={t('detail.info.noContactDetails')}
                        />
                    </div>
                ) : (
                    <p className="text-muted mb-0">{t('detail.info.noParentDetails')}</p>
                )}
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">{t('detail.info.address')}</h3>
                </div>
                <p className="address-text">{buildAddressText(student.address, na)}</p>
            </div>
        </div>
    );
};

export default StudentInformationGrid;
