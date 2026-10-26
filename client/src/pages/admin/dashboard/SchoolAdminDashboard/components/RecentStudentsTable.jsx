import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowRight } from 'react-icons/hi';

/**
 * Five newest students as a compact table.
 */
export default function RecentStudentsTable({ students }) {
    const { t, i18n } = useTranslation(['adminDashboard']);
    const isRtl = i18n.dir() === 'rtl';
    const rows = Array.isArray(students) ? students : [];

    return (
        <section className="admin-panel admin-panel-table">
            <div className="admin-panel-head">
                <h2 className="admin-panel-title">{t('adminDashboard:recentStudents.title')}</h2>
                <Link to="/portal/students" className="admin-text-link">
                    {t('adminDashboard:common.viewAll')}
                    <HiOutlineArrowRight size={15} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                </Link>
            </div>

            {rows.length > 0 ? (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">{t('adminDashboard:recentStudents.columns.student')}</th>
                                <th scope="col">{t('adminDashboard:recentStudents.columns.id')}</th>
                                <th scope="col">{t('adminDashboard:recentStudents.columns.class')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((student) => (
                                <tr key={student._id}>
                                    <td>
                                        <Link to={`/portal/students/${student._id}`} className="admin-table-name">
                                            {student.name}
                                        </Link>
                                    </td>
                                    <td className="admin-table-muted">{student.studentId}</td>
                                    <td>
                                        {student.className ? (
                                            <span className="admin-pill">{student.className}</span>
                                        ) : (
                                            <span className="admin-table-muted">
                                                {t('adminDashboard:common.unassigned')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="admin-panel-empty">{t('adminDashboard:recentStudents.empty')}</p>
            )}
        </section>
    );
}
