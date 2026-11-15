import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineCheckCircle, HiOutlineExclamation, HiOutlineUsers } from 'react-icons/hi';
import SectionCard from './SectionCard';
import { getInitial } from '../utils/teacherDashboardPresentation';

const AtRiskCard = ({ students, loading, error }) => {
    const { t } = useTranslation(['dashboard']);

    let body;
    if (loading) {
        body = (
            <div>
                {[0, 1].map((row) => (
                    <div className="td-skrow" key={row}>
                        <div className="td-sk" style={{ width: 30, height: 30, borderRadius: '50%' }} />
                        <div className="td-skrow-body">
                            <div className="td-sk" style={{ height: 12, width: '52%' }} />
                            <div className="td-sk" style={{ height: 9, width: '34%', marginTop: 6 }} />
                        </div>
                        <div className="td-sk" style={{ width: 42, height: 18, borderRadius: 99 }} />
                    </div>
                ))}
            </div>
        );
    } else if (error) {
        body = (
            <div className="td-empty err">
                <i><HiOutlineExclamation size={20} /></i>
                <p>{t('dashboard:teacherDashboard.analytics.loadError')}</p>
            </div>
        );
    } else if (students.length === 0) {
        body = (
            <div className="td-empty">
                <i><HiOutlineCheckCircle size={20} /></i>
                <p>{t('dashboard:teacherDashboard.analytics.atRiskEmpty')}</p>
            </div>
        );
    } else {
        body = (
            <div className="td-risk">
                {students.map((student) => (
                    <Link
                        to={`/portal/grades/student/${student.studentId}`}
                        className="td-riskrow"
                        key={student.studentId}
                    >
                        <span className="td-init" aria-hidden="true">{getInitial(student.studentName)}</span>
                        <div className="td-riskmeta">
                            <div className="td-riskname">{student.studentName}</div>
                            <div className="td-riskclass">{student.className}</div>
                        </div>
                        <span className="td-score">{`${Math.round(student.avgPercentage)}%`}</span>
                    </Link>
                ))}
            </div>
        );
    }

    return (
        <SectionCard
            title={t('dashboard:teacherDashboard.analytics.atRiskStudents')}
            icon={HiOutlineUsers}
            tone="red"
            badge={<span className="td-count">{loading || error ? '—' : students.length}</span>}
        >
            {body}
        </SectionCard>
    );
};

export default AtRiskCard;